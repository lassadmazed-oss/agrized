import "server-only";

// The grove screens' reads (0178). Each RPC checks the reader's place on the tasks in Postgres.

import { createClient } from "@/lib/supabase/server";

import type { FarmBoard, FarmPeople, FarmTask } from "./farm-model";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase)(fn, args);
  if (error) {
    if (error.message !== "forbidden") console.error(`${fn} failed`, error.message);
    return { data: null, error: error.message };
  }
  return { data: data as T, error: null };
}

export const readFarmBoard = () => rpc<FarmBoard>("farm_board");
export const readFarmTask = (taskId: string) => rpc<FarmTask>("farm_task", { p_task: taskId });
export const readFarmPeople = () => rpc<FarmPeople>("staff_farm_people");
