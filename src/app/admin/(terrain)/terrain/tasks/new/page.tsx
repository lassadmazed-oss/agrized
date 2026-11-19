import type { Metadata } from "next";
import Link from "next/link";

import { requireStaff } from "@/lib/auth";

import { FARM_MANAGER_ROLES } from "../farm-model";
import { readFarmPeople } from "../read";
import { TaskForm } from "../task-form";

export const metadata: Metadata = { title: "تاسك جديدة" };

export default async function NewFarmTaskPage() {
  await requireStaff(FARM_MANAGER_ROLES);
  const { data: people } = await readFarmPeople();
  return (
    <div className="space-y-5">
      <Link href="/admin/terrain/tasks" className="text-sm font-semibold text-forest">
        → الخدمة
      </Link>
      <h1 className="font-display text-2xl font-bold text-forest">تاسك جديدة</h1>
      {people ? <TaskForm people={people} /> : <p className="card p-5 text-muted">ما نجمناش نقراو العمّال والعروض. حدّث الصفحة.</p>}
    </div>
  );
}
