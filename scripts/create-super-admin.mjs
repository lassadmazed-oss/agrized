// Creates the first Super Admin account of the Back Office.
//
//   npm run admin:create -- --email you@example.com --name "Your Name"
//
// A random temporary password is printed once. Sign in at /admin/login and change it right away.
// Refuses to run when a Super Admin already exists (add more staff from the Back Office instead).

import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    password: { type: "string" },
  },
});

const email = values.email?.trim().toLowerCase();
const fullName = values.name?.trim();
if (!email || !fullName) {
  console.error('Usage: npm run admin:create -- --email you@example.com --name "Your Name" [--password "your password"]');
  process.exit(1);
}

const chosenPassword = values.password;
if (chosenPassword !== undefined && chosenPassword.length < 6) {
  console.error("The password must be at least 6 characters.");
  process.exit(1);
}
if (chosenPassword !== undefined && chosenPassword.length < 10) {
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

const { count, error: countError } = await supabase
  .from("user_roles")
  .select("user_id", { count: "exact", head: true })
  .eq("role", "super_admin");
if (countError) {
  console.error(`Could not check existing admins: ${countError.message}`);
  process.exit(1);
}
if ((count ?? 0) > 0) {
  console.error("A Super Admin already exists. Add other staff from the Back Office (Users).");
  process.exit(1);
}

const password = chosenPassword ?? randomBytes(12).toString("base64url");
const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});
if (error || !data.user) {
  console.error(`Could not create the account: ${error?.message ?? "unknown error"}`);
  process.exit(1);
}

const { error: roleError } = await supabase.from("user_roles").insert({ user_id: data.user.id, role: "super_admin" });
if (roleError) {
  console.error(`Account created but the role could not be granted: ${roleError.message}`);
  process.exit(1);
}

console.log(`Super Admin created for ${email}`);
if (chosenPassword === undefined) {
  console.log(`Temporary password: ${password}`);
  console.log("Sign in at /admin/login and change this password right away.");
} else {
  console.log("Sign in at /admin/login with the password you chose.");
}
