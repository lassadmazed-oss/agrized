// Modules that exist in this version of the code. The Back Office refuses to publish the others.
export const IMPLEMENTED_MODULES = ["interest_form", "simulator_basic", "land_offers", "projects"] as const;

export const FLAG_STATE_LABELS = {
  disabled: "معطّل",
  internal: "داخلي فقط",
  public: "منشور للعموم",
} as const;

export const PHASE_LABELS: Record<number, string> = {
  1: "المرحلة 1 · جمع الطلب",
  2: "المرحلة 2 · المشاريع والحجز",
  3: "المرحلة 3 · التعاقد والأقساط",
  4: "المرحلة 4 · ما بعد التملّك",
};

export function isImplementedModule(key: string): boolean {
  return (IMPLEMENTED_MODULES as readonly string[]).includes(key);
}
