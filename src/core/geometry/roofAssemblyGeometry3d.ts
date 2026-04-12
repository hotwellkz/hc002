import { Matrix4, Quaternion, ShapeUtils, Vector2, Vector3 } from "three";

import { computeAllRoofPlanesZAdjustMmByPlaneIdInProject } from "@/core/domain/roofGroupHeightAdjust";
import { computeLayerVerticalStack } from "@/core/domain/layerVerticalStack";
import type { Project } from "@/core/domain/project";
import type { RoofPlaneEntity } from "@/core/domain/roofPlane";
import { roofPlanePolygonMm } from "@/core/domain/roofPlane";
import type { RoofProfileAssembly } from "@/core/domain/roofProfileAssembly";

const MM_TO_M = 0.001;

/** Внутренние мм: X — план X, Y — вверх, Z — минус план Y (как у стен в meshSpec). */
export type RoofThreeMm = readonly [number, number, number];

export interface RoofSlopeSurfaceMeshMm {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  /** Единичная нормаль наружу (в сторону неба), в мм-пространстве. */
  readonly outwardNormal: RoofThreeMm;
}

function unit3(x: number, y: number, z: number): RoofThreeMm {
  const l = Math.hypot(x, y, z);
  if (l < 1e-9) {
    return [0, 1, 0];
  }
  return [x / l, y / l, z / l];
}

