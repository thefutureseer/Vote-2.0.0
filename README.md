# PulseVote [codename: vote 2.0.0] — Production-Grade Real-Time Voting Platform

PulseVote is a highly scalable, secure, real-time polling application built for high-throughput scenarios (like a poll going viral on social media). Anyone can create a poll, share the link, and watch votes roll in live—with zero lag and absolute protection against ballot-stuffing.

The architecture strictly decouples rapid web ingestion from heavy database persistence, utilizing a write-buffering pattern to absorb sudden traffic bursts while enforcing strict server-side identity locks.

## Core Features

*   **Scalable Poll Creation:** Spin up dynamic polls with a question and 2–10 customizable options.
*   **Frictionless Social Identity:** Armed with a Replit-managed Clerk core, supporting instant Google and GitHub Single Sign-On (SSO) alongside a seamless, passwordless "Explore as Demo User" pipeline for instant guest testing.
*   **Absolute Zero Double-Voting:** Eradicates client-side bypasses by tracking authenticated Clerk IDs and randomized unique guest IDs directly inside the database.
*   **Perimeter Spam Defense:** Uses automated network middleware to drop bot-attacks before they reach server memory or processing loops.
*   **Live WebSocket Visualizations:** Real-time Socket.io streams instantly animate results dashboard charts for every connected user without page refreshes.
*   **Dashboard Analytics:** The home page aggregates system-wide statistics, including total active polls, system-wide vote counts, and the trending most-active poll.

---

## Architectural Deep Dive

### High Availability Ingestion (The "Scale Engine")
When an authenticated user submits a vote, the system relies on an **Availability & Partition-Tolerance (AP)** model to optimize processing speed:

1.  **Fast Path Ingestion:** The incoming request hits the `POST /api/polls/:pollId/votes` endpoint. After identity verification, the vote is instantly appended to a local, server-bound in-memory queue array. 
2.  **Immediate Response:** The server immediately returns a `202 Accepted` status back to the client. The voter's UI unlocks in milliseconds.
3.  **Optimistic Real-Time Sync:** Concurrently, the server aggregates the memory state and immediately broadcasts the updated tally over a Socket.io event loop. Connected dashboards update instantly before a database write ever executes.
4.  **3-Second Bulk DB Flusher:** A server-side background interval worker wakes up every 3 seconds, drains the memory queue, groups the totals, and flushes them to MongoDB using a highly optimized, atomic single `bulkWrite` operation executing `$inc` (for counters) and `$push` (for logging identity strings) in bulk.

This saves your Replit container's CPU and prevents database connection pools from choking on sudden, simultaneous traffic bursts.

### Two-Tier Anti-Cheat Security

#### Layer 1: Velocity Gatekeeping (Rate Limiting)
The app guards its perimeter using an `express-rate-limit` middleware configuration on the voting endpoint. If a rogue agent or script spams the route more than **3 times per minute from a single IP**, the server instantly drops the connection with a `429 Too Many Requests` status, completely bypassing processing logic. 

Every blocked attack automatically creates a security flag document inside a specialized MongoDB `alerts` collection—capturing the target poll ID, timestamps, and offending IP for administrative logging.

#### Layer 2: Verified Identity Tracking
The source of truth for voting eligibility lives on the server, completely independent of local storage variables. The MongoDB Poll schema utilizes an absolute verification array:

```typescript
Poll {
  question: string;
  options: [{ id: string, text: string, votes: number }];
  totalVotes: number;
  votedUserIds: string[]; // Permanent server-side identity lock
  createdAt: Date;
} 
```
###Tech stack ecosystem 

LayerTechnology
FrontendReact + Vite, TypeScript, Tailwind CSS, shadcn/ui components
Identity/AuthClerk (Managed Replit Integration), Google & GitHub Production OAuth
Data FetchingTanStack Query + Orval (Auto-generated typed API hooks)
Real-Time InterfaceSocket.io (Client & Server streams)
Backend FrameworkExpress 5 (TypeScript) + express-rate-limit
Database / StorageMongoDB + Mongoose (Atomic bulkWrite configuration)
API/Validation ContractOpenAPI Spec (openapi.yaml) compiled to strict backend Zod Schemas
Client-Side RoutingWouter

### Workspace structure
artifacts/
  api-server/            Express API + Socket.io Server + Security Middlewares
    src/
      index.ts            Server bootloader, attaches WebSockets, initializes the 3s flusher
      routes/polls.ts      Poll definitions, Clerk auth guards, rate limiters + alert logging
      lib/db.ts            Mongoose engine schemas (Poll & Alert Models)
      lib/queue.ts         In-memory write array + atomic bulkWrite flush routine
      lib/socketio.ts      Socket.io broadcasting helpers
  
  voting-app/            React SPA Client Dashboard
    src/
      pages/home.tsx        Global analytics panel + active poll browser
      pages/create-poll.tsx  Dynamic multi-choice poll architect form
      pages/poll-view.tsx    Interactive voting view, CSS animated progress bars, Clerk controls
      lib/socket.ts          WebSocket socket listener instance

lib/
  api-spec/               OpenAPI contract (The single source of truth for schema validation)
  api-zod/                Auto-generated Zod validator middleware schemas (Backend)
  api-client-react/       Auto-generated TanStack Query data hooks (Frontend)
  
