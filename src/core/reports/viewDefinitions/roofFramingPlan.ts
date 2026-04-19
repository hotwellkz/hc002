/**
 * Отчёт «Крыша — Стропильная система»: план, геометрия из модели
 * (стропила, конёк, прогоны, стойки, подкосы) с отсечением по контурам крыши.
 */

import type { Project } from "../../domain/project";
import { clipSegmentToPolygon2dMm } from "../../domain/roofRafterGeometry";
import { roofPlanePolygonMm } from "../../domain/roofPlane";
import { beamPlanThicknessAndVerticalFromOrientationMm } from "../../domain/floorBeamSection";
import { getProfileById } from "../../domain/profileOps";
import { pointInPolygonMm } from "../../domain/wallLumberPlan2dGeometry";
import { layerIdsForSnapGeometry } from "../../geometry/snap2dPrimitives";
import type { Point2D } from "../../geometry/types";
import type { ReportPrimitive } from "../types";

const OUTLINE_STROKE_MM = 0.2;
const SLOPE_EDGE_MUTED = true;
const RIDGE_STROKE_MM = 0.38;
const RAFTER_STROKE_MM = 0.3;
const PURLIN_STROKE_MM = 0.26;
const STRUT_STROKE_MM = 0.24;
const POST_STROKE_MM = 0.22;
const POST_MIN_SIDE_MM = 35;

export interface RoofFramingPlanWorldBuild {
  readonly primitives: readonly ReportPrimitive[];
  readonly worldBounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number } | null;
  readonly messages: readonly string[];
}

function unionBoundsFromPolys(polys: readonly (readonly Point2D[])[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  let b: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (const poly of polys) {
    for (const p of poly) {
      if (!b) {
        b = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
      } else {
        b.minX = Math.min(b.minX, p.x);
        b.minY = Math.min(b.minY, p.y);
        b.maxX = Math.max(b.maxX, p.x);
        b.maxY = Math.max(b.maxY, p.y);
      }
    }
  }
  return b;
}

function footprintByRoofSystemId(project: Project, roofSystemId: string): readonly Point2D[] | null {
  const sys = project.roofSystems.find((s) => s.id === roofSystemId);
  if (!sys || sys.footprintMm.length < 3) {
    return null;
  }
  return sys.footprintMm;
}

/**
 * Наличие элементов стропильной системы на слоях, участвующих в отчёте (как план скатов).
 */
export function countRoofFramingEntitiesForReport(project: Project): {
  readonly rafters: number;
  readonly purlins: number;
  readonly posts: number;
  readonly struts: number;
  readonly total: number;
} {
  const layerIds = layerIdsForSnapGeometry(project);
  let rafters = 0;
  let purlins = 0;
  let posts = 0;
  let struts = 0;
  for (const r of project.roofRafters) {
    if (layerIds.has(r.layerId)) {
      rafters += 1;
    }
  }
  for (const p of project.roofPurlins) {
    if (layerIds.has(p.layerId)) {
      purlins += 1;
    }
  }
  for (const p of project.roofPosts) {
    if (layerIds.has(p.layerId)) {
      posts += 1;
    }
  }
  for (const s of project.roofStruts) {
    if (layerIds.has(s.layerId)) {
      struts += 1;
    }
  }
  return { rafters, purlins, posts, struts, total: rafters + purlins + posts + struts };
}

function clipRidgeOrPurlinSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  footprint: readonly Point2D[],
): { sx: number; sy: number; ex: number; ey: number } | null {
  const c = clipSegmentToPolygon2dMm(ax, ay, bx, by, footprint);
  if (c != null) {
    return c;
  }
  const len = Math.hypot(bx - ax, by - ay);
  if (len < 1) {
    return null;
  }
  const mx = (ax + bx) * 0.5;
  const my = (ay + by) * 0.5;
  if (pointInPolygonMm(mx, my, footprint)) {
    return { sx: ax, sy: ay, ex: bx, ey: by };
  }
  return { sx: ax, sy: ay, ex: bx, ey: by };
}