function dot3(a: RoofThreeMm, b: RoofThreeMm): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub3(a: RoofThreeMm, b: RoofThreeMm): RoofThreeMm {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add3(a: RoofThreeMm, b: RoofThreeMm): RoofThreeMm {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(a: RoofThreeMm, s: number): RoofThreeMm {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function cross3(a: RoofThreeMm, b: RoofThreeMm): RoofThreeMm {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** План (мм) → координаты как у стен: X, вертикаль Y, Z = −планY. */
export function roofPlanVertexToThreeMm(pxMm: number, pyMm: number, zUpMm: number): RoofThreeMm {
  return [pxMm, zUpMm, -pyMm];
}

/**
 * Плоскость ската: сток в плане по `slopeDirection`, подъём против стока.
 * `zAdjustMm` — согласование стыков с соседними скатами (см. roofGroupHeightAdjust).
 *
 * Важно: в плане (x,y) точка (x,y) → Three (x, z, -y). Горизонтальный вектор стока (ux, uy)
 * в плане соответствует (ux, 0, -uy) в мм-пространстве Three — не (ux, 0, uy).
 */
export function roofSlopeVerticesThreeMm(
  rp: RoofPlaneEntity,
  layerBaseMm: number,
  zAdjustMm = 0,
): { readonly verts: RoofThreeMm[]; readonly outwardNormal: RoofThreeMm } {
  const poly = roofPlanePolygonMm(rp);
  const ux = rp.slopeDirection.x;
  const uy = rp.slopeDirection.y;
  const ulen = Math.hypot(ux, uy);
  const uxn = ulen > 1e-9 ? ux / ulen : 1;
  const uyn = ulen > 1e-9 ? uy / ulen : 0;
  let maxDot = Number.NEGATIVE_INFINITY;
  for (const p of poly) {
    const d = p.x * uxn + p.y * uyn;
    maxDot = Math.max(maxDot, d);
  }
  const pitchRad = (rp.angleDeg * Math.PI) / 180;
  const tanP = Math.tan(pitchRad);
  const z0 = layerBaseMm + rp.levelMm + zAdjustMm;
  const verts: RoofThreeMm[] = poly.map((p) => {
    const d = p.x * uxn + p.y * uyn;
    const rise = (maxDot - d) * tanP;
    const zUp = z0 + rise;
    return roofPlanVertexToThreeMm(p.x, p.y, zUp);
  });

  /** Вдоль карниза в плане: (-uy, ux) → Three (-uyn, 0, uxn)? py → -Z: ( -uyn, 0, -(-uxn)? ) */
  const tEave = unit3(-uyn, 0, -uxn);
  /** Сток в плане (ux, uy): в Three горизонталь (uxn, 0, -uyn), вверх dz/ds = -tan при движении вниз по скату. */
  const tDownRaw: RoofThreeMm = [uxn, -tanP, -uyn];
  const tDown = unit3(tDownRaw[0], tDownRaw[1], tDownRaw[2]);

  const cCross = cross3(tEave, tDown);
  let n = unit3(cCross[0], cCross[1], cCross[2]);
  if (n[1] < 0) {
    n = scale3(n, -1);
  }
  return { verts, outwardNormal: n };
}

function triangulateVerticesOnPlane(verts: RoofThreeMm[], outwardNormal: RoofThreeMm): { positions: Float32Array; indices: Uint32Array } {
  const o = verts[0]!;
  const a = sub3(verts[1]!, o);
  let u = unit3(a[0], a[1], a[2]);
  let n = outwardNormal;
  let v = unit3(n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]);
  if (Math.hypot(v[0], v[1], v[2]) < 1e-9) {
    u = unit3(1, 0, 0);
    v = unit3(n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]);
  }
  let contour: Vector2[] = verts.map((p) => {
    const d = sub3(p, o);
    return new Vector2(dot3(d, u), dot3(d, v));
  });
  if (polygonSignedArea2D(contour) < 0) {
    contour = [...contour].reverse();
  }
  const triGroups = ShapeUtils.triangulateShape(contour, []) as number[][];
  const idx: number[] = [];
  for (const t of triGroups) {
    if (t.length >= 3) {
      idx.push(t[0]!, t[1]!, t[2]!);
    }
  }
  const positions = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    const p = verts[i]!;
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  return { positions, indices: new Uint32Array(idx) };
}

function polygonSignedArea2D(poly: readonly Vector2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    s += p.x * q.y - q.x * p.y;
  }
  return s * 0.5;
}

export function buildRoofSlopeSurfaceMeshMm(
  rp: RoofPlaneEntity,
  layerBaseMm: number,
  zAdjustMm = 0,
): RoofSlopeSurfaceMeshMm | null {
  const { verts, outwardNormal } = roofSlopeVerticesThreeMm(rp, layerBaseMm, zAdjustMm);
  if (verts.length < 3) {
    return null;
  }
  const { positions, indices } = triangulateVerticesOnPlane(verts, outwardNormal);
  return { positions, indices, outwardNormal };
}

export function offsetRoofMeshMm(mesh: RoofSlopeSurfaceMeshMm, deltaAlongNormalMm: number): RoofSlopeSurfaceMeshMm {
  const nx = mesh.outwardNormal[0];
  const ny = mesh.outwardNormal[1];
  const nz = mesh.outwardNormal[2];
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    positions[i] = mesh.positions[i]! + nx * deltaAlongNormalMm;
    positions[i + 1] = mesh.positions[i + 1]! + ny * deltaAlongNormalMm;
    positions[i + 2] = mesh.positions[i + 2]! + nz * deltaAlongNormalMm;
  }
  return { positions, indices: new Uint32Array(mesh.indices), outwardNormal: mesh.outwardNormal };
}

export interface RoofBattenBoxSpecMm {
  readonly center: RoofThreeMm;
  readonly lengthMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly quaternion: readonly [number, number, number, number];
}

