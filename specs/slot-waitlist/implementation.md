# Slot Waitlist — Implementation Status

## Status: in-review

Implemented as GitHub stack #23, seven PRs, bottom-up. Every layer is behind the
`slot-waitlist` feature flag (seeded disabled) plus per-event-type `waitlistEnabled`.

## Completed

- [x] Data layer (#16) — `WaitlistEntry`, `WaitlistEntryStatus`, `EventType.waitlistEnabled` /
      `waitlistMaxSize`, migration, partial unique index enforcing one `OFFERED` entry per
      `(eventTypeId, startTime)`, DTOs that exclude `offerToken`, repository with conditional
      status transitions.
- [x] Service state machine (#17) — `join` / `offerNextForSlot` / `claim` / `expireOffer` /
      `leave`, FIFO by `createdAt`, slot reservation via `SelectedSlots`, `expireWaitlistOffer`
      tasker task, DI wiring, feature flag.
- [x] Notification emails (#18) — joined / offer / offer-expired / cancelled, registered in
      `email-manager.ts`, expiry rendered in the entry's `attendeeTimeZone`.
- [x] Booking triggers (#19) — cancellation, reschedule-away (original slot), decline, all
      dispatched through Tasker; `sweepWaitlist` backstop for missed expiries and past-start
      entries.
- [x] tRPC surface (#20) — public `join` / `claim` / `leave` / `getOfferPreview` (rate-limited),
      host `listForEventType` / `remove` (PBAC).
- [x] Attendee UI (#21) — Booker join affordance for unavailable slots, claim page, leave page.
- [x] Host UI (#22) — Advanced-tab settings, waitlist list with removal.

## Next Steps

1. Land the stack bottom-up.
2. Execute `apps/web/playwright/waitlist.e2e.ts` against a booted app — it has not been run to
   completion yet.
3. See `future-work.md` for what was deliberately deferred.

## Session Notes

### 2026-08-18

- Done: all seven layers implemented, reviewed and opened as stack #23.
- Blocked: CI cannot go green from this stack. `main` fails independently —
  `check-prisma-migrations.yml` is invalid YAML and `Security Audit` exits non-zero on critical
  advisories in the unchanged dependency tree. None of these branches touch `package.json`,
  `yarn.lock` or the workflows.
- Not verified: Playwright suite, and any rendered-UI verification of #21 / #22.
