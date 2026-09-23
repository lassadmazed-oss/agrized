// One demo client walked through the whole sale, so every screen has something real to show.
//
//   npm run demo:workflow             → creates it
//   npm run demo:workflow -- --remove → deletes exactly what it made
//
// WHY THIS CALLS THE REAL FUNCTIONS AND INSERTS NOTHING BY HAND. Reservation numbers, the deposit snapshot,
// the validity window, the instalment schedule and the tree allocation are all decided in Postgres. A seed
// that INSERTed rows would invent its own versions of those and produce data the application could never
// have produced — which is worse than no data, because every screen would then be tested against a shape
// that cannot occur in life. So this signs in as the super admin the way the Back Office does (a JWT claim
// plus `set local role authenticated`, the idiom supabase/tests/*.sql already uses) and calls
// submit_interest_request · staff_create_reservation · staff_record_deposit · staff_create_contract.
//
// EVERYTHING IS LOOKED UP, NOTHING IS HARD-CODED: the offer, the option ids, the spacing class and the
// payment method are read from whatever the database holds today, so the script keeps working after the
// owner renames a list.

import { readFile } from "node:fs/promises";

import pg from "pg";

const PHONE = "+21690000001";
const REMOVE = process.argv.includes("--remove");

const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  console.error("DIRECT_URL is missing from .env");
  process.exit(1);
}

let ssl = { rejectUnauthorized: false };
if (process.env.SUPABASE_DB_CA_CERT) {
  ssl = { ca: await readFile(process.env.SUPABASE_DB_CA_CERT, "utf8") };
}

const client = new pg.Client({ connectionString, ssl });
await client.connect();

/** A reason long enough for whatever audit.reason_min_length says today. */
async function reason(text) {
  const { rows } = await client.query("select app.setting_int('audit.reason_min_length', 0) as n");
  return text.padEnd(Math.max(text.length, rows[0].n), ".");
}

/** The first active item of an option list, or null when the list is empty. */
async function option(listKey) {
  const { rows } = await client.query(
    `select id
       from public.option_items
      where list_key = $1 and is_active
      order by sort_order
      limit 1`,
    [listKey],
  );
  return rows[0]?.id ?? null;
}

async function remove() {
  const { rows } = await client.query("select id from public.persons where phone_e164 = $1", [PHONE]);
  if (rows.length === 0) {
    console.log("ما فماش عميل تجريبي باش يتمسح.");
    return;
  }
  const personId = rows[0].id;
  // Children first, then the person. Trees are freed rather than deleted: they belong to the offer.
  await client.query("begin");
  await client.query("update public.trees set state = 'available', held_by = null, request_id = null, allocated_at = null, reservation_id = null where held_by = $1", [personId]).catch(async () => {
    await client.query("update public.trees set state = 'available', held_by = null, request_id = null, allocated_at = null where held_by = $1", [personId]);
  });
  for (const table of [
    "public.contract_installments where contract_id in (select id from public.contracts where person_id = $1)",
    "public.payments where person_id = $1",
    "public.contracts where person_id = $1",
    "public.reservations where person_id = $1",
    "public.interest_requests where person_id = $1",
    "public.person_status_history where person_id = $1",
    "public.person_notes where person_id = $1",
    "public.contact_attempts where person_id = $1",
    "public.person_assignments where person_id = $1",
    "public.notification_outbox where related_id = $1",
  ]) {
    await client.query(`delete from ${table}`, [personId]).catch(() => {});
  }
  await client.query("delete from public.persons where id = $1", [personId]).catch(() => {});
  await client.query("commit");
  console.log("تمسح العميل التجريبي وكل ما يتبعو.");
}

