# PulseVote [codename: vote 2.0.0] — Real-Time Voting Platform

PulseVote is a real-time polling app. Anyone can create a poll, share the link, and watch votes roll in live — results update instantly for every viewer via WebSockets, with no page refresh needed.

## What it does

- **Create polls** — ask a question with 2–10 answer options.
- **Vote** — cast a vote on any poll from a simple, mobile-friendly interface.
- **Watch live results** — every vote updates the results bar chart in real time for everyone viewing that poll, powered by Socket.io.
- **One vote per person (per browser)** — a `localStorage` flag prevents a visitor from voting twice on the same poll from the same browser.
- **Dashboard stats** — the home page shows total polls, total votes cast, and the most active poll.

## How it works

### Instant feedback, safe writes

When someone votes, the server doesn't make them wait on a database write. Instead:

1. The vote is validated (poll exists, option is valid) and immediately placed into an **in-memory queue**.
2. The server responds right away with `202 Accepted` — the voter sees their vote count instantly.
3. At the same moment, the server **optimistically broadcasts** the updated tally to everyone watching that poll over Socket.io, calculated from the in-memory state (before the database write even happens).
4. Every 3 seconds, a **background batch flusher** drains the queue, aggregates votes per poll/option, and applies them to MongoDB in a single efficient `$inc` (increment) operation per option — instead of one database write per vote.
5. After each flush, the server re-broadcasts the true database-confirmed counts, so all clients stay in sync even under heavy load.

This design means the app can absorb bursts of votes (e.g. a poll going viral) without hammering the database, while still feeling instant to the end user.

### Preventing duplicate votes

There's no login system, so anti-cheat is intentionally lightweight: once a browser votes on a poll, its poll ID is saved to `localStorage`. The UI then hides the voting form and shows results instead. This is a UX safeguard, not a security boundary — it stops accidental double-votes from the same browser, not determined abuse.

### Data model

Each poll is a single MongoDB document:

```
Poll {
  question: string
  options: [{ id, text, votes }]
  totalVotes: number
  createdAt: Date
}
```

Storing options as an embedded array (rather than a separate collection) keeps reads and vote increments cheap — a single document fetch/update per operation.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite, TypeScript, Tailwind CSS, shadcn/ui components |
| Data fetching | TanStack Query + auto-generated typed hooks (Orval) |
| Real-time | Socket.io (client & server) |
| Backend | Express 5 (TypeScript) |
| Database | MongoDB + Mongoose |
| Validation | Zod schemas, generated from an OpenAPI spec |
| Routing (frontend) | Wouter |

This app lives in a pnpm monorepo alongside other artifacts. The API contract is defined once in `lib/api-spec/openapi.yaml` and code-generated into typed Zod schemas (backend) and React Query hooks (frontend), so the client and server can never drift out of sync.

## Project structure

```
artifacts/
  api-server/            Express API + Socket.io + MongoDB
    src/
      index.ts            HTTP server bootstrap, Socket.io attach, starts the batch flusher
      routes/polls.ts      Poll CRUD + vote endpoint
      lib/db.ts            Mongoose schema/model, Mongo connection
      lib/queue.ts         In-memory vote queue + 3s batch flusher ($inc to Mongo)
      lib/socketio.ts      Socket.io singleton + broadcast helper

  voting-app/            React frontend (this is what users see)
    src/
      pages/home.tsx        Dashboard: stats + list of polls
      pages/create-poll.tsx  Poll creation form
      pages/poll-view.tsx    Voting UI + live results
      hooks/use-voted.ts     localStorage anti-cheat (has this browser voted on poll X?)
      lib/socket.ts          Socket.io client connection

lib/
  api-spec/               OpenAPI contract (source of truth for the API)
  api-zod/                Generated Zod validation schemas (backend)
  api-client-react/       Generated TanStack Query hooks (frontend)
```

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/polls` | List all polls |
| POST | `/api/polls` | Create a poll |
| GET | `/api/polls/stats` | Aggregate stats (total polls, total votes, most active poll) |
| GET | `/api/polls/:pollId` | Get a single poll |
| DELETE | `/api/polls/:pollId` | Delete a poll |
| POST | `/api/polls/:pollId/votes` | Cast a vote (returns `202 Accepted`, queued for batch write) |
| WS | `/socket.io` | Live poll update stream |

## Running locally

The app runs as two services, managed by Replit workflows:

- `pnpm --filter @workspace/api-server run dev` — API + Socket.io server
- `pnpm --filter @workspace/voting-app run dev` — frontend

Required environment variable:

- `MONGODB_URI` — MongoDB connection string (e.g. from MongoDB Atlas; requires network access opened to `0.0.0.0/0` since Replit uses dynamic IPs)

Useful commands:

- `pnpm run typecheck` — typecheck everything
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks/schemas after changing the OpenAPI spec

## Status

The MVP is complete and deployed: poll creation, voting, live WebSocket-driven results, the in-memory vote queue with batched database writes, and localStorage-based anti-cheat are all working end-to-end.
