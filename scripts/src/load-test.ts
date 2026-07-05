/**
 * HTTP load test against the running api-server, exercising the read paths
 * (poll listing, stats) and the vote-cast path under sustained concurrent
 * load. Uses autocannon to generate the load and reports latency/throughput.
 *
 * Run with: pnpm --filter @workspace/scripts run load-test
 */
import autocannon, { type Result } from "autocannon";

const BASE_URL = process.env.LOAD_TEST_BASE_URL ?? "http://localhost:80";
const DURATION_SECONDS = Number(process.env.LOAD_TEST_DURATION ?? 10);
const CONNECTIONS = Number(process.env.LOAD_TEST_CONNECTIONS ?? 20);

function randomDemoId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `user_demo_${out}`;
}

async function createPoll(question: string): Promise<{ id: string; options: { id: string }[] }> {
  const res = await fetch(`${BASE_URL}/api/polls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, options: ["A", "B", "C"] }),
  });
  if (!res.ok) throw new Error(`Failed to create poll: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ id: string; options: { id: string }[] }>;
}

function printSummary(label: string, result: Result): void {
  console.log(`\n=== ${label} ===`);
  console.log(`  Requests: ${result.requests.total} total, ${result.requests.average.toFixed(1)}/sec avg`);
  console.log(`  Latency (ms): p50=${result.latency.p50} p99=${result.latency.p99} max=${result.latency.max}`);
  console.log(`  Throughput: ${(result.throughput.average / 1024).toFixed(1)} KB/sec avg`);
  console.log(`  Errors: ${result.errors}, Timeouts: ${result.timeouts}`);
  const non2xx = Object.entries(result as unknown as Record<string, number>).filter(([k]) =>
    /^[3-5]\d\d$/.test(k),
  );
  if (non2xx.length > 0) {
    console.log(`  Non-2xx status codes:`, Object.fromEntries(non2xx));
  }
}

async function runReadLoadTest(): Promise<Result> {
  console.log(`\nRunning read-path load test (GET /api/polls, /api/polls/stats)...`);
  return autocannon({
    url: BASE_URL,
    connections: CONNECTIONS,
    duration: DURATION_SECONDS,
    requests: [{ method: "GET", path: "/api/polls" }, { method: "GET", path: "/api/polls/stats" }],
  });
}

async function runVoteLoadTest(): Promise<Result> {
  console.log(`\nCreating a dedicated poll for the vote-cast load test...`);
  const poll = await createPoll("Load test poll — vote throughput");
  const optionId = poll.options[0]!.id;

  console.log(`Running vote-cast load test (POST /api/polls/${poll.id}/votes)...`);
  console.log(
    `  Note: the vote endpoint rate-limits to 3/min per IP, so most requests here are ` +
      `expected to hit 429/403 quickly — this specifically stresses the rate limiter and ` +
      `the alert-logging path under load, not raw vote throughput.`,
  );

  return autocannon({
    url: `${BASE_URL}/api/polls/${poll.id}/votes`,
    connections: CONNECTIONS,
    duration: DURATION_SECONDS,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Demo-User-Id": randomDemoId(),
    },
    setupClient: (client: autocannon.Client) => {
      client.setBody(JSON.stringify({ optionId }));
    },
  });
}

async function main() {
  console.log(`Load testing ${BASE_URL} — duration=${DURATION_SECONDS}s connections=${CONNECTIONS}`);

  const readResult = await runReadLoadTest();
  printSummary("Read-path load test", readResult);

  const voteResult = await runVoteLoadTest();
  printSummary("Vote-cast load test (rate-limiter stress)", voteResult);

  const hadTransportErrors = readResult.errors > 0 || voteResult.errors > 0;
  if (hadTransportErrors) {
    console.log("\nWARNING: transport-level errors occurred during load testing — investigate before trusting throughput numbers.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Load test crashed:", err);
  process.exitCode = 1;
});
