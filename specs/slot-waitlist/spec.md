# Slot Waitlist Design

> Single-file spec. The repo template splits this across `design.md` / `decisions.md` /
> `implementation.md` (see [SPEC-WORKFLOW.md](../../SPEC-WORKFLOW.md)); those files should be created
> from `specs/_templates/` when implementation starts. Sections below map onto them 1:1.

## Overview

Let an attendee join a waitlist for a specific start time that is already unavailable, and
automatically offer that slot — first come, first served — to waitlisted people when it frees up. The
offer is a time-boxed claim link; if it expires unclaimed, the offer cascades to the next entry.

Status: **not-started**. Behind feature flag `slot-waitlist`, opt-in per event type.

## Problem Statement

When a popular slot is taken, the booker's only options today are to pick another time or to leave.
Hosts lose the booking entirely, and cancellations silently re-open slots that nobody is watching.
Attendees resort to polling the booking page. A waitlist converts cancellations — which are frequent
— back into bookings without any host action.

## User Stories

- As an attendee, I want to join the waitlist for a full slot so that I'm notified and can claim it if
  it opens up.
- As an attendee, I want a claim link that holds the slot briefly so that I'm not racing other people
  in the waitlist.
- As a host, I want to enable a waitlist per event type and cap its size so that I control exposure.
- As a host, I want to see who is waiting for which slot, and remove entries, so that I can manage
  demand manually.
- As an attendee, I want to leave the waitlist from any email I received so that I stop being
  notified.

## Non-Goals / Out of Scope

- Seated events (`EventType.seatsPerTimeSlot`) — the "slot is full" semantics differ; deferred.
- Recurring events and multi-slot waitlist entries.
- Round-robin fairness or priority ordering beyond FIFO by `createdAt`.
- Automatic booking on the attendee's behalf (offer requires an explicit claim).
- Waitlisting a whole day or date range rather than one exact start time.
- SMS/WhatsApp offer notifications (email only in v1).
- Payment-required and confirmation-required event types are supported only insofar as the claim
  re-enters the normal booking flow; no special-cased pre-authorization.

## Domain Model

A waitlist entry is a *request for one exact start time* on one event type, owned by an email.
Lifecycle:

```
PENDING ──offer──> OFFERED ──claim──> CLAIMED (terminal)
   │                  │
   │                  └──expiry/decline──> EXPIRED (terminal) ──> offer cascades to next PENDING
   └──unsubscribe/host removal/slot start passed──> CANCELLED (terminal)
```

Invariant: at most one `OFFERED` entry per (`eventTypeId`, `startTime`) at any moment. Enforced by a
partial unique index plus a transactional state transition, not by application-level checks alone.

## Technical Design

### Database Changes

`packages/prisma/schema.prisma` — one new model, one new enum, two new `EventType` columns.

```prisma
enum WaitlistEntryStatus {
  PENDING
  OFFERED
  CLAIMED
  EXPIRED
  CANCELLED
}

model WaitlistEntry {
  id            Int                 @id @default(autoincrement())
  uid           String              @unique
  eventTypeId   Int
  eventType     EventType           @relation(fields: [eventTypeId], references: [id], onDelete: Cascade)
  startTime     DateTime
  endTime       DateTime
  attendeeName  String
  attendeeEmail String
  attendeeTimeZone String
  // Responses to the event type's booking questions, replayed on claim
  responses     Json?
  status        WaitlistEntryStatus @default(PENDING)
  offerToken    String?             @unique
  offeredAt     DateTime?
  offerExpiresAt DateTime?
  claimedBookingId Int?             @unique
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  @@index([eventTypeId, startTime, status, createdAt])
  @@unique([eventTypeId, startTime, attendeeEmail])
}
```

Migration notes:

- New table plus two nullable/defaulted columns on `EventType` (`waitlistEnabled Boolean @default(false)`,
  `waitlistMaxSize Int?`) — additive, no backfill, safe on a large `EventType` table.
- The single-active-offer invariant needs a raw partial index in the migration SQL, since Prisma
  cannot express it:
  `CREATE UNIQUE INDEX "WaitlistEntry_single_active_offer" ON "WaitlistEntry" ("eventTypeId", "startTime") WHERE "status" = 'OFFERED';`
- `startTime`/`endTime` stored UTC, as elsewhere in the schema. `attendeeTimeZone` is only for
  rendering the offer email.

