import type { Point2D } from "../geometry/types";
import type { FloorBeamEntity } from "./floorBeam";
import { floorBeamRefAxisUnitStartToEnd } from "./floorBeamLengthChangeGeometry";
import { MIN_FLOOR_BEAM_SEGMENT_LENGTH_MM, createFloorBeamEntity } from "./floorBeamOps";
import { getProfileById } from "./profileOps";
import type { Project } from "./project";
import { touchProjectMeta } from "./projectFactory";
import { deleteEntitiesFromProject } from "./projectMutations";
import { resolveLinearStockMaxLengthMm } from "./profileLinearStock";
import type { FloorBeamSplitMode } from "./floorBeamSplitMode";

export type { FloorBeamSplitMode } from "./floorBeamSplitMode";

/** Минимальная длина сегмента после разделения (инженерная, не технический ε). */
export const FLOOR_BEAM_SPLIT_MIN_SEGMENT_MM = 100;

const EPS = 1e-3;

export interface FloorBeamSplitIntervalMm {
  readonly t0: number;
  readonly t1: number;
}

export type FloorBeamSplitPlanResult =
  | { readonly ok: true; readonly intervals: readonly FloorBeamSplitIntervalMm[]; readonly noop: boolean }
  | { readonly ok: false; readonly error: string };

/**
 * Проекция точки на опорную ось балки; возвращает расстояние в мм от refStart вдоль оси [0, L].
 */
export function worldAlongFloorBeamRefMm(beam: FloorBeamEntity, worldMm: Point2D): number {
  const { ux, uy, L } = floorBeamRefAxisUnitStartToEnd(beam);
  if (L < EPS) {
    return 0;
  }
  const vx = worldMm.x - beam.refStartMm.x;
  const vy = worldMm.y - beam.refStartMm.y;
  const along = vx * ux + vy * uy;
  return Math.max(0, Math.min(L, along));
}

function intervalsFromSegmentLengths(lengths: readonly number[], overlapMm: number, L: number): FloorBeamSplitIntervalMm[] {
  const out: FloorBeamSplitIntervalMm[] = [];
  let t = 0;
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i]!;
    const t1 = i === lengths.length - 1 ? L : t + len;
    out.push({ t0: t, t1 });
    if (i < lengths.length - 1) {
      t = t + len - overlapMm;
    }
  }
  return out;
}

/** Убирает «огрызок» на последнем сегменте (аналог sipWallLayout.splitLengthMm). */
function redistributeTinyTailMaxMode(
  lengths: number[],
  overlapMm: number,
  maxStockMm: number,
  minSegMm: number,
): { ok: true } | { ok: false; error: string } {
  if (lengths.length < 2 || lengths[lengths.length - 1]! >= minSegMm - EPS) {
    return { ok: true };
  }

  if (overlapMm < EPS) {
    const rem = lengths[lengths.length - 1]!;
    const deficit = minSegMm - rem;
    const prev = lengths[lengths.length - 2]!;
    const nextPrev = prev - deficit;
    if (nextPrev < minSegMm - EPS) {
      return {
        ok: false,
        error:
          "Не удалось убрать слишком короткий хвост: измените длину балки, максимальную длину сегмента в профиле или наложение.",
      };
    }
    if (nextPrev > maxStockMm + EPS) {
      return { ok: false, error: "Внутренняя ошибка раскладки сегментов." };
    }
    lengths[lengths.length - 2] = nextPrev;
    lengths[lengths.length - 1] = minSegMm;
    return { ok: true };
  }

  while (lengths.length >= 2 && lengths[lengths.length - 1]! < minSegMm - EPS) {
    const b = lengths.pop()!;
    const a = lengths[lengths.length - 1]!;
    const merged = a + b - overlapMm;
    if (merged > maxStockMm + EPS) {
      return {
        ok: false,
        error:
          "Не удалось убрать слишком короткий хвост: уменьшите наложение или увеличьте максимальную длину сегмента в профиле.",
      };
    }
    lengths[lengths.length - 1] = merged;
  }

  if (lengths.length === 1 && lengths[0]! < minSegMm - EPS) {
    return { ok: false, error: "Сегмент после разделения получился слишком коротким." };
  }

  return { ok: true };
}

/**
 * Режим «по максимальной длине»: цепочка сегментов с нахлёстом, покрытие [0, L].
 */
