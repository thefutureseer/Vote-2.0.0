import { createHmac } from "crypto";
import { logger } from "./logger";

// Dev-only fallback so the server doesn't crash when VOTE_HASH_SALT hasn't
// been configured yet. This value is NOT secret and must never be relied on
// in production — set the real VOTE_HASH_SALT secret before deploying.
const DEV_FALLBACK_SALT = "insecure-dev-only-vote-hash-salt-do-not-use-in-production";

let warnedFallback = false;

function getSalt(): string {
  const salt = process.env["VOTE_HASH_SALT"];
  if (salt) return salt;

  if (!warnedFallback) {
    warnedFallback = true;
    logger.warn(
      "VOTE_HASH_SALT is not set — falling back to an insecure development salt. " +
        "Set the VOTE_HASH_SALT secret before deploying to production.",
    );
  }
  return DEV_FALLBACK_SALT;
}

/**
 * Pseudonymizes a voter identity (Clerk user ID or demo/guest ID) into a
 * stable, one-way HMAC-SHA256 hash. This is what gets persisted in a poll's
 * `votedUserIds` array so the database can prove "this voter already voted"
 * (blocking double-voting) without ever storing — or being able to recover —
 * the underlying identity or how a specific person voted.
 */
export function hashVoterId(userId: string): string {
  return createHmac("sha256", getSalt()).update(userId).digest("hex");
}
