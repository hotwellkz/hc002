/**
 * Отчёт «Стропильная система» по одному скату: контур, стропила, нумерация,
 * цепочка шагов, мини-спецификация (таблица добавляется в compileReport в координатах листа).
 */

import type { Project } from "../../domain/project";
import { clipSegmentToPolygon2dMm } from "../../domain/roofRafterGeometry";
import type { RoofRafterEntity } from "../../domain/roofRafter";
import { resolveRoofRafterSectionOrientation } from "../../domain/roofRafter";
import { beamPlanThicknessAndVerticalFromOrientationMm, beamSectionPrincipalDimsMm } from "../../domain/floorBeamSection";
import { getProfileById } from "../../domain/profileOps";
import {
  roofPlaneDrainUnitPlanMm,
  roofPlanePolygonMm,
  roofPlanePreferredEaveEdgeVertexIndicesMm,
} from "../../domain/roofPlane";
import { layerIdsForSnapGeometry } from "../../geometry/snap2dPrimitives";
import type { Point2D } from "../../geometry/types";
import type { ReportPrimitive } from "../types";
import { parallelSegmentDimension } from "../dimensionRules/sipStartingBoardDimensions";

const OUTLINE_STROKE_MM = 0.22;
const RAFTER_STROKE_MM = 0.32;
const LABEL_FS_MM = 3.15;
const TITLE_FS_MM = 3.6;

const DIM_BASE_OFFSET_MM = 118;
const DIM_ROW_STEP_MM = 58;
const DIM_LABEL_FS_MM = 3.35;
const DIM_STROKE_MM = 0.12;

function unit2(dx: number, dy: number): Point2D | null {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) {
    return null;
  }
  return { x: dx / len, y: dy / len };
}

/** Компактная размерная линия (меньше шрифт, чем в sipStartingBoard). */
function compactParallelDimension(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  offsetMm: number,
  label: string,
): ReportPrimitive {
  const base = parallelSegmentDimension(ax, ay, bx, by, offsetMm, label);
  return {
    ...base,
    strokeMm: DIM_STROKE_MM,
    labelFontSizeMm: DIM_LABEL_FS_MM,
  };
}

function rafterAxisLengthMm(r: RoofRafterEntity): number {
  const dx = r.ridgePlanMm.x - r.footPlanMm.x;
  const dy = r.ridgePlanMm.y - r.footPlanMm.y;
  const dz = r.ridgeElevationMm - r.footElevationMm;
  return Math.hypot(dx, dy, dz);
}

function formatSectionLabel(project: Project, r: RoofRafterEntity): string {
  const pr = getProfileById(project, r.profileId);
  if (!pr) {
    return "—";
  }
  const dims = beamSectionPrincipalDimsMm(pr);
  if (!dims) {
    return pr.name ?? "—";
  }
  const o = resolveRoofRafterSectionOrientation(r);
  const { planThicknessMm, verticalMm } = beamPlanThicknessAndVerticalFromOrientationMm(pr, o);
  return `${Math.round(planThicknessMm)}×${Math.round(verticalMm)}`;
}

export interface RoofFramingSlopeSheetTableSpec {
  readonly colWidthsMm: readonly number[];
  readonly rowHeightsMm: readonly number[];
  readonly cells: readonly (readonly string[])[];
  readonly fontSizeMm: number;
}

export interface RoofFramingSlopeSheetWorldBuild {
  readonly drawingPrimitives: readonly ReportPrimitive[];
  readonly tableSpec: RoofFramingSlopeSheetTableSpec | null;
  readonly worldBounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number } | null;
  readonly messages: readonly string[];
}

/**
 * Сборка вида одного ската: только примитивы чертежа (мир, мм, Y вверх).
 * Таблица передаётся отдельно для вставки в координатах листа.
 */
