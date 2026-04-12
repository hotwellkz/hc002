/**
 * Узел кровли для профиля категории «Кровля» (`Profile.roofAssembly`).
 * Миграция со старого формата выполняется в `migrateRoofProfileAssemblyWire`.
 */

export type RoofBattenLayoutDir = "perpendicular_to_fall" | "parallel_to_fall";

/** Тип / технология кровельного покрытия. */
export type RoofCoveringKind = "metal_tile" | "profiled_sheet" | "soft" | "standing_seam" | "other";

/** Внешний вид покрытия в 3D. */
export type RoofCoveringAppearance3d = "color" | "texture";

export interface RoofProfileAssembly {
  readonly coveringKind: RoofCoveringKind;
  /** Материал покрытия (строительное название). */
  readonly coveringMaterial: string;
  readonly coveringThicknessMm: number;
  readonly coveringAppearance3d: RoofCoveringAppearance3d;
  /** Цвет при режиме «только цвет» (#RRGGBB). */
  readonly coveringColorHex: string;
  /**
   * Идентификатор текстуры из каталога (когда appearance = texture).
   * Пока может быть пустым — тогда в 3D используется цвет-заглушка.
   */
  readonly coveringTextureId: string | null;

  readonly membraneUse: boolean;
  readonly membraneThicknessMm: number;
  readonly membraneTypeName: string;

  readonly battenUse: boolean;
  readonly battenMaterial: string;
  readonly battenWidthMm: number;
  readonly battenHeightMm: number;
  readonly battenStepMm: number;
  readonly battenLayoutDir: RoofBattenLayoutDir;

  /** Свес по карнизу (мм), для будущей геометрии / спецификации. */
  readonly eaveOverhangMm: number;
  /** Боковой свес (мм). */
  readonly sideOverhangMm: number;

  /** Зарезервировано: подшивка свесов (3D позже). */
  readonly soffitReserved: boolean;
}

export const DEFAULT_ROOF_PROFILE_ASSEMBLY: RoofProfileAssembly = {
  coveringKind: "metal_tile",
  coveringMaterial: "Металлочерепица",
  coveringThicknessMm: 0.5,
  coveringAppearance3d: "color",
  coveringColorHex: "#6b7a8f",
  coveringTextureId: null,
  membraneUse: true,
  membraneThicknessMm: 0.4,
  membraneTypeName: "Супердиффузионная мембрана",
  battenUse: true,
  battenMaterial: "Доска обрешётки",
  battenWidthMm: 100,
  battenHeightMm: 40,
  battenStepMm: 350,
  battenLayoutDir: "perpendicular_to_fall",
  eaveOverhangMm: 0,
  sideOverhangMm: 0,
  soffitReserved: false,
};

/** Произвольный объект из JSON (старые проекты). */
type UnknownRecord = Record<string, unknown>;

function str(v: unknown, fallback: string): string {
  if (v == null) {
    return fallback;
  }
  const s = String(v).trim();
  return s ? s : fallback;
}

function num(v: unknown, fallback: number, min?: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return min != null ? Math.max(min, n) : n;
}

function bool(v: unknown, defaultTrue: boolean): boolean {
  if (v === undefined || v === null) {
    return defaultTrue;
  }
  return v !== false;
}

/**
 * Приводит сохранённый `roofAssembly` к текущему виду (старые ключи → новые).
 * Вызывать при загрузке профиля / перед сохранением.
 */
