/**
 * Группировка SIP на фасаде «Вид стены»: размер + роль + для панелей у проёмов — геометрия проёма.
 */

import type { Opening } from "./opening";
import type { WallDetailSipFacadeSlice } from "./wallDetailSipElevation";
import { openingBottomSheetYMm, openingTopSheetYMm } from "./wallDetailSipElevation";

/** Роль панели для спецификации/маркировки на чертеже. */
export type WallDetailSipPanelRole =
  | "regular"
  | "corner-left"
  | "corner-right"
  | "adjacent-window-left"
  | "adjacent-window-right"
  | "adjacent-window-top"
  | "adjacent-window-bottom"
  | "adjacent-door-left"
  | "adjacent-door-right"
  | "adjacent-door-top"
  | "adjacent-window-between"
  | "adjacent-door-between"
  | "adjacent-mixed-between";

const ALIGN_EPS_MM = 1.5;

type FlexOpening = Opening & { offsetFromStartMm: number };

function flexOpeningsForWall(openings: readonly Opening[], wallId: string): FlexOpening[] {
  return openings
    .filter(
      (o): o is FlexOpening =>
        o.wallId === wallId &&
        o.offsetFromStartMm != null &&
        (o.kind === "door" || o.kind === "window"),
    )
    .sort((a, b) => a.offsetFromStartMm - b.offsetFromStartMm);
}

/** Касания колонки с проёмами по оси стены (не используется для угловых колонок до классификации). */
function columnOpeningTouches(
  startOffsetMm: number,
  endOffsetMm: number,
  openings: readonly FlexOpening[],
): { leftOfOpening: FlexOpening[]; rightOfOpening: FlexOpening[] } {
  const leftOfOpening: FlexOpening[] = [];
  const rightOfOpening: FlexOpening[] = [];
  for (const o of openings) {
    const o0 = o.offsetFromStartMm;
    const o1 = o.offsetFromStartMm + o.widthMm;
    if (Math.abs(endOffsetMm - o0) < ALIGN_EPS_MM) {
      leftOfOpening.push(o);
    }
    if (Math.abs(startOffsetMm - o1) < ALIGN_EPS_MM) {
      rightOfOpening.push(o);
    }
  }
  return { leftOfOpening, rightOfOpening };
}

function classifyColumnRole(
  startOffsetMm: number,
  endOffsetMm: number,
  wallLengthMm: number,
  openings: readonly FlexOpening[],
): WallDetailSipPanelRole {
  if (startOffsetMm <= ALIGN_EPS_MM) {
    return "corner-left";
  }
  if (endOffsetMm >= wallLengthMm - ALIGN_EPS_MM) {
    return "corner-right";
  }

  const { leftOfOpening, rightOfOpening } = columnOpeningTouches(startOffsetMm, endOffsetMm, openings);

  if (leftOfOpening.length === 0 && rightOfOpening.length === 0) {
    return "regular";
  }

  if (leftOfOpening.length >= 1 && rightOfOpening.length >= 1) {
    const kL = leftOfOpening[0]!.kind;
    const kR = rightOfOpening[0]!.kind;
    if (kL === "window" && kR === "window") {
      return "adjacent-window-between";
    }
    if (kL === "door" && kR === "door") {
      return "adjacent-door-between";
    }
    return "adjacent-mixed-between";
  }

  if (leftOfOpening.length >= 1) {
    const o = leftOfOpening[0]!;
    return o.kind === "window" ? "adjacent-window-left" : "adjacent-door-left";
  }

  const o = rightOfOpening[0]!;
  return o.kind === "window" ? "adjacent-window-right" : "adjacent-door-right";
}

/** Роль одного слайса фасада (колонка / над проёмом / под окном). */
export function wallDetailSipFacadeSliceRole(
  sl: WallDetailSipFacadeSlice,
  wallLengthMm: number,
  openingsOnWall: readonly Opening[],
  wallId: string,
): WallDetailSipPanelRole {
  const flex = flexOpeningsForWall(openingsOnWall, wallId);

  if (sl.kind === "above_opening") {
    const o = flex.find((x) => x.id === sl.openingId);
    const kind = o?.kind ?? "window";
    return kind === "door" ? "adjacent-door-top" : "adjacent-window-top";
  }
  if (sl.kind === "below_opening") {
    return "adjacent-window-bottom";
  }

  const r = sl.region;
  return classifyColumnRole(r.startOffsetMm, r.endOffsetMm, wallLengthMm, flex);
}

