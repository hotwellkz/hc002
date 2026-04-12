import type { Editor2dPlanScope } from "./viewState";
import type { Layer } from "./layer";

/** Раздел проекта для слоя (единый реестр; фильтрация UI по разделу). */
export type LayerDomain = "floorPlan" | "slab" | "foundation" | "roof";

export const LAYER_DOMAIN_LABELS: Readonly<Record<LayerDomain, string>> = {
  floorPlan: "План этажа",
  slab: "Перекрытие",
  foundation: "Фундамент",
  roof: "Крыша",
};

export function isLayerDomain(value: unknown): value is LayerDomain {
  return value === "floorPlan" || value === "slab" || value === "foundation" || value === "roof";
}

export function normalizeLayerDomain(value: unknown): LayerDomain {
  return isLayerDomain(value) ? value : "floorPlan";
}

export function editor2dPlanScopeToLayerDomain(scope: Editor2dPlanScope): LayerDomain {
  switch (scope) {
    case "main":
      return "floorPlan";
    case "floorStructure":
      return "slab";
    case "foundation":
      return "foundation";
    case "roof":
      return "roof";
    default: {
      const _x: never = scope;
      return _x;
    }
  }
}

/** Для типов: слой с гарантированным domain после normalize. */
export type LayerWithDomain = Layer & { readonly domain: LayerDomain };
