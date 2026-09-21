// Which trees of an offer the «الزيتونات» tab is listing — shared by the server page that reads it out of the
// address and the client tab that draws the switch.
//
// It lives in its own module, with no "use client" directive, for a reason that costs a runtime error otherwise:
// a Server Component that imports a VALUE from a "use client" module does not receive the value. It receives a
// client-reference proxy, so `TREE_FILTERS.includes(...)` threw «includes is not a function» on the offer page.
// Types are erased at build time and cross that boundary safely; an array does not. Anything both sides need as
// a real value belongs here.

export type TreeFilter = "held" | "reserved" | "sold";

export const TREE_FILTERS: readonly TreeFilter[] = ["held", "reserved", "sold"];

/** Whether an address parameter names one of the filters, narrowing it as it answers. */
export function isTreeFilter(value: unknown): value is TreeFilter {
  return typeof value === "string" && (TREE_FILTERS as readonly string[]).includes(value);
}
