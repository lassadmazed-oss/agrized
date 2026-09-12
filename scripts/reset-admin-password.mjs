// Sets a new password for an existing staff account. Run it yourself:
//
//   npm run admin:password
//
// It asks for the email and the new password (typing is hidden). You can also pass
// --email and --password on the command line. The password is never printed, logged or stored.

import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

async function ask(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.trim();
}

function askHidden(question) {
  if (!stdin.isTTY) return ask(question);
  stdout.write(question);
  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk) => {
      const char = chunk.toString("utf8");
      if (char === "\r" || char === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(value);
      } else if (char === "") {
        stdout.write("\n");
        process.exit(1);
      } else if (char === "" || char === "\b") {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
  },
});

let email = values.email?.trim().toLowerCase();
if (!email) {
  email = (await ask("Email of the account: ")).toLowerCase();
}
if (!email) {
  console.error("An email is required.");
  process.exit(1);
}

let password = values.password;
if (password === undefined) {
  password = await askHidden("New password (typing is hidden): ");
  const again = await askHidden("Type it again: ");
  if (password !== again) {
    console.error("The two passwords do not match. Nothing was changed.");
    process.exit(1);
  }
}
if (password.length < 6) {
  console.error("The password must be at least 6 characters. Nothing was changed.");
  process.exit(1);
}
if (password.length < 10) {
  console.warn("Warning: this password is short. A Super Admin can read every client's personal data; use 10+ characters.");
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let user = null;
for (let page = 1; page <= 20 && !user; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error(`Could not list accounts: ${error.message}`);
    process.exit(1);
  }
  user = data.users.find((candidate) => candidate.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 200) break;
}

if (!user) {
  console.error(`No account found for ${email}.`);
  console.error('Create the first one with: npm run admin:create -- --email you@example.com --name "Your Name"');
  process.exit(1);
}

const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
if (error) {
  console.error(`Could not update the password: ${error.message}`);
  process.exit(1);
}

// AUD-03: password resets are recorded, even when done from the command line.
const { error: auditError } = await supabase.from("audit_logs").insert({
  action: "auth.password_reset",
  entity: "auth",
  entity_id: user.id,
  new_data: { email, via: "script" },
});
if (auditError) {
  console.warn(`Password updated, but the audit entry failed: ${auditError.message}`);
}

console.log(`Password updated for ${email}. Sign in at /admin/login.`);
