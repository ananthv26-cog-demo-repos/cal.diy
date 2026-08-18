# Slot Waitlist — Deferred

- **Attendee locale for emails.** `WaitlistEntry` stores no locale, so all four emails render in
  `en`. Timezone is honoured. Fixing this means adding a column to the #16 migration.
- **`expireStaleOffers` does not cascade.** The sweep's backstop transitions stale offers but does
  not release reservations or offer the next attendee; the normal `expireOffer` path does both. A
  missed expiry task therefore frees the slot on the next sweep pass rather than immediately.
- **Playwright suite unexecuted.** `apps/web/playwright/waitlist.e2e.ts` has not been run to
  completion — it needs a booted app.
- **No rendered-UI verification** of the Booker affordance, claim page, leave page or host
  settings.
- **Host-visible attendee email at MEMBER level.** `listForEventType` uses `eventType.read`, so
  team members — not just owners/admins — can see waitlisted attendees' email addresses.
- **`main` CI baseline.** The stack cannot go green while `check-prisma-migrations.yml` is invalid
  YAML on `main` and `Security Audit` fails on critical advisories in the unchanged dependency
  tree. Both are preexisting and out of this feature's scope.