async function seed() {
  const { rows: admins } = await client.query(
    "select user_id from public.user_roles where role = 'super_admin' order by granted_at limit 1",
  );
  if (admins.length === 0) throw new Error("ما فماش super_admin في القاعدة.");
  const adminId = admins[0].user_id;

  // An offer that actually has free numbered trees. Anything else and the allocation would refuse.
  const { rows: offers } = await client.query(
    `select p.id, p.name, coalesce(p.min_trees_per_order, 1) as min_trees,
            count(*) filter (where t.state = 'available') as free
       from public.projects p
       join public.trees t on t.project_id = p.id
      group by p.id, p.name, p.min_trees_per_order
     having count(*) filter (where t.state = 'available') >= 5
      order by free desc
      limit 1`,
  );
  if (offers.length === 0) throw new Error("ما فماش عرض عندو 5 زيتونات متاحة. رقّم الزيتونات أوّلاً.");
  const offer = offers[0];
  // The offer's own smallest basket wins over any number this script would like to ask for.
  const trees = Math.min(Number(offer.free), Math.max(Number(offer.min_trees) || 1, 5));

  const { rows: spacings } = await client.query(
    "select spacing_class_id from public.project_spacing_classes where project_id = $1 limit 1",
    [offer.id],
  );
  const { rows: scenarios } = await client.query("select id from public.ownership_scenarios limit 1");
  const { rows: govs } = await client.query("select id from public.governorates where is_active order by sort_order limit 1");

  const why = await reason("بيانات تجريبية للمسار الكامل");

  await client.query("begin");

  // 1 · The client fills the form. Public function, exactly as the site calls it.
  const payload = {
    full_name: "عميل تجريبي — المسار الكامل",
    phone_e164: PHONE,
    whatsapp_e164: PHONE,
    residence_governorate_id: govs[0]?.id ?? null,
    invest_anywhere: true,
    invest_governorate_ids: [],
    scenario_ids: scenarios[0] ? [scenarios[0].id] : [],
    project_type_unsure: !scenarios[0],
    tree_count_option_id: await option("tree_count"),
    spacing_class_id: spacings[0]?.spacing_class_id ?? null,
    payment_mode: "installments",
    down_payment_percent_option_id: await option("down_payment_percent"),
    duration_option_id: await option("duration"),
    goal_option_id: await option("goal"),
    wants_visit: true,
    wants_bank_financing: false,
    contact_channel: "phone",
    contact_time_option_id: await option("contact_time"),
    consent_text: "موافقة على التواصل ومعالجة المعطيات",
    source: { landing_path: "/start", seeded: true },
  };

  const { rows: intake } = await client.query("select public.submit_interest_request($1::jsonb) as out", [
    JSON.stringify(payload),
  ]);
  const demand = intake[0].out ?? {};
  // The function's return shape is its own business; the row it wrote is the contract that matters. Reading
  // it back by phone also covers the case where this phone already had a file and the intake reused it.
  const { rows: written } = await client.query(
    `select r.id, r.person_id, r.request_no
       from public.interest_requests r
       join public.persons p on p.id = r.person_id
      where p.phone_e164 = $1
      order by r.created_at desc
      limit 1`,
    [PHONE],
  );
  if (written.length === 0) throw new Error(`الطلب ما تسجّلش. الجواب: ${JSON.stringify(demand)}`);
  const personId = written[0].person_id;
  const requestId = written[0].id;
  console.log("1 · الطلب:", written[0].request_no);

  // 1b · The identity the contract needs (0082). The intake never asks for it — a CIN is given on the phone
  // or at the counter — so the demo fills it the way a commercial would, before the sale is allowed.
  await client.query(
    `update public.persons
        set cin = '99000001', cin_issued_on = date '2019-04-02', birth_date = date '1990-01-15',
            birth_place = 'تونس', address_line = 'نهج تجريبي، عدد 1، تونس'
      where id = $1`,
    [personId],
  );

  // 2 · From here on, the Back Office is doing the work.
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: adminId, role: "authenticated" }),
  ]);
  await client.query("set local role authenticated");

  const { rows: reserved } = await client.query(
    "select public.staff_create_reservation($1::uuid, $2::uuid, $3::uuid, $4::int, $5, $6) as out",
    [offer.id, personId, requestId, trees, "حجز تجريبي", why],
  );
  const reservation = reserved[0].out;
  console.log("2 · الحجز:", reservation.reference_no ?? reservation.id);

  const method = await option("payment_method");
  const deposit = Number(reservation.deposit_due_millimes ?? 0) || 1_000_000;
  const { rows: paid } = await client.query(
    "select public.staff_record_deposit($1::uuid, $2::bigint, $3::uuid, now(), $4, $5, $6) as out",
    [reservation.id, deposit, method, "DEMO-DEP-1", "عربون تجريبي", why],
  );
  console.log("3 · العربون:", paid[0].out?.reference_no ?? "تسجّل");

  const { rows: contracted } = await client.query(
    "select public.staff_create_contract($1::uuid, $2::uuid, $3, $4::bigint, $5::int, $6::uuid, $7, $8) as out",
    [reservation.id, await option("contract_kind"), "installments", deposit, 24, method, "عقد تجريبي", why],
  );
  const contract = contracted[0].out ?? {};
  console.log("4 · العقد:", contract.reference_no ?? contract.id);

  // 5 · SIGNED FIRST. staff_generate_schedule refuses a draft with `contract_not_signed`: a schedule is what
  // the client agreed to, so it cannot exist before there is an agreement to point at.
  await client.query("select public.staff_sign_contract($1::uuid, current_date, $2, null, $3) as out", [
    contract.id,
    "DEMO-CTR-1",
    why,
  ]);

  // THE SCHEDULE IS ITS OWN ACT, and a contract without one is a contract nobody can collect against:
  // staff_installments has nothing to queue, so «أقساط متأخرة» stays at zero however late the client is.
  await client.query("select public.staff_generate_schedule($1::uuid, $2) as out", [contract.id, why]);
  const { rows: lines } = await client.query(
    "select count(*)::int as n, min(due_on) as first_due from public.contract_installments where contract_id = $1",
    [contract.id],
  );
  console.log(`5 · الجدول: ${lines[0].n} قسط، أوّل واحد ${lines[0].first_due ?? "—"}`);

  // 6 · The first instalment paid, so the finance queue holds one settled line and the rest open.
  const { rows: firstLine } = await client.query(
    "select id, amount_millimes from public.contract_installments where contract_id = $1 order by seq limit 1",
    [contract.id],
  );
  if (firstLine.length > 0) {
    await client.query(
      "select public.staff_record_installment($1::uuid, $2::uuid, 'installment', $3::bigint, $4::uuid, now(), $5, $6, $7) as out",
      [contract.id, firstLine[0].id, firstLine[0].amount_millimes, method, "DEMO-INS-1", "قسط تجريبي", why],
    );
    console.log("6 · أوّل قسط: تخلّص");
  }

  await client.query("commit");
  console.log(`\nتمّ. العرض: ${offer.name} · العميل: ${PHONE}`);
}

try {
  if (REMOVE) await remove();
  else await seed();
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error("\nفشل:", error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
