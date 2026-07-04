---
name: express-rate-limit IPv6 key generator error
description: express-rate-limit throws a startup ValidationError when a custom keyGenerator returns req.ip directly
---

When defining a custom `keyGenerator` for `express-rate-limit` (e.g. to rate-limit by IP on a specific route), do not return `req.ip` directly. The library validates that IPv6 addresses are normalized and throws `ERR_ERL_KEY_GEN_IPV6` at request time (surfaces as a crash on first request / boot in dev since the app builds+starts together) if you do.

**Why:** Raw IPv6 addresses have multiple valid string representations (e.g. differing zero-compression), which would let an attacker bypass the limit by varying the representation.

**How to apply:** Import `ipKeyGenerator` from `express-rate-limit` and wrap the IP: `keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown")`.
