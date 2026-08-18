# Slot Waitlist — Decisions

## Reserve-then-transition instead of one transaction

The spec asks for slot reservation and the `PENDING -> OFFERED` transition to share a
transaction. `SelectedSlots` and `WaitlistEntry` sit behind separate repositories that cannot
share a Prisma transaction, so the offer path reserves first, transitions conditionally, and
releases the reservation if the transition loses its race. The partial unique index still
guarantees at most one `OFFERED` entry per `(eventTypeId, startTime)`; a lost race degrades to a
released reservation, never to a double offer.

## Offers dispatched through Tasker, never inline

Cancellation, decline and reschedule only enqueue `offerNextWaitlistEntry` (ADR-004). Offer work
must not add latency to — or be able to fail — a booking mutation the user already committed.
Call sites are non-throwing and log; with the flag off or the event type not opted in, no task is
enqueued at all.

## Claim re-enters the normal booking pipeline

`claim` calls `RegularBookingService.createBooking` with the stored responses replayed into the
ordinary booking payload, rather than writing a booking directly. Waitlist bookings then get the
same validation, workflows, webhooks and calendar side effects as any other booking.

## Notifications are best-effort and always post-transition

Emails never gate the state machine: a send failure logs and the transition stands, so an SMTP
outage cannot turn a successful join into an error. Conversely, each notification is sent only
after the transition it describes has been won — a lost `OFFERED -> EXPIRED` race must not tell an
attendee their offer expired when it did not.

## The token is the credential

`offerToken` (32 random bytes, URL-safe) authenticates claim and leave for attendees who have no
account. It is excluded from every DTO and Prisma `select`, never logged, and never echoed back in
a response — it appears only inside the emailed link.

## The claim screen renders server state, not its URL

An earlier revision passed the event title, slot times and expiry as query parameters. That made
the confirmation screen attacker-editable, so `getOfferPreview` was added and the emailed link
carries nothing but the token.

## Leaving is confirmed by a click, not on page load

Email clients and link scanners prefetch URLs. A leave page that acted on load would silently
remove attendees who never clicked.

## Emails split from triggers (#18 / #19)

The combined change was 27 files. The templates are inert until something calls them, which makes
"emails first, senders second" a seam where both halves type-check and review independently.

## Waitlist UI split by audience (#21 / #22)

Attendee-facing (Booker, claim, leave) and host-facing (settings, list) surfaces share no
components, so splitting them kept both near the repo's size guideline.