export function buildRoofFramingSlopeSheetWorld(project: Project, roofPlaneId: string): RoofFramingSlopeSheetWorldBuild {
  const messages: string[] = [];
  const layerIds = layerIdsForSnapGeometry(project);
  const rp = project.roofPlanes.find((p) => p.id === roofPlaneId && layerIds.has(p.layerId));
  if (!rp) {
    return {
      drawingPrimitives: [],
      tableSpec: null,
      worldBounds: null,
      messages: ["Скат не найден на видимых слоях или удалён."],
    };
  }

  const poly = roofPlanePolygonMm(rp);
  if (poly.length < 3) {
    return {
      drawingPrimitives: [],
      tableSpec: null,
      worldBounds: null,
      messages: ["Некорректный контур ската."],
    };
  }

  const raftersAll = project.roofRafters.filter((r) => r.roofPlaneId === roofPlaneId && layerIds.has(r.layerId));
  if (raftersAll.length === 0) {
    return {
      drawingPrimitives: [],
      tableSpec: null,
      worldBounds: null,
      messages: [`Для ската ${rp.slopeIndex} нет стропил на видимых слоях (сгенерируйте стропила или включите слой).`],
    };
  }

  const drain = roofPlaneDrainUnitPlanMm(rp);
  const eaveIx = roofPlanePreferredEaveEdgeVertexIndicesMm(poly, drain.uxn, drain.uyn);
  let vAlong: Point2D;
  if (eaveIx) {
    const a = poly[eaveIx.i0]!;
    const b = poly[eaveIx.i1]!;
    vAlong = unit2(b.x - a.x, b.y - a.y) ?? { x: 1, y: 0 };
  } else {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const r of raftersAll) {
      const u = unit2(r.ridgePlanMm.x - r.footPlanMm.x, r.ridgePlanMm.y - r.footPlanMm.y);
      if (u) {
        sx += -u.y;
        sy += u.x;
        n += 1;
      }
    }
    vAlong = n > 0 ? unit2(sx / n, sy / n) ?? { x: 1, y: 0 } : { x: 1, y: 0 };
  }

  const sortKey = (pt: Point2D) => pt.x * vAlong.x + pt.y * vAlong.y;
  const rafters = [...raftersAll].sort((a, b) => sortKey(a.footPlanMm) - sortKey(b.footPlanMm));

  const primitives: ReportPrimitive[] = [];

  primitives.push({
    kind: "polyline",
    pointsMm: [...poly],
    closed: true,
    strokeMm: OUTLINE_STROKE_MM,
    muted: true,
  });

  let drawn = 0;
  for (let i = 0; i < rafters.length; i++) {
    const r = rafters[i]!;
    const ax = r.footPlanMm.x;
    const ay = r.footPlanMm.y;
    const bx = r.ridgePlanMm.x;
    const by = r.ridgePlanMm.y;
    const c = clipSegmentToPolygon2dMm(ax, ay, bx, by, poly);
    if (c == null) {
      messages.push(`Стропило ${r.id}: не попало в контур ската после обрезки.`);
      continue;
    }
    primitives.push({
      kind: "line",
      x1Mm: c.sx,
      y1Mm: c.sy,
      x2Mm: c.ex,
      y2Mm: c.ey,
      strokeMm: RAFTER_STROKE_MM,
    });
    drawn += 1;
    const mx = (c.sx + c.ex) * 0.5;
    const my = (c.sy + c.ey) * 0.5;
    const u = unit2(c.ex - c.sx, c.ey - c.sy);
    const ox = u ? u.x * 14 : 0;
    const oy = u ? u.y * 14 : 0;
    primitives.push({
      kind: "text",
      xMm: mx + ox,
      yMm: my + oy,
      text: String(i + 1),
      fontSizeMm: LABEL_FS_MM,
      anchor: "middle",
    });
  }

  if (drawn === 0) {
    return {
      drawingPrimitives: [],
      tableSpec: null,
      worldBounds: null,
      messages: [...messages, "Не удалось отобразить оси стропил в контуре ската."],
    };
  }

  const cx =
    poly.reduce((s, p) => s + p.x, 0) / poly.length;
  const cy =
    poly.reduce((s, p) => s + p.y, 0) / poly.length;
  const ang = Number.isFinite(rp.angleDeg) ? `${Math.round(rp.angleDeg)}°` : "";
  primitives.push({
    kind: "text",
    xMm: cx,
    yMm: cy,
    text: ang ? `Скат ${rp.slopeIndex}  ${ang}` : `Скат ${rp.slopeIndex}`,
    fontSizeMm: TITLE_FS_MM,
    anchor: "middle",
  });

  const feet = rafters.map((r) => r.footPlanMm);
  let row = 0;
  const maxDimRows = 24;
  for (let i = 0; i < feet.length - 1; i++) {
    const a = feet[i]!;
    const b = feet[i + 1]!;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < 1) {
      continue;
    }
    const off = DIM_BASE_OFFSET_MM + row * DIM_ROW_STEP_MM;
    primitives.push(compactParallelDimension(a.x, a.y, b.x, b.y, off, String(Math.round(dist))));
    row += 1;
    if (row >= maxDimRows) {
      messages.push(`Показаны первые ${maxDimRows} интервалов в цепочке размеров.`);
      break;
    }
  }

  let minV = Infinity;
  let maxV = -Infinity;
  let vMinPt: Point2D | null = null;
  let vMaxPt: Point2D | null = null;
  for (const q of poly) {
    const tv = q.x * vAlong.x + q.y * vAlong.y;
    if (tv < minV) {
      minV = tv;
      vMinPt = q;
    }
    if (tv > maxV) {
      maxV = tv;
      vMaxPt = q;
    }
  }
  const f0 = feet[0]!;
  const f1 = feet[feet.length - 1]!;
  const t0 = sortKey(f0);
  const t1 = sortKey(f1);
  const leftGap = t0 - minV;
  const rightGap = maxV - t1;
  if (vMinPt && leftGap > 8 && row < maxDimRows) {
    const off = DIM_BASE_OFFSET_MM + row * DIM_ROW_STEP_MM;
    primitives.push(
      compactParallelDimension(vMinPt.x, vMinPt.y, f0.x, f0.y, off, String(Math.round(leftGap))),
    );
    row += 1;
  }
  if (vMaxPt && rightGap > 8 && row < maxDimRows) {
    const off = DIM_BASE_OFFSET_MM + row * DIM_ROW_STEP_MM;
    primitives.push(
      compactParallelDimension(f1.x, f1.y, vMaxPt.x, vMaxPt.y, off, String(Math.round(rightGap))),
    );
    row += 1;
  }

  const tableSpec = buildSlopeLumberTableSpec(project, rafters);

  messages.push(`Скат ${rp.slopeIndex}: стропил на листе: ${drawn}.`);

  const wb = boundsFromPrimitives(primitives);
  return {
    drawingPrimitives: primitives,
    tableSpec,
    worldBounds: wb,
    messages,
  };
}

