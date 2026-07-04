---
name: Clerk GitHub (and other custom OAuth) SSO only configurable in Production
description: Replit-managed Clerk dev instances default to email/password + Google; GitHub/Apple/X etc. need OAuth credentials set up via the Auth pane, Production environment only
---

The Replit-managed Clerk whitelabel setup (`setupClerkWhitelabelAuth()`) provisions a shared dev instance that only ships Email/Password + Google out of the box. Adding GitHub (or other custom OAuth providers) requires the user to create an OAuth app on the provider's side and enter the Client ID/Secret into the provider's edit panel in Replit's **Auth pane → Configure → SSO providers → Production**.

**Why:** Custom OAuth credentials (needed for providers beyond the default Google) are only supported in the Production environment per Replit's Clerk integration — there's no dev-time equivalent, and no programmatic/API path for the agent to enable it.

**How to apply:** If a user asks for GitHub (or similar) SSO alongside Google, implement Google now, tell the user GitHub requires them to add OAuth credentials via the Auth pane before/after deploying to Production, and don't attempt to hack around it via env vars or Clerk API calls.