/** Отрезок оси доски в координатах плана (мм): ортогональная проекция линии на плоскость XY. */
export interface RoofBattenPlanSegmentMm {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * Отрезок пересечения выпуклого многоугольника с прямой n·x = c (n — единичная), в 2D.
 * Вершины poly в CCW; для выпуклого и секущей линии внутри — ровно один отрезок.
 */
function convexPolygonLineClipSegment2D(
  poly: readonly Vector2[],
  n: Vector2,
  c: number,
): { readonly a: Vector2; readonly b: Vector2 } | null {
  const n0 = n.clone();
  if (n0.lengthSq() < 1e-18) {
    return null;
  }
  n0.normalize();
  const tang = new Vector2(-n0.y, n0.x);
  const eps = 1e-5;
  const hits: { readonly t: number; readonly p: Vector2 }[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i]!;
    const p1 = poly[(i + 1) % poly.length]!;
    const d0 = n0.dot(p0) - c;
    const d1 = n0.dot(p1) - c;
    if (Math.abs(d0) < eps) {
      hits.push({ t: tang.dot(p0), p: p0.clone() });
    }
    if (Math.abs(d1) < eps && Math.abs(d0) >= eps) {
      hits.push({ t: tang.dot(p1), p: p1.clone() });
    }
    if (d0 * d1 < -eps) {
      const u = d0 / (d0 - d1);
      const px = p0.x + (p1.x - p0.x) * u;
      const py = p0.y + (p1.y - p0.y) * u;
      const p = new Vector2(px, py);
      hits.push({ t: tang.dot(p), p });
    }
  }
  if (hits.length < 2) {
    return null;
  }
  hits.sort((ha, hb) => ha.t - hb.t);
  const uniq: Vector2[] = [];
  for (const h of hits) {
    const last = uniq[uniq.length - 1];
    if (!last || last.distanceToSquared(h.p) > eps * eps) {
      uniq.push(h.p);
    }
  }
  if (uniq.length < 2) {
    return null;
  }
  const a = uniq[0]!;
  const b = uniq[uniq.length - 1]!;
  if (a.distanceToSquared(b) < 4) {
    return null;
  }
  return { a, b };
}

interface RoofBattenStripPack {
  readonly strips: readonly { readonly a: RoofThreeMm; readonly b: RoofThreeMm }[];
  readonly outwardNormal: RoofThreeMm;
}

function unitPlan2(x: number, y: number): { readonly x: number; readonly y: number } {
  const l = Math.hypot(x, y);
  if (l < 1e-12) {
    return { x: 1, y: 0 };
  }
  return { x: x / l, y: y / l };
}

/** Высота точки (мм вверх) на плоскости ската над планом — та же формула, что в `roofSlopeVerticesThreeMm`. */
function roofZUpAtPlanPointMm(
  rp: RoofPlaneEntity,
  layerBaseMm: number,
  zAdjustMm: number,
  px: number,
  py: number,
): number {
  const poly = roofPlanePolygonMm(rp);
  const ux = rp.slopeDirection.x;
  const uy = rp.slopeDirection.y;
  const ulen = Math.hypot(ux, uy);
  const uxn = ulen > 1e-9 ? ux / ulen : 1;
  const uyn = ulen > 1e-9 ? uy / ulen : 0;
  let maxDot = Number.NEGATIVE_INFINITY;
  for (const p of poly) {
    maxDot = Math.max(maxDot, p.x * uxn + p.y * uyn);
  }
  const d = px * uxn + py * uyn;
  const tanP = Math.tan((rp.angleDeg * Math.PI) / 180);
  return layerBaseMm + rp.levelMm + zAdjustMm + (maxDot - d) * tanP;
}

function planPointFromStMm(
  s: number,
  t: number,
  w: { readonly x: number; readonly y: number },
  uRun: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  return { x: s * w.x + t * uRun.x, y: s * w.y + t * uRun.y };
}

/**
 * Обрешётка: сетка в координатах **плана** (мм на чертеже).
 * Шаг `battenStepMm` — расстояние между осями досок по горизонтали перпендикулярно длинной стороне доски на плане
 * (center-to-center); совпадает с измерением линейкой на 2D и с тем же подъёмом точек на наклонную плоскость в 3D.
 */