export function computeFloorBeamSplitIntervalsMaxLengthMm(
  L: number,
  maxStockMm: number,
  overlapMm: number,
): FloorBeamSplitPlanResult {
  if (!Number.isFinite(L) || L < MIN_FLOOR_BEAM_SEGMENT_LENGTH_MM) {
    return { ok: false, error: "Слишком короткая балка для разделения." };
  }
  if (!Number.isFinite(maxStockMm) || maxStockMm < MIN_FLOOR_BEAM_SEGMENT_LENGTH_MM) {
    return { ok: false, error: "В профиле задана некорректная максимальная длина сегмента." };
  }
  if (!Number.isFinite(overlapMm) || overlapMm < 0) {
    return { ok: false, error: "Наложение не может быть отрицательным." };
  }
  if (overlapMm >= maxStockMm - EPS) {
    return {
      ok: false,
      error: "Наложение должно быть меньше максимальной длины сегмента, иначе стыки несовместимы.",
    };
  }

  const Lr = Math.round(L * 1000) / 1000;

  if (Lr <= maxStockMm + EPS) {
    return { ok: true, intervals: [{ t0: 0, t1: Lr }], noop: true };
  }

  const lengths: number[] = [];
  let pos = 0;
  while (Lr - pos > maxStockMm + EPS) {
    lengths.push(maxStockMm);
    pos += maxStockMm - overlapMm;
  }
  lengths.push(Lr - pos);

  const tail = redistributeTinyTailMaxMode(lengths, overlapMm, maxStockMm, FLOOR_BEAM_SPLIT_MIN_SEGMENT_MM);
  if (!tail.ok) {
    return tail;
  }

  for (const len of lengths) {
    if (len > maxStockMm + EPS) {
      return { ok: false, error: "Внутренняя ошибка раскладки: сегмент превышает максимум." };
    }
  }

  const intervals = intervalsFromSegmentLengths(lengths, overlapMm, Lr);
  return { ok: true, intervals, noop: intervals.length <= 1 };
}

export function computeFloorBeamSplitIntervalsCenterMm(L: number, overlapMm: number): FloorBeamSplitPlanResult {
  if (!Number.isFinite(L) || L < MIN_FLOOR_BEAM_SEGMENT_LENGTH_MM) {
    return { ok: false, error: "Слишком короткая балка для разделения." };
  }
  if (!Number.isFinite(overlapMm) || overlapMm < 0) {
    return { ok: false, error: "Наложение не может быть отрицательным." };
  }
  if (overlapMm > L - EPS) {
    return { ok: false, error: "Наложение больше длины балки." };
  }

  const Lr = Math.round(L * 1000) / 1000;
  const u = Lr / 2;
  const half = overlapMm / 2;
  const t1a = u + half;
  const t0b = u - half;
  if (t0b < -EPS || t1a > Lr + EPS) {
    return { ok: false, error: "Некорректное наложение для деления по центру." };
  }

  const lenA = t1a;
  const lenB = Lr - t0b;
  const minL = Math.min(lenA, lenB);
  if (minL < FLOOR_BEAM_SPLIT_MIN_SEGMENT_MM - EPS) {
    return {
      ok: false,
      error: "Сегменты получились слишком короткими — уменьшите наложение или удлините балку.",
    };
  }

  return {
    ok: true,
    intervals: [
      { t0: 0, t1: t1a },
      { t0: t0b, t1: Lr },
    ],
    noop: false,
  };
}

export function computeFloorBeamSplitIntervalsAtPointMm(
  L: number,
  alongMm: number,
  overlapMm: number,
): FloorBeamSplitPlanResult {
  if (!Number.isFinite(L) || L < MIN_FLOOR_BEAM_SEGMENT_LENGTH_MM) {
    return { ok: false, error: "Слишком короткая балка для разделения." };
  }
  if (!Number.isFinite(overlapMm) || overlapMm < 0) {
    return { ok: false, error: "Наложение не может быть отрицательным." };
  }

  const Lr = Math.round(L * 1000) / 1000;
  let u = alongMm;
  if (!Number.isFinite(u)) {
    return { ok: false, error: "Некорректная точка деления." };
  }
  u = Math.max(0, Math.min(Lr, u));

  const half = overlapMm / 2;
  const maxHalf = Math.min(u, Lr - u);
  if (half > maxHalf + EPS) {
    return {
      ok: false,
      error: "Наложение слишком большое для выбранной точки (слишком близко к торцу).",
    };
  }

  const t1a = u + half;
  const t0b = u - half;
  const lenA = t1a;
  const lenB = Lr - t0b;
  const minL = Math.min(lenA, lenB);
  if (minL < FLOOR_BEAM_SPLIT_MIN_SEGMENT_MM - EPS) {
    return {
      ok: false,
      error: "Точка деления слишком близко к торцу — остаётся слишком короткий сегмент.",
    };
  }

  return {
    ok: true,
    intervals: [
      { t0: 0, t1: t1a },
      { t0: t0b, t1: Lr },
    ],
    noop: false,
  };
}

