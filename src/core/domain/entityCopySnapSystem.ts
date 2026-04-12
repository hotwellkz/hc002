/**
 * Унифицированные опорные точки для точного копирования (CAD-style anchor-to-anchor).
 */

import { getProfileById } from "./profileOps";
import { isOpeningPlacedOnWall } from "./opening";
import type { EntityCopyTarget } from "./entityCopySession";
import type { FoundationStripEntity } from "./foundationStrip";
import {
  foundationStripOrthoRingFootprintContoursFromEntityMm,
  foundationStripSegmentFootprintQuadMm,
} from "./foundationStripGeometry";
import type { FloorBeamEntity } from "./floorBeam";
import { floorBeamCenterlineEndpointsMm, floorBeamPlanQuadCornersMm } from "./floorBeamGeometry";
import type { PlanLine } from "./planLine";
import type { SlabEntity } from "./slab";
import type { Project } from "./project";
import type { Wall } from "./wall";
import { wallLengthMm } from "./wallCalculationGeometry";
import { resolveWallProfileLayerStripsForWallVisualization } from "./wallProfileLayers";
import { openingWallSlotCornersInset0Mm } from "../geometry/openingWallSlotCorners";
import { projectPointOntoRayForward } from "../geometry/rayProjection2d";
import { layerIdsForSnapGeometry, wallStripQuadCornersMm } from "../geometry/snap2dPrimitives";
import type { SnapKind, SnapSettings2d } from "../geometry/snap2dTypes";
import type { Point2D } from "../geometry/types";
import type { ViewportTransform } from "../geometry/viewportTransform";
import { worldToScreen } from "../geometry/viewportTransform";
import { applyWallDirectionAngleSnapToPoint } from "../geometry/wallDirectionAngleSnap";
import { snapWorldToGridAlignedToOrigin } from "./projectOriginPlan";
import { SNAP_GRID_PX } from "../geometry/snap2dTypes";

/** Порог захвата опорной точки, пиксели экрана (стабилен при zoom). */
export const ENTITY_COPY_SNAP_PX = 14;

/** Показывать маркеры только у точек не дальше этого расстояния от курсора (экран, px). */
export const ENTITY_COPY_MARKER_REVEAL_PX = 88;

const DEDUPE_MM = 0.45;

export type EntityCopySnapVisualKind = "key" | "vertex" | "edgeMid" | "center" | "intersection" | "grid";

export interface EntityCopySnapTaggedPoint {
  readonly world: Point2D;
  readonly visual: EntityCopySnapVisualKind;
}

export interface EntityCopySnapMarker {
  readonly world: Point2D;
  readonly visual: EntityCopySnapVisualKind;
  readonly active: boolean;
}

function priority(visual: EntityCopySnapVisualKind): number {
  switch (visual) {
    case "key":
      return 0;
    case "vertex":
      return 10;
    case "edgeMid":
      return 20;
    case "center":
      return 30;
    case "intersection":
      return 40;
    case "grid":
      return 50;
    default:
      return 100;
  }
}

function screenDistPx(a: Point2D, b: Point2D, viewport: ViewportTransform): number {
  const sa = worldToScreen(a.x, a.y, viewport);
  const sb = worldToScreen(b.x, b.y, viewport);
  return Math.hypot(sb.x - sa.x, sb.y - sa.y);
}

function wallPointAtAlongMm(wall: Wall, alongMm: number): Point2D {
  const L = wallLengthMm(wall);
  if (L < 1e-9) {
    return { x: wall.start.x, y: wall.start.y };
  }
  const t = alongMm / L;
  return {
    x: wall.start.x + t * (wall.end.x - wall.start.x),
    y: wall.start.y + t * (wall.end.y - wall.start.y),
  };
}

function pushDedupe(out: EntityCopySnapTaggedPoint[], p: EntityCopySnapTaggedPoint): void {
  const j = out.findIndex(
    (q) => Math.hypot(p.world.x - q.world.x, p.world.y - q.world.y) <= DEDUPE_MM,
  );
  if (j < 0) {
    out.push(p);
    return;
  }
  const prev = out[j]!;
  if (priority(p.visual) < priority(prev.visual)) {
    out[j] = p;
  }
}

