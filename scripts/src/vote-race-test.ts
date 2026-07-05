/**
 * Concurrency / race-condition test for the vote double-voting guard and the
 * batch queue's counting accuracy. Fires many simultaneous requests directly
 * at the running api-server (through the shared proxy) to try to break:
 *
 *  1. The double-vote guard: N concurrent requests from the SAME voter
 *     identity hitting the same poll must result in exactly ONE accepted
 *     vote (202) and N-1 rejections (403), even though they all arrive
 *     before the in-memory `pendingUserVotes` map or the DB write has a
 *     chance to "settle" sequentially.
 *  2. Batch counting accuracy: N concurrent requests from DISTINCT voter
 *     identities must all be accepted, and after the batch flush interval
 *     the poll's totalVotes must equal exactly N (no dropped or double
 *     counted votes).
 *
 * Run with: pnpm --filter @workspace/scripts run vote-race-test
 */

const BASE_URL = process.env.LOAD_TEST_BASE_URL ?? "http://localhost:80";
const FLUSH_WAIT_MS = 4000; // batch flusher runs every 3s; give it margin

interface Poll {
  id: string;
  options: { id: string; text: string; votes: number }[];
}

function randomDemoId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `user_demo_${out}`;
}

async function createPoll(question: string): Promise<Poll> {
  const res = await fetch(`${BASE_URL}/api/polls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, options: ["A", "B"] }),
  });
  if (!res.ok) throw new Error(`Failed to create poll: ${res.status} ${await res.text()}`);
  return res.json() as Promise<Poll>;
}

async function getPoll(pollId: string): Promise<Poll & { totalVotes: number }> {
  const res = await fetch(`${BASE_URL}/api/polls/${pollId}`);
  if (!res.ok) throw new Error(`Failed to fetch poll: ${res.status} ${await res.text()}`);
  return res.json() as Promise<Poll & { totalVotes: number }>;
}

async function castVote(
  pollId: string,
  optionId: string,
  demoUserId: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}/api/polls/${pollId}/votes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Demo-User-Id": demoUserId },
    body: JSON.stringify({ optionId }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The vote endpoint rate-limits to 3 requests/minute per IP, and this test
// script's requests all share one IP (no trust-proxy/X-Forwarded-For
// spoofing is honored by the server — verified: no `app.set("trust proxy", ...)`
// is configured, so req.ip is the real socket address, not attacker-
// controllable). That means at most 3 requests per test run can ever reach
// the double-vote guard itself; the rest are correctly rejected earlier by
// the rate limiter (429) and must not be counted as guard failures. We fire
// `concurrency` requests to also confirm the limiter itself holds under
// concurrent bursts, but the double-vote assertion only considers the
// requests that got past the limiter (202 or 403).
async function testSameVoterConcurrency(concurrency: number): Promise<boolean> {
  console.log(`\n=== Test 1: ${concurrency} concurrent votes from the SAME voter ===`);
  const poll = await createPoll(`Race test — same voter x${concurrency}`);
  const optionId = poll.options[0]!.id;
  const demoUserId = randomDemoId();

  const results = await Promise.all(
    Array.from({ length: concurrency }, () => castVote(poll.id, optionId, demoUserId)),
  );

  const accepted = results.filter((r) => r.status === 202).length;
  const rejected = results.filter((r) => r.status === 403).length;
  const rateLimited = results.filter((r) => r.status === 429).length;
  const other = results.filter((r) => ![202, 403, 429].includes(r.status));

  console.log(`  Accepted (202): ${accepted}`);
  console.log(`  Rejected as double-vote (403): ${rejected}`);
  console.log(`  Rate-limited (429): ${rateLimited}`);
  if (other.length > 0) {
    console.log(`  Unexpected statuses:`, other.map((r) => r.status));
  }

  await sleep(FLUSH_WAIT_MS);
  const finalPoll = await getPoll(poll.id);
  console.log(`  Final totalVotes after flush: ${finalPoll.totalVotes} (expected 1)`);

  const reachedGuard = accepted + rejected;
  const guardHeld = accepted === 1 && rejected === reachedGuard - 1 && finalPoll.totalVotes === 1;
  const limiterHeld = reachedGuard <= 3;
  const pass = guardHeld && limiterHeld && other.length === 0;

  console.log(
    `  Of the ${reachedGuard} requests that got past the rate limiter, exactly ${accepted} was accepted ` +
      `and ${rejected} were rejected as duplicates.`,
  );
  console.log(pass ? "  PASS: double-vote guard held under concurrency" : "  FAIL: double-vote guard was bypassed");
  return pass;
}

// The rate limiter's key is the IP alone (not IP+poll), so its 3/min budget
// is shared across every poll this script hits. We deliberately cap
// concurrency at the limiter's own budget here so this test isolates batch
// consolidation accuracy from the rate limiter (which Test 1 already
// exercises under a real burst). Requests are still fired concurrently
// (Promise.all), so this still stresses the in-memory queue/dedupe path —
// just at the same 3-per-window volume production traffic is capped to.
async function testDistinctVotersConcurrency(concurrency: number): Promise<boolean> {
  console.log(`\n=== Test 2: ${concurrency} concurrent votes from DISTINCT voters ===`);
  const poll = await createPoll(`Race test — distinct voters x${concurrency}`);
  const optionId = poll.options[0]!.id;

  const results = await Promise.all(
    Array.from({ length: concurrency }, () => castVote(poll.id, optionId, randomDemoId())),
  );

  const accepted = results.filter((r) => r.status === 202).length;
  const rateLimited = results.filter((r) => r.status === 429).length;
  const other = results.filter((r) => r.status !== 202 && r.status !== 429);

  console.log(`  Accepted (202): ${accepted}`);
  console.log(`  Rate-limited (429): ${rateLimited}`);
  if (other.length > 0) {
    console.log(`  Unexpected statuses:`, other.map((r) => r.status));
  }

  await sleep(FLUSH_WAIT_MS);
  const finalPoll = await getPoll(poll.id);
  console.log(`  Final totalVotes after flush: ${finalPoll.totalVotes} (expected ${accepted})`);

  const pass = accepted === concurrency && finalPoll.totalVotes === accepted;
  console.log(
    pass
      ? "  PASS: every accepted vote was counted exactly once (no drops/double-counts)"
      : "  FAIL: totalVotes does not match the number of accepted votes, or requests were unexpectedly rate-limited",
  );
  return pass;
}

async function main() {
  console.log(`Running vote race-condition tests against ${BASE_URL}`);

  const resultA = await testSameVoterConcurrency(20);

  // The rate limiter's 3/min budget is shared per-IP across all polls, so
  // Test 1's burst consumes it. Wait out the window before Test 2 so it
  // isn't spuriously rate-limited before it can test anything meaningful.
  console.log("\nWaiting 65s for the per-IP rate-limit window to reset before Test 2...");
  await sleep(65_000);

  const resultB = await testDistinctVotersConcurrency(3);

  console.log("\n=== Summary ===");
  console.log(`Same-voter double-vote guard: ${resultA ? "PASS" : "FAIL"}`);
  console.log(`Distinct-voter counting accuracy: ${resultB ? "PASS" : "FAIL"}`);

  if (!resultA || !resultB) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Vote race test crashed:", err);
  process.exitCode = 1;
});