export function computeFloorBeamSplitIntervals(
  mode: FloorBeamSplitMode,
  L: number,
  overlapMm: number,
  maxStockMm: number,
  alongMm: number | null,
): FloorBeamSplitPlanResult {
  if (mode === "maxLength") {
    return computeFloorBeamSplitIntervalsMaxLengthMm(L, maxStockMm, overlapMm);
  }
  if (mode === "center") {
    return computeFloorBeamSplitIntervalsCenterMm(L, overlapMm);
  }
  if (alongMm == null) {
    return { ok: false, error: "Не задана точка деления." };
  }
  return computeFloorBeamSplitIntervalsAtPointMm(L, alongMm, overlapMm);
}

function sliceBeamToInterval(beam: FloorBeamEntity, t0: number, t1: number): FloorBeamEntity | null {
  const { ux, uy, L } = floorBeamRefAxisUnitStartToEnd(beam);
  if (L < EPS) {
    return null;
  }
  const a = Math.max(0, Math.min(L, t0));
  const b = Math.max(0, Math.min(L, t1));
  if (b - a < MIN_FLOOR_BEAM_SEGMENT_LENGTH_MM - EPS) {
    return null;
  }
  const created = createFloorBeamEntity({
    layerId: beam.layerId,
    profileId: beam.profileId,
    refStartMm: {
      x: beam.refStartMm.x + ux * a,
      y: beam.refStartMm.y + uy * a,
    },
    refEndMm: {
      x: beam.refStartMm.x + ux * b,
      y: beam.refStartMm.y + uy * b,
    },
    linearPlacementMode: beam.linearPlacementMode,
    sectionRolled: beam.sectionRolled,
    baseElevationMm: beam.baseElevationMm,
  });
  return created;
}

export type FloorBeamSplitApplyResult =
  | { readonly kind: "applied"; readonly project: Project; readonly newBeamIds: readonly string[] }
  | { readonly kind: "noop"; readonly message: string }
  | { readonly kind: "error"; readonly error: string };

const NOOP_MAX_LENGTH_MESSAGE =
  "Длина не превышает максимальную длину сегмента из профиля — разделение не требуется (остаётся один элемент).";

/**
 * Удаляет исходную балку и добавляет сегменты. `noop` — для пакетного режима (короче лимита).
 */
export function applyFloorBeamSplitInProject(
  project: Project,
  beamId: string,
  mode: FloorBeamSplitMode,
  overlapMm: number,
  worldPickMm: Point2D | null,
): FloorBeamSplitApplyResult {
  const beam = project.floorBeams.find((b) => b.id === beamId);
  if (!beam) {
    return { kind: "error", error: "Балка не найдена." };
  }
  const profile = getProfileById(project, beam.profileId);
  if (!profile) {
    return { kind: "error", error: "Профиль балки не найден." };
  }

  const { L } = floorBeamRefAxisUnitStartToEnd(beam);
  const maxStock = resolveLinearStockMaxLengthMm(profile);
  const along =
    mode === "atPoint" && worldPickMm != null ? worldAlongFloorBeamRefMm(beam, worldPickMm) : null;

  const plan = computeFloorBeamSplitIntervals(mode, L, overlapMm, maxStock, along);
  if (!plan.ok) {
    return { kind: "error", error: plan.error };
  }
  if (plan.noop) {
    return { kind: "noop", message: NOOP_MAX_LENGTH_MESSAGE };
  }

  const newBeams: FloorBeamEntity[] = [];
  for (const iv of plan.intervals) {
    const nb = sliceBeamToInterval(beam, iv.t0, iv.t1);
    if (!nb) {
      return { kind: "error", error: "Не удалось построить сегмент (проверьте длины)." };
    }
    newBeams.push(nb);
  }

  let next = deleteEntitiesFromProject(project, new Set([beamId]));
  const t = new Date().toISOString();
  const withBeams: FloorBeamEntity[] = newBeams.map((b) => ({
    ...b,
    createdAt: t,
    updatedAt: t,
  }));
  next = touchProjectMeta({
    ...next,
    floorBeams: [...next.floorBeams, ...withBeams],
  });

  return { kind: "applied", project: next, newBeamIds: withBeams.map((b) => b.id) };
}