export function migrateRoofProfileAssemblyWire(raw: unknown): RoofProfileAssembly {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_ROOF_PROFILE_ASSEMBLY };
  }
  const r = raw as UnknownRecord;

  const oldName = str(r["coveringMaterialName"], "");
  const newMat = str(r["coveringMaterial"], oldName || DEFAULT_ROOF_PROFILE_ASSEMBLY.coveringMaterial);

  let kind = r["coveringKind"] as RoofCoveringKind | undefined;
  const validKinds: readonly RoofCoveringKind[] = [
    "metal_tile",
    "profiled_sheet",
    "soft",
    "standing_seam",
    "other",
  ];
  if (!kind || !validKinds.includes(kind)) {
    kind = "other";
    const low = oldName.toLowerCase();
    if (low.includes("металлочереп") || low.includes("metal")) {
      kind = "metal_tile";
    } else if (low.includes("профнастил") || low.includes("профлист")) {
      kind = "profiled_sheet";
    } else if (low.includes("мягк") || low.includes("гибк")) {
      kind = "soft";
    } else if (low.includes("фальц")) {
      kind = "standing_seam";
    }
  }

  const appearanceRaw = r["coveringAppearance3d"];
  const appearance: RoofCoveringAppearance3d =
    appearanceRaw === "texture" ? "texture" : "color";

  const membraneUse = bool(r["membraneUse"], bool(r["membraneEnabled"], true));
  const battenUse = bool(r["battenUse"], bool(r["battenEnabled"], true));

  return {
    coveringKind: kind,
    coveringMaterial: newMat,
    coveringThicknessMm: num(r["coveringThicknessMm"], DEFAULT_ROOF_PROFILE_ASSEMBLY.coveringThicknessMm, 0.1),
    coveringAppearance3d: appearance,
    coveringColorHex: normalizeHexColor(str(r["coveringColorHex"], "")) ?? DEFAULT_ROOF_PROFILE_ASSEMBLY.coveringColorHex,
    coveringTextureId:
      r["coveringTextureId"] == null || r["coveringTextureId"] === ""
        ? null
        : String(r["coveringTextureId"]),
    membraneUse,
    membraneThicknessMm: num(r["membraneThicknessMm"], DEFAULT_ROOF_PROFILE_ASSEMBLY.membraneThicknessMm, 0.1),
    membraneTypeName: str(r["membraneTypeName"], DEFAULT_ROOF_PROFILE_ASSEMBLY.membraneTypeName),
    battenUse,
    battenMaterial: str(r["battenMaterial"], str(r["battenMaterialName"], DEFAULT_ROOF_PROFILE_ASSEMBLY.battenMaterial)),
    battenWidthMm: num(r["battenWidthMm"], DEFAULT_ROOF_PROFILE_ASSEMBLY.battenWidthMm, 10),
    battenHeightMm: num(r["battenHeightMm"], DEFAULT_ROOF_PROFILE_ASSEMBLY.battenHeightMm, 10),
    battenStepMm: num(r["battenStepMm"], DEFAULT_ROOF_PROFILE_ASSEMBLY.battenStepMm, 50),
    battenLayoutDir: r["battenLayoutDir"] === "parallel_to_fall" ? "parallel_to_fall" : "perpendicular_to_fall",
    eaveOverhangMm: Math.max(0, num(r["eaveOverhangMm"], 0, 0)),
    sideOverhangMm: Math.max(0, num(r["sideOverhangMm"], 0, 0)),
    soffitReserved: r["soffitReserved"] === true || r["soffitPlanned"] === true,
  };
}

export function resolveRoofProfileAssembly(profile: { readonly roofAssembly?: unknown }): RoofProfileAssembly {
  return migrateRoofProfileAssemblyWire(profile.roofAssembly);
}

function normalizeHexColor(hex: string): string | null {
  if (!hex || typeof hex !== "string") {
    return null;
  }
  const t = hex.trim();
  const m = /^#?([0-9a-fA-F]{6})$/.exec(t);
  if (!m) {
    return null;
  }
  return `#${m[1]!.toLowerCase()}`;
}

/** Ошибки для UI перед расчётом крыши. */
export function validateRoofProfileAssemblyForCalculation(asm: RoofProfileAssembly): string[] {
  const e: string[] = [];
  if (!asm.coveringMaterial.trim()) {
    e.push("Укажите материал покрытия в профиле кровли.");
  }
  if (!(asm.coveringThicknessMm > 0)) {
    e.push("Толщина покрытия в профиле кровли должна быть больше 0.");
  }
  if (asm.membraneUse && !(asm.membraneThicknessMm > 0)) {
    e.push("Толщина мембраны в профиле кровли должна быть больше 0.");
  }
  if (asm.membraneUse && !asm.membraneTypeName.trim()) {
    e.push("Укажите тип / название мембраны в профиле кровли.");
  }
  if (asm.battenUse) {
    if (!(asm.battenStepMm > 0)) {
      e.push("Шаг обрешётки в профиле кровли должен быть больше 0.");
    }
    if (!(asm.battenWidthMm > 0) || !(asm.battenHeightMm > 0)) {
      e.push("Сечение обрешётки (ширина и высота доски) в профиле кровли должно быть больше 0.");
    }
    if (!asm.battenMaterial.trim()) {
      e.push("Укажите материал обрешётки в профиле кровли.");
    }
  }
  return e;
}