function buildRoofBattenStripPackMm(
  rp: RoofPlaneEntity,
  layerBaseMm: number,
  asm: RoofProfileAssembly,
  zAdjustMm: number,
): RoofBattenStripPack | null {
  if (!asm.battenUse) {
    return null;
  }
  const { outwardNormal: n } = roofSlopeVerticesThreeMm(rp, layerBaseMm, zAdjustMm);
  const polyPlan = roofPlanePolygonMm(rp);
  if (polyPlan.length < 3) {
    return null;
  }

  const fall = unitPlan2(rp.slopeDirection.x, rp.slopeDirection.y);
  /** Длинная сторона доски в плане; шаг откладывается вдоль `wSpace` (перпендикуляр к доске на плане). */
  let uRun: { readonly x: number; readonly y: number };
  let wSpace: { readonly x: number; readonly y: number };
  if (asm.battenLayoutDir === "parallel_to_fall") {
    uRun = fall;
    wSpace = { x: -fall.y, y: fall.x };
  } else {
    uRun = { x: -fall.y, y: fall.x };
    wSpace = fall;
  }

  const polySt: Vector2[] = polyPlan.map(
    (p) => new Vector2(p.x * wSpace.x + p.y * wSpace.y, p.x * uRun.x + p.y * uRun.y),
  );
  let area2 = 0;
  for (let i = 0; i < polySt.length; i++) {
    const p0 = polySt[i]!;
    const p1 = polySt[(i + 1) % polySt.length]!;
    area2 += p0.x * p1.y - p1.x * p0.y;
  }
  if (area2 < 0) {
    for (const p of polySt) {
      p.x = -p.x;
    }
  }

  let minS = Number.POSITIVE_INFINITY;
  let maxS = Number.NEGATIVE_INFINITY;
  for (const p of polySt) {
    minS = Math.min(minS, p.x);
    maxS = Math.max(maxS, p.x);
  }
  const step = Math.max(1, asm.battenStepMm);
  /** От края контура до первой/последней оси: половина ширины доски (от грани до оси). */
  const inset = Math.max(1, asm.battenWidthMm * 0.5);

  const strips: { readonly a: RoofThreeMm; readonly b: RoofThreeMm }[] = [];
  const nLine = new Vector2(1, 0);

  for (let c = minS + inset; c <= maxS - inset + 1e-6; c += step) {
    const seg = convexPolygonLineClipSegment2D(polySt, nLine, c);
    if (!seg) {
      continue;
    }
    const pa = planPointFromStMm(seg.a.x, seg.a.y, wSpace, uRun);
    const pb = planPointFromStMm(seg.b.x, seg.b.y, wSpace, uRun);
    const zA = roofZUpAtPlanPointMm(rp, layerBaseMm, zAdjustMm, pa.x, pa.y);
    const zB = roofZUpAtPlanPointMm(rp, layerBaseMm, zAdjustMm, pb.x, pb.y);
    const pA = roofPlanVertexToThreeMm(pa.x, pa.y, zA);
    const pB = roofPlanVertexToThreeMm(pb.x, pb.y, zB);
    const len = Math.hypot(pB[0] - pA[0], pB[1] - pA[1], pB[2] - pA[2]);
    if (len < 10) {
      continue;
    }
    strips.push({ a: pA, b: pB });
  }
  return { strips, outwardNormal: n };
}

/**
 * Линии обрешётки на поверхности ската в мм-Three (без смещения вдоль нормали к доскам).
 * Та же сетка, что и для 3D-боксов; для плана — `buildRoofBattenPlanSegmentsMm`.
 */
export function buildRoofBattenStripSegmentsOnSlopeThreeMm(
  rp: RoofPlaneEntity,
  layerBaseMm: number,
  asm: RoofProfileAssembly,
  zAdjustMm = 0,
): readonly { readonly a: RoofThreeMm; readonly b: RoofThreeMm }[] {
  return buildRoofBattenStripPackMm(rp, layerBaseMm, asm, zAdjustMm)?.strips ?? [];
}

/**
 * Обрешётка в 2D-плане (мм): ортогональная проекция тех же отрезков, что и в 3D (`roofPlanVertexToThreeMm`: py = −Z_three).
 */
