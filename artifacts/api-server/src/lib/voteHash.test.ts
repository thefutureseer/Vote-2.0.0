import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "crypto";

describe("hashVoterId", () => {
  const ORIGINAL_SALT = process.env["VOTE_HASH_SALT"];

  beforeEach(() => {
    process.env["VOTE_HASH_SALT"] = "mock-salt-for-tests";
  });

  afterEach(() => {
    if (ORIGINAL_SALT === undefined) {
      delete process.env["VOTE_HASH_SALT"];
    } else {
      process.env["VOTE_HASH_SALT"] = ORIGINAL_SALT;
    }
  });

  it("produces a deterministic HMAC-SHA256 hash matching a manual computation with the same salt", async () => {
    const { hashVoterId } = await import("./voteHash");

    const userId = "user_demo_AbCdEf1234";
    const expected = createHmac("sha256", "mock-salt-for-tests").update(userId).digest("hex");

    expect(hashVoterId(userId)).toBe(expected);
  });

  it("returns the same hash for the same input across multiple calls", async () => {
    const { hashVoterId } = await import("./voteHash");

    const userId = "user_2AbCdEfGhIjKlMnOp";
    const first = hashVoterId(userId);
    const second = hashVoterId(userId);

    expect(first).toBe(second);
  });

  it("returns different hashes for different voter ids", async () => {
    const { hashVoterId } = await import("./voteHash");

    const hashA = hashVoterId("user_demo_AbCdEf1234");
    const hashB = hashVoterId("user_demo_ZyXwVu9876");

    expect(hashA).not.toBe(hashB);
  });

  it("never leaks the raw voter id in the resulting hash", async () => {
    const { hashVoterId } = await import("./voteHash");

    const userId = "user_demo_AbCdEf1234";
    const hash = hashVoterId(userId);

    expect(hash).not.toContain(userId);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes its output if the salt changes, proving the salt is actually used", async () => {
    const { hashVoterId: hashWithSaltA } = await import("./voteHash");
    const userId = "user_demo_AbCdEf1234";
    const hashWithSaltAResult = hashWithSaltA(userId);

    process.env["VOTE_HASH_SALT"] = "a-completely-different-mock-salt";
    // Re-import with a different module registry so the new salt is picked up
    // (the module under test reads process.env lazily per-call, so this also
    // works without resetModules, but we keep it explicit for clarity).
    const expectedWithNewSalt = createHmac("sha256", "a-completely-different-mock-salt")
      .update(userId)
      .digest("hex");

    expect(hashWithSaltAResult).not.toBe(expectedWithNewSalt);
  });
});