export function buildRoofFramingPlanWorld(project: Project): RoofFramingPlanWorldBuild {
  const messages: string[] = [];
  const layerIds = layerIdsForSnapGeometry(project);
  const planes = project.roofPlanes.filter((rp) => layerIds.has(rp.layerId));

  if (planes.length === 0) {
    return {
      primitives: [],
      worldBounds: null,
      messages: ["Нет скатов крыши на видимых слоях — нечего показывать в плане стропильной системы."],
    };
  }

  const framing = countRoofFramingEntitiesForReport(project);
  if (framing.total === 0) {
    return {
      primitives: [],
      worldBounds: null,
      messages: [
        "В модели нет стропильной системы на видимых слоях (стропила, прогоны, стойки, подкосы). Сгенерируйте стропила или включите слой с конструкцией.",
      ],
    };
  }

  const polys: readonly Point2D[][] = planes.map((rp) => [...roofPlanePolygonMm(rp)]);
  const unionBbox = unionBoundsFromPolys(polys);
  if (!unionBbox) {
    return { primitives: [], worldBounds: null, messages: ["Не удалось построить контуры скатов."] };
  }

  const primitives: ReportPrimitive[] = [];
  const planePolyById = new Map<string, readonly Point2D[]>();
  for (const rp of planes) {
    planePolyById.set(rp.id, roofPlanePolygonMm(rp));
  }

  for (const poly of polys) {
    primitives.push({
      kind: "polyline",
      pointsMm: poly,
      closed: true,
      strokeMm: OUTLINE_STROKE_MM,
      muted: SLOPE_EDGE_MUTED,
    });
  }

  const systemsOnLayers = project.roofSystems.filter((s) => layerIds.has(s.layerId));
  let ridgeSegDrawn = 0;
  for (const sys of systemsOnLayers) {
    const fp = sys.footprintMm.length >= 3 ? sys.footprintMm : null;
    for (const seg of sys.ridgeSegmentsPlanMm) {
      if (fp) {
        const c = clipRidgeOrPurlinSegment(seg.ax, seg.ay, seg.bx, seg.by, fp);
        if (c == null) {
          continue;
        }
        primitives.push({
          kind: "line",
          x1Mm: c.sx,
          y1Mm: c.sy,
          x2Mm: c.ex,
          y2Mm: c.ey,
          strokeMm: RIDGE_STROKE_MM,
        });
      } else {
        primitives.push({
          kind: "line",
          x1Mm: seg.ax,
          y1Mm: seg.ay,
          x2Mm: seg.bx,
          y2Mm: seg.by,
          strokeMm: RIDGE_STROKE_MM,
        });
      }
      ridgeSegDrawn += 1;
    }
  }
  if (systemsOnLayers.length > 0 && ridgeSegDrawn === 0) {
    messages.push("В данных крыши нет линии конька в плане (ridgeSegmentsPlanMm) — ось конька на листе не показана.");
  }

  let rafterDrawn = 0;
  for (const r of project.roofRafters) {
    if (!layerIds.has(r.layerId)) {
      continue;
    }
    const poly = planePolyById.get(r.roofPlaneId);
    if (!poly || poly.length < 3) {
      messages.push(`Стропило ${r.id}: не найден полигон ската ${r.roofPlaneId}.`);
      continue;
    }
    const ax = r.footPlanMm.x;
    const ay = r.footPlanMm.y;
    const bx = r.ridgePlanMm.x;
    const by = r.ridgePlanMm.y;
    const c = clipSegmentToPolygon2dMm(ax, ay, bx, by, poly);
    if (c == null) {
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
    rafterDrawn += 1;
  }
  if (framing.rafters > 0 && rafterDrawn === 0) {
    messages.push("Стропила есть в модели, но не удалось отобразить оси в плане (проверьте скаты и контуры).");
  }

  let purlinSegs = 0;
  for (const pu of project.roofPurlins) {
    if (!layerIds.has(pu.layerId)) {
      continue;
    }
    const fp = footprintByRoofSystemId(project, pu.roofSystemId);
    const pts = pu.polylinePlanMm;
    if (pts.length < 2) {
      continue;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      if (fp && fp.length >= 3) {
        const c = clipRidgeOrPurlinSegment(a.x, a.y, b.x, b.y, fp);
        if (c == null) {
          continue;
        }
        primitives.push({
          kind: "line",
          x1Mm: c.sx,
          y1Mm: c.sy,
          x2Mm: c.ex,
          y2Mm: c.ey,
          strokeMm: PURLIN_STROKE_MM,
          dashMm: [9, 5],
        });
        purlinSegs += 1;
      } else {
        primitives.push({
          kind: "line",
          x1Mm: a.x,
          y1Mm: a.y,
          x2Mm: b.x,
          y2Mm: b.y,
          strokeMm: PURLIN_STROKE_MM,
          dashMm: [9, 5],
        });
        purlinSegs += 1;
      }
    }
  }

  let postsDrawn = 0;
  for (const post of project.roofPosts) {
    if (!layerIds.has(post.layerId)) {
      continue;
    }
    const fp = footprintByRoofSystemId(project, post.roofSystemId);
    const cx = post.planCenterMm.x;
    const cy = post.planCenterMm.y;
    if (fp && fp.length >= 3 && !pointInPolygonMm(cx, cy, fp)) {
      continue;
    }
    const profile = getProfileById(project, post.profileId);
    const side = profile
      ? Math.max(
          POST_MIN_SIDE_MM,
          beamPlanThicknessAndVerticalFromOrientationMm(profile, post.sectionOrientation).planThicknessMm,
        )
      : POST_MIN_SIDE_MM;
    primitives.push({
      kind: "rect",
      xMm: cx - side * 0.5,
      yMm: cy - side * 0.5,
      widthMm: side,
      heightMm: side,
      strokeMm: POST_STROKE_MM,
    });
    postsDrawn += 1;
  }

  let strutsDrawn = 0;
  for (const st of project.roofStruts) {
    if (!layerIds.has(st.layerId)) {
      continue;
    }
    const fp = footprintByRoofSystemId(project, st.roofSystemId);
    const ax = st.startPlanMm.x;
    const ay = st.startPlanMm.y;
    const bx = st.endPlanMm.x;
    const by = st.endPlanMm.y;
    if (fp && fp.length >= 3) {
      const c = clipSegmentToPolygon2dMm(ax, ay, bx, by, fp) ?? clipRidgeOrPurlinSegment(ax, ay, bx, by, fp);
      if (c == null) {
        continue;
      }
      primitives.push({
        kind: "line",
        x1Mm: c.sx,
        y1Mm: c.sy,
        x2Mm: c.ex,
        y2Mm: c.ey,
        strokeMm: STRUT_STROKE_MM,
        dashMm: [2.5, 3.5],
      });
    } else {
      primitives.push({
        kind: "line",
        x1Mm: ax,
        y1Mm: ay,
        x2Mm: bx,
        y2Mm: by,
        strokeMm: STRUT_STROKE_MM,
        dashMm: [2.5, 3.5],
      });
    }
    strutsDrawn += 1;
  }

  const parts: string[] = [];
  if (rafterDrawn > 0) {
    parts.push(`стропил: ${rafterDrawn}`);
  }
  if (ridgeSegDrawn > 0) {
    parts.push(`участков конька: ${ridgeSegDrawn}`);
  }
  if (purlinSegs > 0) {
    parts.push(`сегментов прогонов: ${purlinSegs}`);
  }
  if (postsDrawn > 0) {
    parts.push(`стоек: ${postsDrawn}`);
  }
  if (strutsDrawn > 0) {
    parts.push(`подкосов: ${strutsDrawn}`);
  }
  if (parts.length > 0) {
    messages.push(`На листе: ${parts.join("; ")}.`);
  }

  if (framing.purlins > 0 && purlinSegs === 0) {
    messages.push("Прогоны есть в модели, но не удалось отобразить их в плане (проверьте полилинию и контур крыши).");
  }
  if (framing.posts > 0 && postsDrawn === 0) {
    messages.push("Стойки есть в модели, но не попали в контур основания крыши в плане.");
  }
  if (framing.struts > 0 && strutsDrawn === 0) {
    messages.push("Подкосы есть в модели, но не удалось отобразить их в плане.");
  }

  return {
    primitives,
    worldBounds: unionBbox,
    messages,
  };
}