export function buildRoofBattenPlanSegmentsMm(
  rp: RoofPlaneEntity,
  layerBaseMm: number,
  asm: RoofProfileAssembly,
  zAdjustMm = 0,
): readonly RoofBattenPlanSegmentMm[] {
  const pack = buildRoofBattenStripPackMm(rp, layerBaseMm, asm, zAdjustMm);
  if (!pack) {
    return [];
  }
  return pack.strips.map(({ a, b }) => ({
    x1: a[0],
    y1: -a[2],
    x2: b[0],
    y2: -b[2],
  }));
}

/**
 * Обрешётка: оси на **фактической** плоскости ската, шаг и направление из профиля.
 */
export function buildRoofBattenBoxSpecsMm(
  rp: RoofPlaneEntity,
  layerBaseMm: number,
  asm: RoofProfileAssembly,
  zAdjustMm = 0,
): readonly RoofBattenBoxSpecMm[] {
  const pack = buildRoofBattenStripPackMm(rp, layerBaseMm, asm, zAdjustMm);
  if (!pack) {
    return [];
  }
  const { strips, outwardNormal: n } = pack;
  const memThk = asm.membraneUse ? asm.membraneThicknessMm : 0;
  const battenCenterAlongN = memThk + asm.battenHeightMm * 0.5;
  const out: RoofBattenBoxSpecMm[] = [];
  for (const { a: pA, b: pB } of strips) {
    const mid = scale3(add3(pA, pB), 0.5);
    const dir = sub3(pB, pA);
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    if (len < 10) {
      continue;
    }
    const longU = unit3(dir[0] / len, dir[1] / len, dir[2] / len);
    const q = battenBoxQuaternionWorld(longU, n);
    out.push({
      center: add3(mid, scale3(n, battenCenterAlongN)),
      quaternion: q,
      lengthMm: len,
      widthMm: asm.battenWidthMm,
      heightMm: asm.battenHeightMm,
    });
  }
  return out;
}

export function battenBoxQuaternionWorld(longAxis: RoofThreeMm, outwardNormal: RoofThreeMm): readonly [number, number, number, number] {
  const W = new Vector3(longAxis[0], longAxis[1], longAxis[2]).normalize();
  const N = new Vector3(outwardNormal[0], outwardNormal[1], outwardNormal[2]).normalize();
  let B = new Vector3().crossVectors(W, N);
  if (B.lengthSq() < 1e-14) {
    B.set(1, 0, 0);
  }
  B.normalize();
  const N2 = new Vector3().crossVectors(B, W).normalize();
  const m = new Matrix4().makeBasis(B, N2, W);
  const q = new Quaternion().setFromRotationMatrix(m);
  return [q.x, q.y, q.z, q.w];
}

export function roofLayerBaseMmForPlane(project: Project, layerId: string): number {
  const map = computeLayerVerticalStack(project);
  return map.get(layerId)?.computedBaseMm ?? 0;
}

/**
 * Поправка Z по стыкам для всех скатов: связные в плане группы (общая кромка / близкие контуры),
 * не только скаты из одной записи «Рассчитать крышу».
 */
export function roofAssemblyZAdjustMmByPlaneIdForProject(project: Project): ReadonlyMap<string, number> {
  return computeAllRoofPlanesZAdjustMmByPlaneIdInProject(project, (layerId) =>
    roofLayerBaseMmForPlane(project, layerId),
  );
}

export function roofMeshToWorldMeters(mesh: RoofSlopeSurfaceMeshMm): { positions: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i++) {
    positions[i] = mesh.positions[i]! * MM_TO_M;
  }
  return { positions, indices: mesh.indices };
}

export function roofBattenCenterWorldM(b: RoofBattenBoxSpecMm): readonly [number, number, number] {
  return [b.center[0] * MM_TO_M, b.center[1] * MM_TO_M, b.center[2] * MM_TO_M];
}