function ringEdgeMidpoints(ring: readonly Point2D[]): Point2D[] {
  const n = ring.length;
  if (n < 2) {
    return [];
  }
  const mids: Point2D[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    mids.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return mids;
}

function ringCentroidMm(ring: readonly Point2D[]): Point2D {
  const n = ring.length;
  if (n === 0) {
    return { x: 0, y: 0 };
  }
  let aTwice = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const x0 = ring[i]!.x;
    const y0 = ring[i]!.y;
    const x1 = ring[j]!.x;
    const y1 = ring[j]!.y;
    const c = x0 * y1 - x1 * y0;
    aTwice += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  if (Math.abs(aTwice) < 1e-9) {
    let sx = 0;
    let sy = 0;
    for (const p of ring) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }
  const a = aTwice / 2;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

function wallStripQuadsMm(w: Wall, project: Project): Point2D[][] {
  const sx = w.start.x;
  const sy = w.start.y;
  const ex = w.end.x;
  const ey = w.end.y;
  const T = w.thicknessMm;
  if (!Number.isFinite(T) || T <= 0) {
    return [];
  }
  const quads: Point2D[][] = [];
  const profile = w.profileId ? getProfileById(project, w.profileId) : undefined;
  const strips = profile ? resolveWallProfileLayerStripsForWallVisualization(T, profile) : null;
  if (strips && strips.length > 0) {
    let acc = -T / 2;
    for (const strip of strips) {
      const off0 = acc;
      const off1 = acc + strip.thicknessMm;
      const q = wallStripQuadCornersMm(sx, sy, ex, ey, off0, off1);
      if (q) {
        quads.push(q);
      }
      acc = off1;
    }
  } else {
    const q = wallStripQuadCornersMm(sx, sy, ex, ey, -T / 2, T / 2);
    if (q) {
      quads.push(q);
    }
  }
  return quads;
}

function snapPointsForWall(w: Wall, project: Project): EntityCopySnapTaggedPoint[] {
  const out: EntityCopySnapTaggedPoint[] = [];
  const quads = wallStripQuadsMm(w, project);
  for (const q of quads) {
    for (const p of q) {
      pushDedupe(out, { world: { x: p.x, y: p.y }, visual: "vertex" });
    }
    for (const m of ringEdgeMidpoints(q)) {
      pushDedupe(out, { world: m, visual: "edgeMid" });
    }
    pushDedupe(out, { world: ringCentroidMm(q), visual: "center" });
  }
  pushDedupe(out, { world: { x: w.start.x, y: w.start.y }, visual: "vertex" });
  pushDedupe(out, { world: { x: w.end.x, y: w.end.y }, visual: "vertex" });
  const L = wallLengthMm(w);
  if (L >= 1e-6) {
    pushDedupe(out, {
      world: {
        x: (w.start.x + w.end.x) / 2,
        y: (w.start.y + w.end.y) / 2,
      },
      visual: "edgeMid",
    });
  }
  return out;
}

function snapPointsForPlanLine(ln: PlanLine): EntityCopySnapTaggedPoint[] {
  const out: EntityCopySnapTaggedPoint[] = [];
  pushDedupe(out, { world: { x: ln.start.x, y: ln.start.y }, visual: "vertex" });
  pushDedupe(out, { world: { x: ln.end.x, y: ln.end.y }, visual: "vertex" });
  pushDedupe(out, {
    world: { x: (ln.start.x + ln.end.x) / 2, y: (ln.start.y + ln.end.y) / 2 },
    visual: "edgeMid",
  });
  return out;
}

/** Точки сваи в мировых мм (центр объекта задаётся снаружи). */
export function foundationPileSnapPointsWorldMm(cx: number, cy: number, half: number): EntityCopySnapTaggedPoint[] {
  return [
    { world: { x: cx - half, y: cy - half }, visual: "vertex" },
    { world: { x: cx + half, y: cy - half }, visual: "vertex" },
    { world: { x: cx + half, y: cy + half }, visual: "vertex" },
    { world: { x: cx - half, y: cy + half }, visual: "vertex" },
    { world: { x: cx, y: cy }, visual: "center" },
  ];
}

function slabEdgeMidpoints(ring: readonly Point2D[]): Point2D[] {
  const n = ring.length;
  if (n < 2) {
    return [];
  }
  const mids: Point2D[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    mids.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  return mids;
}

/** Опорные точки балки перекрытия: углы контура, середины рёбер, центр, торцы и середина оси. */
export function snapTaggedPointsForFloorBeamEntity(project: Project, beam: FloorBeamEntity): EntityCopySnapTaggedPoint[] {
  const out: EntityCopySnapTaggedPoint[] = [];
  const q = floorBeamPlanQuadCornersMm(project, beam);
  if (q && q.length === 4) {
    for (const p of q) {
      pushDedupe(out, { world: { x: p.x, y: p.y }, visual: "vertex" });
    }
    for (const m of ringEdgeMidpoints(q)) {
      pushDedupe(out, { world: m, visual: "edgeMid" });
    }
    pushDedupe(out, { world: ringCentroidMm(q), visual: "center" });
  }
  const cl = floorBeamCenterlineEndpointsMm(project, beam);
  if (cl) {
    pushDedupe(out, { world: { x: cl.cs.x, y: cl.cs.y }, visual: "key" });
    pushDedupe(out, { world: { x: cl.ce.x, y: cl.ce.y }, visual: "key" });
    const mid = { x: (cl.cs.x + cl.ce.x) / 2, y: (cl.cs.y + cl.ce.y) / 2 };
    pushDedupe(out, { world: mid, visual: "key" });
  }
  return out;
}

function snapPointsForSlab(slab: SlabEntity): EntityCopySnapTaggedPoint[] {
  const out: EntityCopySnapTaggedPoint[] = [];
  const ring = slab.pointsMm;
  for (const p of ring) {
    pushDedupe(out, { world: { x: p.x, y: p.y }, visual: "vertex" });
  }
  for (const m of slabEdgeMidpoints(ring)) {
    pushDedupe(out, { world: m, visual: "edgeMid" });
  }
  if (ring.length >= 3) {
    pushDedupe(out, { world: ringCentroidMm(ring), visual: "center" });
  }
  return out;
}

function snapPointsForStripEntity(e: FoundationStripEntity): EntityCopySnapTaggedPoint[] {
  const out: EntityCopySnapTaggedPoint[] = [];
  const rings: readonly (readonly Point2D[])[] =
    e.kind === "ortho_ring"
      ? (() => {
          const { outer, inner } = foundationStripOrthoRingFootprintContoursFromEntityMm(e);
          return [outer, inner];
        })()
      : e.kind === "footprint_poly"
        ? [e.outerRingMm, ...e.holeRingsMm]
        : [foundationStripSegmentFootprintQuadMm(e.axisStart, e.axisEnd, e.outwardNormalX, e.outwardNormalY, e.sideOutMm, e.sideInMm)];
  for (const ring of rings) {
    if (ring.length < 2) {
      continue;
    }
    for (const p of ring) {
      pushDedupe(out, { world: { x: p.x, y: p.y }, visual: "vertex" });
    }
    for (const m of ringEdgeMidpoints(ring)) {
      pushDedupe(out, { world: m, visual: "edgeMid" });
    }
    pushDedupe(out, { world: ringCentroidMm(ring), visual: "center" });
  }
  return out;
}

function snapPointsForOpeningOnWall(
  wall: Wall,
  opening: { readonly offsetFromStartMm: number; readonly widthMm: number },
): EntityCopySnapTaggedPoint[] {
  const out: EntityCopySnapTaggedPoint[] = [];
  const left = opening.offsetFromStartMm;
  const w = opening.widthMm;
  pushDedupe(out, { world: wallPointAtAlongMm(wall, left), visual: "key" });
  pushDedupe(out, { world: wallPointAtAlongMm(wall, left + w / 2), visual: "key" });
  pushDedupe(out, { world: wallPointAtAlongMm(wall, left + w), visual: "key" });
  return out;
}

function segmentSegmentIntersectionInner(
  a0: Point2D,
  a1: Point2D,
  b0: Point2D,
  b1: Point2D,
): Point2D | null {
  const x1 = a0.x;
  const y1 = a0.y;
  const x2 = a1.x;
  const y2 = a1.y;
  const x3 = b0.x;
  const y3 = b0.y;
  const x4 = b1.x;
  const y4 = b1.y;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-15) {
    return null;
  }
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
  const eps = 1e-4;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) {
    return null;
  }
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

function collectSegmentIntersectionsForLayer(project: Project, layerIds: ReadonlySet<string>): Point2D[] {
  const walls = project.walls.filter((w) => layerIds.has(w.layerId));
  const lines = project.planLines.filter((l) => layerIds.has(l.layerId));
  const segs: { a: Point2D; b: Point2D }[] = [];
  for (const w of walls) {
    segs.push({ a: w.start, b: w.end });
  }
  for (const l of lines) {
    segs.push({ a: l.start, b: l.end });
  }
  for (const b of project.floorBeams) {
    if (!layerIds.has(b.layerId)) {
      continue;
    }
    segs.push({ a: b.refStartMm, b: b.refEndMm });
  }
  const pts: Point2D[] = [];
  for (let i = 0; i < segs.length; i += 1) {
    for (let j = i + 1; j < segs.length; j += 1) {
      const s0 = segs[i]!;
      const s1 = segs[j]!;
      const p = segmentSegmentIntersectionInner(s0.a, s0.b, s1.a, s1.b);
      if (p) {
        pts.push(p);
      }
    }
  }
  return pts;
}

export function entityCopyVisualToSnapKind(visual: EntityCopySnapVisualKind | "none"): SnapKind {
  if (visual === "none") {
    return "none";
  }
  if (visual === "grid") {
    return "grid";
  }
  if (visual === "edgeMid") {
    return "edge";
  }
  return "vertex";
}

/**
 * Все опорные точки для одного объекта-копии (шаг 1) или пусто.
 */
export function collectEntityCopySnapPointsForSourceTarget(
  project: Project,
  layerIds: ReadonlySet<string>,
  target: EntityCopyTarget,
): EntityCopySnapTaggedPoint[] {
  if (target.kind === "wall") {
    const w = project.walls.find((x) => x.id === target.id);
    if (!w || !layerIds.has(w.layerId)) {
      return [];
    }
    return snapPointsForWall(w, project);
  }
  if (target.kind === "planLine") {
    const ln = project.planLines.find((x) => x.id === target.id);
    if (!ln || !layerIds.has(ln.layerId)) {
      return [];
    }
    return snapPointsForPlanLine(ln);
  }
  if (target.kind === "foundationPile") {
    const pile = project.foundationPiles.find((x) => x.id === target.id);
    if (!pile || !layerIds.has(pile.layerId)) {
      return [];
    }
    const h = Math.max(pile.capSizeMm, pile.sizeMm) / 2;
    return foundationPileSnapPointsWorldMm(pile.centerX, pile.centerY, h);
  }
  if (target.kind === "foundationStrip") {
    const e = project.foundationStrips.find((x) => x.id === target.id);
    if (!e || !layerIds.has(e.layerId)) {
      return [];
    }
    return snapPointsForStripEntity(e);
  }
  if (target.kind === "opening") {
    const o = project.openings.find((x) => x.id === target.id);
    if (!o || !isOpeningPlacedOnWall(o)) {
      return [];
    }
    const wall = project.walls.find((w) => w.id === o.wallId);
    if (!wall || !layerIds.has(wall.layerId)) {
      return [];
    }
    return snapPointsForOpeningOnWall(wall, o);
  }
  if (target.kind === "slab") {
    const slab = project.slabs.find((x) => x.id === target.id);
    if (!slab || !layerIds.has(slab.layerId)) {
      return [];
    }
    return snapPointsForSlab(slab);
  }
  if (target.kind === "floorBeam") {
    const beam = project.floorBeams.find((x) => x.id === target.id);
    if (!beam || !layerIds.has(beam.layerId)) {
      return [];
    }
    return snapTaggedPointsForFloorBeamEntity(project, beam);
  }
  return [];
}

/**
 * Опорные точки всех объектов слоя(ёв) + пересечения сегментов (ось стены / линия).
 */
export function collectEntityCopySnapPointsForFullScene(
  project: Project,
  layerIds: ReadonlySet<string>,
): EntityCopySnapTaggedPoint[] {
  const out: EntityCopySnapTaggedPoint[] = [];
  for (const w of project.walls) {
    if (!layerIds.has(w.layerId)) {
      continue;
    }
    for (const p of snapPointsForWall(w, project)) {
      pushDedupe(out, p);
    }
  }
  for (const ln of project.planLines) {
    if (!layerIds.has(ln.layerId)) {
      continue;
    }
    for (const p of snapPointsForPlanLine(ln)) {
      pushDedupe(out, p);
    }
  }
  for (const pile of project.foundationPiles) {
    if (!layerIds.has(pile.layerId)) {
      continue;
    }
    const h = Math.max(pile.capSizeMm, pile.sizeMm) / 2;
    for (const p of foundationPileSnapPointsWorldMm(pile.centerX, pile.centerY, h)) {
      pushDedupe(out, p);
    }
  }
  for (const fs of project.foundationStrips) {
    if (!layerIds.has(fs.layerId)) {
      continue;
    }
    for (const p of snapPointsForStripEntity(fs)) {
      pushDedupe(out, p);
    }
  }
  for (const o of project.openings) {
    if (!isOpeningPlacedOnWall(o)) {
      continue;
    }
    const wall = project.walls.find((w) => w.id === o.wallId);
    if (!wall || !layerIds.has(wall.layerId)) {
      continue;
    }
    for (const p of snapPointsForOpeningOnWall(wall, o)) {
      pushDedupe(out, p);
    }
    const slot = openingWallSlotCornersInset0Mm(wall, o.offsetFromStartMm, o.widthMm);
    if (slot) {
      for (const c of slot) {
        pushDedupe(out, { world: c, visual: "vertex" });
      }
    }
  }
  for (const slab of project.slabs) {
    if (!layerIds.has(slab.layerId)) {
      continue;
    }
    for (const p of snapPointsForSlab(slab)) {
      pushDedupe(out, p);
    }
  }
  for (const beam of project.floorBeams) {
    if (!layerIds.has(beam.layerId)) {
      continue;
    }
    for (const p of snapTaggedPointsForFloorBeamEntity(project, beam)) {
      pushDedupe(out, p);
    }
  }
  for (const ip of collectSegmentIntersectionsForLayer(project, layerIds)) {
    pushDedupe(out, { world: ip, visual: "intersection" });
  }
  if (project.projectOrigin) {
    const o = project.projectOrigin;
    pushDedupe(out, { world: { x: o.x, y: o.y }, visual: "key" });
  }
  return out;
}

/**
 * Ближайшая структурная опорная точка (как при копировании сущностей), для общего snap плана.
 */
export function pickNearestStructuralTaggedSnapMm(
  refWorldMm: Point2D,
  viewport: ViewportTransform,
  taggedPoints: readonly EntityCopySnapTaggedPoint[],
  maxScreenPx: number,
): { readonly point: Point2D; readonly snapKind: SnapKind } | null {
  let best: { p: EntityCopySnapTaggedPoint; d: number } | null = null;
  for (const p of taggedPoints) {
    if (p.visual === "grid") {
      continue;
    }
    const d = screenDistPx(refWorldMm, p.world, viewport);
    if (d > maxScreenPx) {
      continue;
    }
    if (!best) {
      best = { p, d };
      continue;
    }
    const pb = priority(best.p.visual);
    const pc = priority(p.visual);
    if (pc < pb || (pc === pb && d < best.d)) {
      best = { p, d };
    }
  }
  if (!best) {
    return null;
  }
  return { point: best.p.world, snapKind: entityCopyVisualToSnapKind(best.p.visual) };
}

export interface EntityCopySnapResolveInput {
  readonly refWorldMm: Point2D;
  readonly viewport: ViewportTransform;
  readonly project: Project;
  readonly snapSettings: SnapSettings2d;
  readonly gridStepMm: number;
  readonly altKey: boolean;
  readonly structuralSnapEnabled: boolean;
  readonly taggedPoints: readonly EntityCopySnapTaggedPoint[];
}

export interface EntityCopySnapResolveResult {
  readonly point: Point2D;
  readonly visual: EntityCopySnapVisualKind | "none";
  readonly snapKind: SnapKind;
}

/**
 * Выбор ближайшей опоры: приоритет типа, затем экранное расстояние до ref.
 * Сетка — только если нет объектной опоры в пределах ENTITY_COPY_SNAP_PX (или alt).
 */
export function resolveEntityCopySnap(input: EntityCopySnapResolveInput): EntityCopySnapResolveResult {
  const { refWorldMm, viewport, project, snapSettings, gridStepMm, altKey, structuralSnapEnabled, taggedPoints } =
    input;

  if (altKey) {
    return {
      point: { x: refWorldMm.x, y: refWorldMm.y },
      visual: "none",
      snapKind: "none",
    };
  }

  let best: { p: EntityCopySnapTaggedPoint; d: number } | null = null;

  if (structuralSnapEnabled) {
    for (const p of taggedPoints) {
      if (p.visual === "grid") {
        continue;
      }
      const d = screenDistPx(refWorldMm, p.world, viewport);
      if (d > ENTITY_COPY_SNAP_PX) {
        continue;
      }
      if (!best) {
        best = { p, d };
        continue;
      }
      const pb = priority(best.p.visual);
      const pc = priority(p.visual);
      if (pc < pb || (pc === pb && d < best.d)) {
        best = { p, d };
      }
    }
  }

  let gridCandidate: EntityCopySnapTaggedPoint | null = null;
  if (snapSettings.snapToGrid && gridStepMm > 0) {
    const g = snapWorldToGridAlignedToOrigin(refWorldMm, gridStepMm, project.projectOrigin ?? null);
    const dg = screenDistPx(refWorldMm, g, viewport);
    if (dg <= SNAP_GRID_PX) {
      gridCandidate = { world: g, visual: "grid" };
    }
  }

  if (best) {
    return {
      point: { x: best.p.world.x, y: best.p.world.y },
      visual: best.p.visual,
      snapKind: entityCopyVisualToSnapKind(best.p.visual),
    };
  }

  if (gridCandidate && snapSettings.snapToGrid) {
    const dg = screenDistPx(refWorldMm, gridCandidate.world, viewport);
    if (dg <= SNAP_GRID_PX) {
      return {
        point: gridCandidate.world,
        visual: "grid",
        snapKind: "grid",
      };
    }
  }

  return {
    point: { x: refWorldMm.x, y: refWorldMm.y },
    visual: "none",
    snapKind: "none",
  };
}

export function buildEntityCopySnapMarkers(
  cursorWorldMm: Point2D,
  viewport: ViewportTransform,
  taggedPoints: readonly EntityCopySnapTaggedPoint[],
  resolvedPoint: Point2D | null,
  structuralSnapEnabled: boolean,
): EntityCopySnapMarker[] {
  if (!structuralSnapEnabled) {
    return [];
  }
  const markers: EntityCopySnapMarker[] = [];
  for (const p of taggedPoints) {
    if (p.visual === "grid") {
      continue;
    }
    const d = screenDistPx(cursorWorldMm, p.world, viewport);
    if (d > ENTITY_COPY_MARKER_REVEAL_PX) {
      continue;
    }
    const active =
      resolvedPoint != null &&
      Math.hypot(p.world.x - resolvedPoint.x, p.world.y - resolvedPoint.y) < DEDUPE_MM;
    markers.push({ world: p.world, visual: p.visual, active });
  }
  return markers;
}

export interface EntityCopyPickTargetRefInput {
  readonly anchorWorldMm: Point2D;
  readonly rawWorldMm: Point2D;
  readonly shiftDirectionLockUnit: Point2D | null;
  readonly angleSnapLockedDeg: number | null;
  readonly altKey: boolean;
}

/**
 * Промежуточная точка на шаге 2: проекция на луч Shift или угловая привязка направления.
 */
export function computeEntityCopyPickTargetRefWorldMm(
  input: EntityCopyPickTargetRefInput,
): { readonly refWorldMm: Point2D; readonly nextAngleSnapLockedDeg: number | null } {
  const { anchorWorldMm, rawWorldMm, shiftDirectionLockUnit, angleSnapLockedDeg, altKey } = input;
  if (altKey) {
    return { refWorldMm: { x: rawWorldMm.x, y: rawWorldMm.y }, nextAngleSnapLockedDeg: null };
  }
  if (shiftDirectionLockUnit) {
    const ref = projectPointOntoRayForward(anchorWorldMm, shiftDirectionLockUnit, rawWorldMm);
    return { refWorldMm: ref, nextAngleSnapLockedDeg: angleSnapLockedDeg };
  }
  const ang = applyWallDirectionAngleSnapToPoint(anchorWorldMm, rawWorldMm, angleSnapLockedDeg, {});
  return { refWorldMm: ang.point, nextAngleSnapLockedDeg: ang.nextLockedDeg };
}

export function layerIdsForEntityCopy(project: Project): ReadonlySet<string> {
  return layerIdsForSnapGeometry(project);
}
