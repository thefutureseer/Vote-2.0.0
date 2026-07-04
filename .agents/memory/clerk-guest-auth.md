---
name: Clerk + guest/demo auth coexistence
description: How to add a self-issued "guest" identity alongside Clerk auth without breaking Clerk's request parsing.
---

When a product wants an anonymous "demo/guest" login option next to real Clerk-based sign-in, do not send the guest identity via the `Authorization: Bearer` header. Clerk's server middleware (`clerkMiddleware()` / `getAuth(req)`) inspects that header and tries to parse it as a Clerk session JWT — a fake bearer value can throw, log noise, or otherwise interfere.

**Why:** Clerk owns the `Authorization` header contract on any route it wraps. A guest ID is not a real session token, so overloading that header creates a fragile dependency on Clerk's internal error handling.

**How to apply:**
- Client: generate a guest ID with a clearly-namespaced format (e.g. `user_demo_XXXXXXXXXX`), persist it in localStorage, and send it via a custom header (e.g. `X-Demo-User-Id`) only on requests made while not Clerk-signed-in.
- Server: validate the custom header strictly against an ID-shape regex before trusting it (never accept arbitrary strings as a voter/user id). Resolve the effective identity with "real Clerk session id, else validated guest header, else unauthenticated" — real Clerk identity always wins if both are present.
- Any anti-abuse logic keyed on user id (double-vote checks, rate-limit alerts, batch flushers, etc.) should call the same resolver function so guest and real identities are treated uniformly.
- On the client, when a real Clerk session becomes active, proactively clear any lingering guest session (e.g. via a `useEffect` watching `isSignedIn`) to avoid dual-identity confusion in the UI.