### Data Layer

- `packages/features/bookings/repositories/WaitlistEntryRepository.ts` (+ `IWaitlistEntryRepository.ts`),
  following `BookingRepository.ts`. Only this file touches Prisma. Methods:
  `create`, `findByUid`, `findByOfferToken`, `findNextPendingForSlot`, `countActiveForSlot`,
  `listForEventType`, `transitionStatus`, `expireStaleOffers`.
- `select` only — never `include`. `offerToken` is never selected into any DTO returned to a client.
- DTOs in `packages/lib/dto/WaitlistEntryDto.ts`: `WaitlistEntryDto`,
  `WaitlistEntryForHostDto` (adds attendee contact details), status as a string-literal union, not
  the Prisma enum. Zod-validated at the boundary.
- DI wiring mirrors `packages/features/bookings/di/BookingCancelService.module.ts`.

### Service Layer

`packages/features/bookings/services/WaitlistService.ts` — all business logic, no Prisma:

- `join({ eventTypeId, startTime, attendee, responses })`
  - Rejects if the event type has waitlist disabled, is a seated/recurring type, the slot is in the
    past, or `waitlistMaxSize` is reached.
  - Rejects if the slot is actually *bookable* — the caller should book instead. Availability is
    checked through the existing slot pipeline
    (`packages/trpc/server/routers/viewer/slots/isAvailable.handler.ts` / `util.ts`), never
    reimplemented.
  - Idempotent on (`eventTypeId`, `startTime`, `attendeeEmail`): re-joining returns the existing
    entry rather than erroring.
- `offerNextForSlot({ eventTypeId, startTime })`
  - Single transaction: verify the slot is genuinely open, pick the oldest `PENDING`, set `OFFERED`
    with a fresh `offerToken` and `offerExpiresAt = now + offerTtlMinutes`, and reserve the slot via
    the existing `SelectedSlots` reservation path so a walk-in booker cannot take it mid-offer.
  - Enqueues an `expireWaitlistOffer` task and sends the offer email.
  - Unique-violation on the partial index means someone else already offered — swallow and no-op.
- `claim({ offerToken })`
  - Validates token, status, and expiry; then delegates to the *existing* booking pipeline
    (`packages/features/bookings/lib/handleNewBooking`) with the stored responses. Booking creation is
    not duplicated here.
  - On success: `CLAIMED` + `claimedBookingId`; on booking failure: expire the offer and cascade.
- `expireOffer({ entryId })` → `EXPIRED`, release the slot reservation, then `offerNextForSlot`.
- `leave({ uid, token })` → `CANCELLED` (used by the email unsubscribe link).

Errors use `ErrorWithCode` / `ErrorWithCode.Factory.*` (`packages/lib/errors`), never `TRPCError`, per
[quality-error-handling](../../agents/rules/quality-error-handling.md).

### Trigger Points

Register a handler in `packages/features/bookings/lib/onBookingEvents/BookingEventHandlerService.ts`
so the waitlist reacts to slot-freeing events instead of hooking each call site:

| Event | Action |
| --- | --- |
| Booking cancelled (`handleCancelBooking.ts`) | `offerNextForSlot` for the vacated start time |
| Booking rescheduled away | `offerNextForSlot` for the original start time |
| Pending booking declined | `offerNextForSlot` |
| Offer TTL elapsed (tasker) | `expireOffer` → cascade |
| Slot start time passed (cron/tasker sweep) | mark remaining entries `CANCELLED` |

Offers are dispatched through `packages/features/tasker` (see `tasker/tasks`), not inline in the
cancel request, so cancellation latency and failure modes are unchanged.

### API Changes

tRPC — new router `packages/trpc/server/routers/viewer/waitlist/`, handler-per-file as elsewhere:

| Procedure | Auth | Notes |
| --- | --- | --- |
| `waitlist.join` | public (rate-limited) | Bookers are unauthenticated; rate limit by IP + email |
| `waitlist.claim` | public, token-scoped | Token is the only authorization; constant-time compare |
| `waitlist.leave` | public, token-scoped | Unsubscribe from email |
| `waitlist.listForEventType` | authed + event-type ownership | Host view; org/team scoped via `upId` |
| `waitlist.remove` | authed + event-type ownership | Host removes an entry |

Host-facing procedures must filter by the caller's profile/org context, not just `eventTypeId`.

