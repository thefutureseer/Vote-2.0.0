# Live Pulse (PulseVote)

A real-time voting app: users create polls, vote once per identity (Clerk account or guest/demo mode), and watch results update live via Socket.IO.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/voting-app run dev` — run the voting app frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm run test` — run unit tests (Vitest) across packages
- `pnpm --filter @workspace/scripts run load-test` — HTTP load test (read + vote-cast endpoints)
- `pnpm --filter @workspace/scripts run vote-race-test` — concurrency test for the double-vote guard and vote-counting accuracy
- Required env/secrets: `MONGODB_URI`, `SESSION_SECRET`, `VOTE_HASH_SALT`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express, MongoDB (Mongoose), Socket.IO for live vote updates
- Frontend: React + Vite, wouter, TanStack Query, react-hook-form + Zod, Clerk for auth
- Validation: Zod
- API codegen: Orval (from OpenAPI spec)
- Testing: Vitest (unit), autocannon-based custom scripts (load/concurrency), Playwright via the `testing` skill's `runTest()` (E2E)

## Where things live

- `artifacts/api-server` — Express API, MongoDB models, vote hashing/queueing logic
- `artifacts/voting-app` — React frontend (home/poll-list, create-poll, poll-view pages)
- `scripts/src/load-test.ts`, `scripts/src/vote-race-test.ts` — load and concurrency test scripts for the vote pipeline

## Architecture decisions

- Voter identity anonymization: `votedUserIds` on a Poll never stores a raw Clerk/demo user ID. `artifacts/api-server/src/lib/voteHash.ts` HMAC-SHA256-hashes every voter ID (using the `VOTE_HASH_SALT` secret) right at the point it's persisted (queue.ts's batch flush) and right at the point it's checked (polls.ts's double-vote guard). This keeps the anti-cheat check 100% accurate while making the stored value non-reversible to a real identity.
- Double-voting on `/api/polls/:pollId/votes` returns **403** (not 409) — "Double-voting detected" — to reflect the hashed-identity check. The frontend (`poll-view.tsx`) treats 403 as "already voted" and shows the same friendly UX as a fresh vote.
- Guest/demo voters authenticate via a custom `X-Demo-User-Id` header (not `Authorization: Bearer`) so Clerk's own JWT parsing on that header is never triggered by a fake token. See `.agents/memory/clerk-guest-auth.md`.

## Product

- Create a poll with a question and 2–10 options.
- Vote once per identity — either a signed-in Clerk account or a lightweight "guest/demo" identity stored in the browser.
- Watch results update live (Socket.IO) as votes come in, with a home page showing recent polls and aggregate stats (total polls, total votes, most active poll).
- Double-voting (from the same account/guest identity, even across devices/browsers) is blocked server-side and surfaced in the UI as a friendly "Already voted" state rather than an error.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The vote-cast rate limiter is keyed by IP only (not IP+poll), so its budget (3/min) is shared across every poll a visitor touches, not per-poll.
- Rate-limit/security alert logs intentionally store the raw IP, pollId, and userId (unhashed) — do not anonymize these, unlike `votedUserIds` on a Poll.
- Always run `pnpm run typecheck` and `pnpm run test` after backend changes to the vote pipeline; use `pnpm --filter @workspace/scripts run vote-race-test` to re-verify the double-vote guard under real concurrency after touching `queue.ts`, `polls.ts`, or `voteHash.ts`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
