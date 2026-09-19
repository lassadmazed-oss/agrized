import { redirect } from "next/navigation";

// docs/plan-zitouna.md P6-1 (owner, 2026-09-15): the capacity simulator asked for a monthly installment, which the
// tree pricing no longer uses. The calculator on /start replaces it, so old links and bookmarks land there.
export default function SimulatorPage() {
  redirect("/start");
}
