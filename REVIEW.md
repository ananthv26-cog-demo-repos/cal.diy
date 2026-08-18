# Review Guidance

Guidance for reviewers (human or automated) of pull requests in this repo. Engineering rules live in
[AGENTS.md](AGENTS.md) and [agents/rules/](agents/rules/); this file says what a *review* should
focus on, in priority order.

Biome owns formatting and generic lint. Do not spend review comments on anything Biome already
enforces.

## How to review

1. State what the PR does and which parts of the system it touches (web app, API v2, tRPC, Prisma,
   app-store, embeds).
2. Check the change actually does what its description claims, and that its scope matches the title.
3. Walk the blocking checks below. Report findings by severity, with file/line and a concrete fix.
4. Skip CI noise, unrelated refactor suggestions, and style nits unless asked.

Ordering, not a cap: report blocking findings first and never drop one to stay short, but state
should-fix items and nits compactly so they don't crowd out the blocking tier. If a file is
generated (`*.generated.*`, `packages/prisma/migrations/**`, `yarn.lock`, `i18n.lock`), do not
review its contents.

## Blocking — must be fixed before merge

### Data exposure and Prisma usage

- `credential.key` must never be selected, logged, or returned from a tRPC procedure, REST endpoint,
  webhook payload, or server component. This is the highest-severity class of bug in this repo.
- Flag `include:` in Prisma queries — use explicit `select`. `include` pulls every column of the
  relation, which leaks sensitive fields (credentials, tokens, attendee data) and slows queries.
- New raw queries (`$queryRaw`, `$executeRaw`) need parameterization and a reason why the query
  builder is insufficient.
- Database access belongs in `*Repository` classes only. Flag `@calcom/prisma` imports in
  `packages/features/**` non-repository files, `packages/trpc/**` handlers, `apps/web/**`, and
  `apps/api/v2/**` services/controllers.
- Prisma models/enums must not cross an architectural boundary into the client. Require a DTO from
  `packages/lib/dto/` (Zod-validated, string-literal unions instead of Prisma enums).

### Authorization and multi-tenancy

- Permission checks go in `page.tsx`, never `layout.tsx` (layouts do not re-run per navigation).
- Every query touching org-scoped data must be filtered by the caller's org/profile context (`upId`,
  `teamId`, `userId`) — not just by the resource id. A missing tenant filter is a cross-tenant data
  leak, not a nit.
- New tRPC procedures: confirm the correct authed/admin/org-admin middleware, not `publicProcedure`
  by default.
- Booking-adjacent endpoints reachable by unauthenticated attendees (booking, cancel, reschedule,
  seats, no-show) need explicit ownership/token checks.

### API stability

- `apps/api/v2` and API v1: no breaking changes to existing endpoints (removed/renamed fields,
  narrowed types, changed status codes, new required params). Ship a new versioned endpoint and keep
  the old one working.
- Controllers stay thin: validation + delegation to a service. Business logic in a controller is a
  change request.
- Imports into `apps/api/v2` from `@calcom/features` or `@calcom/trpc` must go through
  `@calcom/platform-libraries` re-exports, otherwise the build breaks on missing path mappings.
- If `docs/api-reference/v2/openapi.json` changed: `summary` fields short, no trailing period,
  American English.

### Scheduling and correctness hot paths

Changes under slot calculation, availability, booking limits, round-robin host selection, or
recurring events deserve the most scrutiny in the whole codebase:

- Timezone/DST correctness: no bare `dayjs()` arithmetic where the user's timezone matters; no
  assumption that a day is 24h or that offsets are stable.
- Nested loops over slots × hosts × busy times: flag O(n²) or worse, and hot-loop `dayjs`
  (`.add`/`.diff`/`.isBefore`/`.isAfter`) — prefer `.utc()`, native `Date`, or `.valueOf()`
  comparisons.