/** Толщина для отображения/группировки: всегда полная толщина стены (профиль), не слой ядра в регионе. */
export function wallDetailSipSliceThicknessMm(sl: WallDetailSipFacadeSlice, wallThicknessFallbackMm: number): number {
  if (wallThicknessFallbackMm > 0) {
    return wallThicknessFallbackMm;
  }
  return sl.kind === "column" ? sl.region.thicknessMm : 0;
}

/** Отметки низа и верха светового проёма от низа стены вверх, мм (целые). */
export function wallDetailSipOpeningVerticalFromWallBaseMm(
  o: FlexOpening,
  wallBottomSheetMm: number,
): { bottomFromBaseMm: number; topFromBaseMm: number; widthMm: number; heightMm: number } {
  const yTop = openingTopSheetYMm(o, wallBottomSheetMm);
  const yBot = openingBottomSheetYMm(o, wallBottomSheetMm);
  return {
    bottomFromBaseMm: Math.round(wallBottomSheetMm - yBot),
    topFromBaseMm: Math.round(wallBottomSheetMm - yTop),
    widthMm: Math.round(o.widthMm),
    heightMm: Math.round(o.heightMm),
  };
}

function openingCoreProductionKey(o: FlexOpening, wallBottomSheetMm: number): string {
  const g = wallDetailSipOpeningVerticalFromWallBaseMm(o, wallBottomSheetMm);
  const typ = o.kind === "door" ? "door" : "window";
  return `${typ},${g.widthMm},${g.heightMm},${g.bottomFromBaseMm},${g.topFromBaseMm}`;
}

/**
 * Сигнатура примыкания к одному проёму: тип | сторона | ширина/высота проёма | низ/верх от низа стены.
 * Сторона — относительно проёма: left = панель слева от проёма, top = над проёмом и т.д.
 */
function openingAdjacencyProductionKey(
  o: FlexOpening,
  wallBottomSheetMm: number,
  side: "left" | "right" | "top" | "bottom",
): string {
  const g = wallDetailSipOpeningVerticalFromWallBaseMm(o, wallBottomSheetMm);
  const typ = o.kind === "door" ? "door" : "window";
  return `${typ}|${side}|${g.widthMm}|${g.heightMm}|${g.bottomFromBaseMm}|${g.topFromBaseMm}`;
}

function openingBetweenProductionKey(a: FlexOpening, b: FlexOpening, wallBottomSheetMm: number): string {
  const [o1, o2] = a.offsetFromStartMm <= b.offsetFromStartMm ? [a, b] : [b, a];
  return `between|${openingCoreProductionKey(o1, wallBottomSheetMm)}~${openingCoreProductionKey(o2, wallBottomSheetMm)}`;
}

/**
 * Дополнение к ключу группы для панелей у проёма. Для угловых и regular — null.
 */
function sliceOpeningAttachmentKey(
  sl: WallDetailSipFacadeSlice,
  role: WallDetailSipPanelRole,
  wallBottomSheetMm: number,
  openings: readonly FlexOpening[],
): string | null {
  if (role === "regular" || role === "corner-left" || role === "corner-right") {
    return null;
  }

  if (sl.kind === "above_opening") {
    const o = openings.find((x) => x.id === sl.openingId);
    if (!o) {
      return "missing-opening";
    }
    return `${openingAdjacencyProductionKey(o, wallBottomSheetMm, "top")}#seg${sl.segmentIndex}`;
  }
  if (sl.kind === "below_opening") {
    const o = openings.find((x) => x.id === sl.openingId);
    if (!o) {
      return "missing-opening";
    }
    return `${openingAdjacencyProductionKey(o, wallBottomSheetMm, "bottom")}#seg${sl.segmentIndex}`;
  }

  const { startOffsetMm: start, endOffsetMm: end } = sl.region;
  const { leftOfOpening, rightOfOpening } = columnOpeningTouches(start, end, openings);

  if (
    role === "adjacent-window-between" ||
    role === "adjacent-door-between" ||
    role === "adjacent-mixed-between"
  ) {
    const oL = leftOfOpening[0];
    const oR = rightOfOpening[0];
    if (!oL || !oR) {
      return "missing-between";
    }
    return openingBetweenProductionKey(oL, oR, wallBottomSheetMm);
  }
  if (role === "adjacent-window-left" || role === "adjacent-door-left") {
    const o = leftOfOpening[0];
    if (!o) {
      return "missing-left";
    }
    return openingAdjacencyProductionKey(o, wallBottomSheetMm, "left");
  }
  if (role === "adjacent-window-right" || role === "adjacent-door-right") {
    const o = rightOfOpening[0];
    if (!o) {
      return "missing-right";
    }
    return openingAdjacencyProductionKey(o, wallBottomSheetMm, "right");
  }

  return null;
}