function boundsFromPrimitives(primitives: readonly ReportPrimitive[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  const up = (x: number, y: number) => {
    any = true;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const p of primitives) {
    switch (p.kind) {
      case "line":
        up(p.x1Mm, p.y1Mm);
        up(p.x2Mm, p.y2Mm);
        break;
      case "polyline":
        for (const q of p.pointsMm) {
          up(q.x, q.y);
        }
        break;
      case "text":
        up(p.xMm, p.yMm);
        break;
      case "dimensionLine":
        up(p.anchor1Xmm, p.anchor1Ymm);
        up(p.anchor2Xmm, p.anchor2Ymm);
        up(p.dimLineX1mm, p.dimLineY1mm);
        up(p.dimLineX2mm, p.dimLineY2mm);
        up(p.labelXmm, p.labelYmm);
        break;
      default:
        break;
    }
  }
  return any ? { minX, minY, maxX, maxY } : null;
}

function buildSlopeLumberTableSpec(
  project: Project,
  raftersSorted: readonly RoofRafterEntity[],
): RoofFramingSlopeSheetTableSpec | null {
  type Row = { mark: string; section: string; len: number; count: number };
  const groups = new Map<string, Row>();
  let markSeq = 1;
  for (const r of raftersSorted) {
    const len = Math.round(rafterAxisLengthMm(r));
    const sec = formatSectionLabel(project, r);
    const o = resolveRoofRafterSectionOrientation(r);
    const key = `${r.profileId}|${len}|${o}`;
    const ex = groups.get(key);
    if (ex) {
      ex.count += 1;
    } else {
      const mark = `ДЛ.${String(markSeq).padStart(2, "0")}`;
      markSeq += 1;
      groups.set(key, { mark, section: sec, len, count: 1 });
    }
  }

  const rows = [...groups.values()].sort((a, b) => a.len - b.len || a.mark.localeCompare(b.mark, "ru"));
  const colWidthsMm = [7, 22, 34, 26, 14] as const;
  const rh = 4.6;
  const headerRows: (readonly string[])[] = [
    ["Пиломатериалы", "", "", "", ""],
    ["№", "Марка", "Сечение", "Длина, мм", "Кол-во"],
  ];
  const dataRows: (readonly string[])[] = rows.map((r, i) => [
    String(i + 1),
    r.mark,
    r.section,
    String(r.len),
    String(r.count),
  ]);

  let sumLen = 0;
  let sumCount = 0;
  for (const r of rows) {
    sumLen += r.len * r.count;
    sumCount += r.count;
  }
  const section0 = rows[0]?.section ?? "—";
  const sumM = (sumLen / 1000).toFixed(2);
  const footer: (readonly string[])[] = [
    ["Итого", section0, `≈ ${sumM} п.м (Σ мм)`, "", String(sumCount)],
  ];

  const cells = [...headerRows, ...dataRows, ...footer];
  const rowHeightsMm = cells.map(() => rh);

  return {
    colWidthsMm: [...colWidthsMm],
    rowHeightsMm,
    cells,
    fontSizeMm: 2.35,
  };
}