- Seated events, managed event types, and dry-run bookings are easy to break silently — ask whether
  each was considered when the change touches shared booking code.
- Slot locking (`SelectedSlots`) changes must not introduce double-booking or leaked locks.

### Type safety

- `as any`, `@ts-expect-error`, non-null `!` on untrusted data, and `getattr`-style dynamic access
  are change requests; ask for the correct type instead.
- Generated files (`*.generated.ts`) must not be hand-edited — regenerate via app-store-cli.
- Schema changes to `packages/prisma/schema.prisma` require a matching migration, and the migration
  must be reviewed for locking/backfill risk on large tables (`Booking`, `Attendee`,
  `SelectedCalendar`).

### Secrets

- No `.env` files, API keys, tokens, or real customer data in the diff, tests, or fixtures.

## Should fix

- **Tests**: behavior changes need Vitest coverage; booking/availability changes need timezone cases
  (`TZ=UTC`); user-facing flows need or update a Playwright spec. "Tested manually" is not enough for
  scheduling logic.
- **i18n**: all user-facing strings go through `t()` with keys added to
  `packages/i18n/locales/en/common.json`. Hardcoded English in JSX is a finding.
- **Errors**: `ErrorWithCode` (or `ErrorWithCode.Factory.*`) in services/repositories/utilities;
  `TRPCError` only inside tRPC routers. Messages should carry context (ids, dates), not
  "Booking failed".
- **Imports**: no barrel imports (`@calcom/ui` → `@calcom/ui/components/button`); `import type` for
  types; no new circular dependencies between packages.
- **Structure**: early returns over nested conditionals; composition over prop drilling; repository
  files suffixed `Repository`, services suffixed `Service` (PascalCase). The ban on `.service.ts`-style
  dot suffixes applies to *newly added* files only — existing ones are being migrated progressively, so
  don't flag a PR that merely touches them.
- **Comments**: comments must explain *why*. Ask for removal of comments that restate the code or
  narrate the diff ("now we also check X").
- **PR size**: >500 changed lines or >10 code files (excluding docs, lock files, generated files) —
  recommend a split by layer (migration → backend → UI → tests) or by feature boundary, and say
  where the seams are.
- **Feature flags**: new flags need seeding per
  [data-prisma-feature-flags](agents/rules/data-prisma-feature-flags.md), and a defined
  flag-off behavior.
- **App store integrations**: new apps follow the existing app template, keep credentials encrypted,
  and handle token refresh/revocation failures.

## Nits (mention at most briefly)

- Naming clarity, dead code, redundant state, `console.log` left behind.
- Missing `key` props, unstable dependency arrays, avoidable `useEffect`.
- Prefer `date-fns`/native `Date` over Day.js when timezone awareness is not needed.

Per [quality-thorough-code-review](agents/rules/quality-thorough-code-review.md), nits are still
expected to be addressed before merge — but state them once, compactly, and do not let them crowd
out the blocking findings.

## Areas that need extra care

| Area | Why |
| --- | --- |
| `packages/features/bookings/**`, `packages/features/availability/**` | Slot math, DST, double-booking risk |
| `packages/emails/**`, `packages/features/tasker/**` | Sends real email and runs background jobs; misfires are user-visible |
| `packages/app-store/**` | Credential handling and third-party token lifecycles |
| `packages/prisma/schema.prisma` + `migrations/**` | Locking, backfills, irreversible changes |
| `apps/api/v2/**` | Public contract — breaking changes hit external platform customers |
| `packages/embeds/**` | Ships to third-party sites; bundle size and global scope pollution |
| `packages/platform/atoms/**` | Consumed by platform customers; props are a public API |

## Out of scope for review comments

- Formatting, import ordering, quote style — Biome handles these.
- Pre-existing issues in untouched code, unless the PR makes them materially worse.
- Refactors of adjacent code the PR did not set out to change.
- CI flakiness and infrastructure failures — note them, don't review them.