/** Базовая часть ключа: ширина×высота×толщина@роль. */
export function wallDetailSipPanelGroupKeyBase(
  widthMm: number,
  heightMm: number,
  thicknessMm: number,
  role: WallDetailSipPanelRole,
): string {
  const w = Math.round(widthMm);
  const h = Math.round(heightMm);
  const t = Math.round(thicknessMm);
  return `${w}x${h}x${t}@${role}`;
}

function buildWallDetailSipSliceGroupKey(
  sl: WallDetailSipFacadeSlice,
  role: WallDetailSipPanelRole,
  widthMm: number,
  heightMm: number,
  thicknessMm: number,
  wallBottomSheetMm: number,
  openingsOnWall: readonly Opening[],
  wallId: string,
): string {
  const base = wallDetailSipPanelGroupKeyBase(widthMm, heightMm, thicknessMm, role);
  const flex = flexOpeningsForWall(openingsOnWall, wallId);
  const attach = sliceOpeningAttachmentKey(sl, role, wallBottomSheetMm, flex);
  return attach == null ? base : `${base}#${attach}`;
}

export interface WallDetailSipGroupedRow {
  readonly positionOneBased: number;
  readonly groupKey: string;
  readonly role: WallDetailSipPanelRole;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly thicknessMm: number;
  readonly qty: number;
}

export interface WallDetailSipPanelDisplayGrouping {
  /** Номер позиции П{n} для каждого слайса (порядок как в `slices`). */
  readonly slicePositionOneBased: readonly number[];
  readonly groupedRows: readonly WallDetailSipGroupedRow[];
}

/**
 * Нумерация позиций и строки таблицы. У проёмов ключ включает геометрию проёма (от низа стены).
 * `wallBottomSheetMm` — Y низа стены на листе (как в `WallDetailSipSheetFrameMm.wallBottomMm`).
 */
export function buildWallDetailSipPanelDisplayGrouping(
  slices: readonly WallDetailSipFacadeSlice[],
  wallLengthMm: number,
  wallThicknessMm: number,
  openingsOnWall: readonly Opening[],
  wallId: string,
  wallBottomSheetMm: number,
): WallDetailSipPanelDisplayGrouping {
  const sliceMetas = slices.map((sl) => {
    const role = wallDetailSipFacadeSliceRole(sl, wallLengthMm, openingsOnWall, wallId);
    const t = wallDetailSipSliceThicknessMm(sl, wallThicknessMm);
    const w = sl.specWidthMm;
    const h = sl.specHeightMm;
    const groupKey = buildWallDetailSipSliceGroupKey(sl, role, w, h, t, wallBottomSheetMm, openingsOnWall, wallId);
    return { groupKey, role, w: Math.round(w), h: Math.round(h), t: Math.round(t) };
  });

  const keyToPosition = new Map<string, number>();
  let nextPos = 1;
  const slicePositionOneBased = sliceMetas.map(({ groupKey }) => {
    let p = keyToPosition.get(groupKey);
    if (p == null) {
      p = nextPos++;
      keyToPosition.set(groupKey, p);
    }
    return p;
  });

  const groupOrder: string[] = [];
  const groupAgg = new Map<string, { qty: number; role: WallDetailSipPanelRole; w: number; h: number; t: number; position: number }>();

  sliceMetas.forEach((m, i) => {
    const position = slicePositionOneBased[i]!;
    if (!groupAgg.has(m.groupKey)) {
      groupOrder.push(m.groupKey);
      groupAgg.set(m.groupKey, {
        qty: 0,
        role: m.role,
        w: m.w,
        h: m.h,
        t: m.t,
        position,
      });
    }
    const g = groupAgg.get(m.groupKey)!;
    g.qty += 1;
  });

  const groupedRows: WallDetailSipGroupedRow[] = groupOrder.map((gk) => {
    const g = groupAgg.get(gk)!;
    return {
      positionOneBased: g.position,
      groupKey: gk,
      role: g.role,
      widthMm: g.w,
      heightMm: g.h,
      thicknessMm: g.t,
      qty: g.qty,
    };
  });

  return { slicePositionOneBased, groupedRows };
}