API v2 (`apps/api/v2`) is **deferred to a follow-up**; when added, it is a new
`/v2/event-types/{id}/waitlist` resource — no changes to existing endpoints. Any
`@calcom/features` import needed there goes through `packages/platform/libraries/index.ts`.

### UI Changes

1. **Event type setting** — `apps/web/modules/event-types/components/tabs/advanced/EventAdvancedTab.tsx`:
   a `SettingsToggle` for "Enable waitlist" plus an optional max-size input, disabled with an
   explanatory tooltip for seated/recurring event types.
2. **Booker** — `packages/features/bookings/Booker/`: unavailable slots render a "Join waitlist"
   affordance when the event type has it enabled; joining reuses the existing booking-questions form
   and shows a confirmation state ("You're #3 in line").
3. **Claim page** — `apps/web/app/(booking-page-wrapper)/waitlist/[token]/`: shows the offered slot, a
   live countdown to `offerExpiresAt`, and Claim / Decline. Permission and token checks live in
   `page.tsx`, never `layout.tsx`.
4. **Host list** — a "Waitlist" section on the event type page listing entries with position,
   attendee, status, and a remove action.

All strings go through `t()` with keys added to `packages/i18n/locales/en/common.json`.

### Emails

New templates in `packages/emails/templates/`, registered in `email-manager.ts`, following
`attendee-scheduled-email.ts`:

- `attendee-waitlist-joined-email` — confirmation + leave link.
- `attendee-waitlist-offer-email` — claim link, expiry time in the attendee's timezone, leave link.
- `attendee-waitlist-offer-expired-email` — offer lapsed, still on the list.
- `attendee-waitlist-cancelled-email` — slot passed or host removed the entry.

Optional host digest is deferred (see Future Work).

### Configuration

- Feature flag `slot-waitlist` via `packages/features/flags` (seeded per
  [data-prisma-feature-flags](../../agents/rules/data-prisma-feature-flags.md)); flag off ⇒ join is
  rejected, no offers are dispatched, and the UI affordance is hidden.
- `offerTtlMinutes` constant, default 30, floored to the time remaining before `startTime`.
- `waitlistMaxSize` default cap (e.g. 20) applied when the host leaves it unset.

## Edge Cases

- **Race with a normal booker**: the offer holds a `SelectedSlots` reservation, so the slot cannot be
  taken while an offer is live. If the reservation cannot be acquired, no offer is made and the entry
  stays `PENDING`.
- **Two cancellations for the same slot** (e.g. a duplicate webhook): the partial unique index means
  the second `offerNextForSlot` no-ops instead of double-offering.
- **Claim after the host edited the event type** (duration, location, questions changed): re-validate
  against current event type config; if the stored responses no longer satisfy required fields, send
  the claimer through the booking form instead of a one-click claim.
- **Claim for a slot that is no longer available** (host manually blocked it): expire the offer with a
  "no longer available" email; do not cascade to the next entry for that slot.
- **Slot freed after `startTime` has passed**: no offers; sweep entries to `CANCELLED`.
- **DST**: entries store UTC instants; the offer email renders in `attendeeTimeZone`. Never compute
  the offer window by adding 24h/day arithmetic.
- **Confirmation-required event types**: a claim creates a `PENDING` booking; the entry is still
  `CLAIMED`. A later decline re-triggers `offerNextForSlot`.
- **Paid event types**: the claim redirects into the existing payment flow; the entry becomes
  `CLAIMED` only once the booking record exists, and an abandoned payment expires the offer normally.
- **Token security**: `offerToken` is a 32-byte random URL-safe string, unique-indexed, never logged,
  never returned by list endpoints, invalidated on any terminal transition.
- **Enumeration**: `join` responses must not reveal whether an email is already waitlisted for other
  slots.

## Testing

- Vitest unit tests for `WaitlistService` state machine: join validation, FIFO ordering, cascade on
  expiry, no-op on concurrent offer, claim-after-expiry rejection. Run with `TZ=UTC`.
- Integration test for `WaitlistEntryRepository` covering the partial unique index behavior under two
  concurrent offer attempts.
- Test that cancelling a booking enqueues exactly one offer task, and that `offerToken` never appears
  in any DTO or tRPC response shape.
- Playwright: enable waitlist → join from the Booker as attendee B → cancel A's booking → open the
  claim link → book → verify B has a booking and the entry is `CLAIMED`.
