import { Matrix4, Quaternion, ShapeUtils, Vector2, Vector3 } from "three";

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

/** Проекция вектора на плоскость с нормалью n (единичной). */
function projectOnPlaneVec(v: RoofThreeMm, n: RoofThreeMm): RoofThreeMm {
  const k = dot3(v, n);
  return [v[0] - n[0] * k, v[1] - n[1] * k, v[2] - n[2] * k];
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

function intersectLineWithPolygon2D(
  poly: readonly Vector2[],
  n: Vector2,
  c: number,
): { readonly a: Vector2; readonly b: Vector2 } | null {
  const pts: Vector2[] = [];
  const nn = n.length();
  if (nn < 1e-12) {
    return null;
  }
  const n0 = n.clone().multiplyScalar(1 / nn);
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i]!;
    const p1 = poly[(i + 1) % poly.length]!;
    const d0 = n0.dot(p0) - c;
    const d1 = n0.dot(p1) - c;
    if (Math.abs(d0) < 1e-6) {
      pts.push(p0.clone());
    }
    if (d0 * d1 < -1e-12) {
      const t = d0 / (d0 - d1);
      pts.push(new Vector2(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t));
    }
  }
  if (pts.length < 2) {
    return null;
  }
  const axis = new Vector2(-n0.y, n0.x);
  pts.sort((pa, pb) => axis.dot(pa) - axis.dot(pb));
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  if (a.distanceToSquared(b) < 1) {
    return null;
  }
  return { a, b };
}

function orthonormalPlaneBasisFromVerts(verts: RoofThreeMm[], n: RoofThreeMm): { readonly o: RoofThreeMm; readonly e1: RoofThreeMm; readonly e2: RoofThreeMm } {
  const o = verts[0]!;
  const edge = sub3(verts[1]!, o);
  let e1 = projectOnPlaneVec(edge, n);
  const len1 = Math.hypot(e1[0], e1[1], e1[2]);
  if (len1 < 1e-6) {
    e1 = projectOnPlaneVec([1, 0, 0], n);
  }
  e1 = unit3(e1[0], e1[1], e1[2]);
  const e2raw = cross3(n, e1);
  const e2 = unit3(e2raw[0], e2raw[1], e2raw[2]);
  return { o, e1, e2 };
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
  if (!asm.battenUse) {
    return [];
  }
  const { verts, outwardNormal: n } = roofSlopeVerticesThreeMm(rp, layerBaseMm, zAdjustMm);
  if (verts.length < 3) {
    return [];
  }
  const { o, e1, e2 } = orthonormalPlaneBasisFromVerts(verts, n);

  const ux = rp.slopeDirection.x;
  const uy = rp.slopeDirection.y;
  const ulen = Math.hypot(ux, uy);
  const uxn = ulen > 1e-9 ? ux / ulen : 1;
  const uyn = ulen > 1e-9 ? uy / ulen : 0;
  const tEaveHoriz: RoofThreeMm = [-uyn, 0, -uxn];
  const tDownHoriz: RoofThreeMm = [uxn, 0, -uyn];

  const longHoriz = asm.battenLayoutDir === "parallel_to_fall" ? tDownHoriz : tEaveHoriz;
  let long3 = projectOnPlaneVec(longHoriz, n);
  const ll = Math.hypot(long3[0], long3[1], long3[2]);
  if (ll < 1e-9) {
    long3 = e1;
  } else {
    long3 = unit3(long3[0] / ll, long3[1] / ll, long3[2] / ll);
  }

  const spacing3raw = cross3(long3, n);
  const spacing3 = unit3(spacing3raw[0], spacing3raw[1], spacing3raw[2]);

  const poly2: Vector2[] = verts.map((p) => {
    const d = sub3(p, o);
    return new Vector2(dot3(d, e1), dot3(d, e2));
  });
  const n2 = new Vector2(dot3(spacing3, e1), dot3(spacing3, e2));

  let minC = Number.POSITIVE_INFINITY;
  let maxC = Number.NEGATIVE_INFINITY;
  for (const p of poly2) {
    const c = n2.dot(p);
    minC = Math.min(minC, c);
    maxC = Math.max(maxC, c);
  }
  const span = maxC - minC;
  const step = asm.battenStepMm;
  const inset = Math.min(step * 0.5, Math.max(8, span * 0.015));

  const out: RoofBattenBoxSpecMm[] = [];
  const memThk = asm.membraneUse ? asm.membraneThicknessMm : 0;
  const battenCenterAlongN = memThk + asm.battenHeightMm * 0.5;

  for (let c = minC + inset; c <= maxC - inset + 1e-6; c += step) {
    const seg = intersectLineWithPolygon2D(poly2, n2, c);
    if (!seg) {
      continue;
    }
    const pA = add3(o, add3(scale3(e1, seg.a.x), scale3(e2, seg.a.y)));
    const pB = add3(o, add3(scale3(e1, seg.b.x), scale3(e2, seg.b.y)));
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
