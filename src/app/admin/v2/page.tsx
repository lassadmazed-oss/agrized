import { redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth";

/**
 * /admin/v2 has no screen of its own any more.
 *
 * It used to be «اليوم» — a dashboard of eleven counters. Every one of them was a number you then had to go
 * somewhere else to act on, which is the definition of a screen that costs a page load and returns nothing.
 * The four screens that replaced it each open on their own work: الطلبات on who wrote in, التأكيد on the sales
 * waiting to be finished, الأقساط on what is late.
 *
 * The door is الطلبات, because that is where a working day starts — with whoever asked.
 */
export default async function AdminV2Home() {
  await requireStaff();
  redirect("/admin/v2/requests");
}