- Timezone case: attendee in `Pacific/Auckland` waitlisting a slot across a DST boundary renders the
  correct local expiry.

## Rollout

1. Ship schema + service behind the flag with no UI (dead code, no behavior change).
2. Enable the flag internally; enable the setting on a test event type; verify offer emails.
3. Enable per-org, then default on.

Reverting is a flag flip; the table can stay.

## PR Plan

Total estimate ~700 lines of implementation plus ~250 lines of tests — over the repo's 500-line /
10-file limit, so it ships as a series. Each PR is independently reviewable, and every PR up to #3 is
inert in production because the flag and the event-type toggle are off.

| # | Scope | Files | Est. lines | Reviewable alone? |
| --- | --- | --- | --- | --- |
| 1 | Schema + migration (incl. partial index) + `WaitlistEntryDto` + `WaitlistEntryRepository` + repo tests | ~6 | ~250 | Yes — data layer only, nothing calls it |
| 2 | `WaitlistService` state machine, DI wiring, tasker task, feature flag, unit tests | ~8 | ~300 | Yes — depends only on #1's repository interface |
| 3 | Trigger wiring (`onBookingEvents` handler) + email templates | ~7 | ~250 | Yes — flag-gated, no UI |
| 4 | tRPC router + Booker affordance + claim page + event-type setting + i18n + Playwright | ~10 | ~350 | Yes — first user-visible PR |

A later PR adds the API v2 resource.

### Should these be stacked PRs?

**Yes — stack #1 → #2 → #3 → #4** using
[GitHub's stacked pull requests](https://docs.github.com/en/pull-requests/how-tos/stacked-pull-requests).
The series is a textbook fit: strictly ordered, each PR compiles only on top of the previous one
(#2's service imports #1's repository interface; #4's router imports #2's service), and all four are
meant to land together bottom-up as one feature.

Mechanics:

- Branch each PR off the previous branch, not `main`: `devin/waitlist-01-schema` ← `main`,
  `devin/waitlist-02-service` ← `devin/waitlist-01-schema`, and so on. Only the bottom PR targets
  `main`.
- Cross-reference in each description ("2/4 of the slot waitlist, stacks on #N").
- Merge bottom-up. GitHub restacks the children automatically when a parent merges — do **not**
  manually rebase or merge between stacked branches. If the stack goes non-linear, use "Rebase stack"
  in the merge box once, when ready to merge, rather than after every change.
- Review comments and follow-up commits go to the PR that owns the code, not to a later branch in the
  stack.

Two caveats to accept up front:

- The migration in #1 merges before the code that uses it — intentional and safe here, since the
  change is purely additive.
- A schema change requested during review of #1 forces a restack of #2–#4. Keeping #1 minimal (table,
  index, DTO only) limits that risk.

An alternative — one long-lived `feature/slot-waitlist` branch with the four PRs merging into it, then
a single PR into `main` — is *not* recommended: the final PR into `main` would be ~700 lines and
unreviewable, defeating the purpose.

## Decisions to Record (ADRs)

- **ADR-001**: Separate `WaitlistEntry` table rather than reusing `Booking` with a new
  `BookingStatus`. A waitlist entry is not a booking (no slot held, no calendar event, multiple
  entries per slot); overloading `BookingStatus` would leak into every existing booking query.
- **ADR-002**: Claim-by-token with a TTL instead of auto-booking the first waitlisted person.
  Auto-booking creates no-shows and surprise calendar invites; the claim link keeps consent explicit.
- **ADR-003**: Reuse the existing `SelectedSlots` reservation to hold the slot during an offer rather
  than inventing a second locking mechanism.
- **ADR-004**: Offers dispatched via `tasker`, so cancellation latency and failure semantics are
  untouched.
- **ADR-005**: FIFO by `createdAt`. Priority/weighted ordering is deferred until asked for.

## Future Work

- Seated events (waitlist on the last seat) and recurring events.
- API v2 endpoints and webhook triggers (`WAITLIST_ENTRY_CREATED`, `WAITLIST_OFFER_SENT`).
- SMS/WhatsApp offers via the workflows system.
- Host digest email and a waitlist-demand insight ("12 people waited for slots you never opened").
- Attendee-facing "waitlist for any slot this week" range entries.
- Auto-claim opt-in for attendees who explicitly consent.
