// Drains the message queue once, by calling the app's dispatch endpoint.
//
//   npm run sms:dispatch                    → against http://localhost:3000
//   npm run sms:dispatch -- https://…       → against a deployed site
//   npm run sms:dispatch -- https://… 5     → at most 5 messages
//
// The sending itself lives in src/lib/sms.ts so there is one implementation, not two: this script only
// carries the secret. Reads NOTIFY_DISPATCH_SECRET from .env.

const secret = process.env.NOTIFY_DISPATCH_SECRET;
if (!secret) {
  console.error("NOTIFY_DISPATCH_SECRET is missing from .env. Add it, then restart the server so it picks it up.");
  process.exit(1);
}

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const limit = process.argv[3];
const url = new URL(`${base}/api/notifications/dispatch`);
if (limit) url.searchParams.set("limit", limit);

let response;
try {
  response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
} catch (cause) {
  console.error(`Could not reach ${url.origin}. Is the server running?`);
  console.error(String(cause));
  process.exit(1);
}

const body = await response.json().catch(() => ({ error: "The response was not JSON." }));

if (!response.ok) {
  console.error(`Dispatch refused (${response.status}): ${body.error ?? body.blocked ?? JSON.stringify(body)}`);
  process.exit(1);
}

console.log(`claimed ${body.claimed} · sent ${body.sent} · failed ${body.failed}`);
if (body.failed > 0) {
  console.log("Reasons are written to notification_outbox.last_error.");
}
