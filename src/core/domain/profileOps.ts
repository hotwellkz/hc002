import type { Profile, ProfileCategory, ProfileCompositionMode, ProfileLayer } from "./profile";
import type { Project } from "./project";
import { resolveRoofProfileAssembly } from "./roofProfileAssembly";

export function getProfileById(project: Project, id: string): Profile | undefined {
  return project.profiles.find((p) => p.id === id);
}

export function getProfilesByCategory(project: Project, category: ProfileCategory): readonly Profile[] {
  return project.profiles.filter((p) => p.category === category);
}

/**
 * Итоговая толщина/глубина профиля, мм.
 * layered — сумма слоёв; solid — один слой или defaultThicknessMm.
 */
export function computeProfileTotalThicknessMm(profile: Profile): number {
  if (profile.compositionMode === "layered") {
    return profile.layers.reduce((s, l) => s + l.thicknessMm, 0);
  }
  if (profile.layers.length === 1) {
    return profile.layers[0]!.thicknessMm;
  }
  if (profile.defaultThicknessMm != null && Number.isFinite(profile.defaultThicknessMm)) {
    return profile.defaultThicknessMm;
  }
  return profile.layers.reduce((s, l) => s + l.thicknessMm, 0);
}

export function formatProfileSummary(profile: Profile): string {
  if (profile.category === "roof") {
    const ra = resolveRoofProfileAssembly(profile);
    const labels: Record<string, string> = {
      metal_tile: "металлочерепица",
      profiled_sheet: "профлист",
      soft: "мягкая",
      standing_seam: "фальц",
      other: "кровля",
    };
    return labels[ra.coveringKind] ?? "кровля";
  }
  const t = computeProfileTotalThicknessMm(profile);
  if (t <= 0) {
    return "—";
  }
  return `${Math.round(t)} мм`;
}

/** Для сортировки слоёв в UI */
export function sortProfileLayersByOrder(layers: readonly ProfileLayer[]): ProfileLayer[] {
  return [...layers].sort((a, b) => a.orderIndex - b.orderIndex);
}

export function defaultCompositionModeForCategory(category: ProfileCategory): ProfileCompositionMode {
  if (category === "wall" || category === "slab" || category === "roof") {
    return "layered";
  }
  return "solid";
}
