import type { Point2D } from "../geometry/types";
import type { RoofPlaneEntity } from "./roofPlane";
import type { RoofRidgeSegmentMm, RoofSystemKind } from "./roofSystem";
import { newEntityId } from "./ids";

const EPS = 1e-6;

function unit2(v: Point2D): Point2D | null {
  const len = Math.hypot(v.x, v.y);
  if (len < EPS) {
    return null;
  }
  return { x: v.x / len, y: v.y / len };
}

export type RidgeAlongChoice = "short" | "long";
export type MonoCardinalDrain = "n" | "e" | "s" | "w";

export interface RectangleRoofBuildInput {
  readonly footprintCcWMm: readonly Point2D[];
  readonly roofKind: RoofSystemKind;
  readonly pitchDeg: number;
  readonly baseLevelMm: number;
  readonly profileId: string;
  readonly layerId: string;
  readonly roofSystemId: string;
  readonly ridgeAlong: RidgeAlongChoice;
  readonly monoDrainCardinal: MonoCardinalDrain;
  readonly slopeIndexStart: number;
  readonly nowIso: string;
}

export interface RectangleRoofBuildResult {
  readonly planes: readonly RoofPlaneEntity[];
  readonly ridgeSegmentsPlanMm: readonly RoofRidgeSegmentMm[];
  readonly ridgeUnitPlan: Point2D;
  readonly drainUnitPlan: Point2D;
}

/** Прямоугольник CCW: v0 minx,miny — v1 maxx,miny — v2 maxx,maxy — v3 minx,maxy */
function rectMetrics(footprint: readonly Point2D[]): {
  readonly xmin: number;
  readonly xmax: number;
  readonly ymin: number;
  readonly ymax: number;
  readonly Lx: number;
  readonly Ly: number;
  readonly cx: number;
  readonly cy: number;
} {
  const v0 = footprint[0]!;
  const v1 = footprint[1]!;
  const v2 = footprint[2]!;
  const xmin = v0.x;
  const ymin = v0.y;
  const xmax = v1.x;
  const ymax = v2.y;
  return {
    xmin,
    xmax,
    ymin,
    ymax,
    Lx: xmax - xmin,
    Ly: ymax - ymin,
    cx: (xmin + xmax) * 0.5,
    cy: (ymin + ymax) * 0.5,
  };
}

function makePlane(
  base: Omit<
    RoofPlaneEntity,
    "id" | "slopeIndex" | "createdAt" | "updatedAt" | "planContourMm" | "planContourBaseMm" | "roofSystemId" | "type"
  >,
  contour: readonly Point2D[],
  slopeIndex: number,
  roofSystemId: string,
  nowIso: string,
): RoofPlaneEntity {
  const cc = contour.map((p) => ({ x: p.x, y: p.y }));
  return {
    ...base,
    type: "roofPlane",
    id: newEntityId(),
    roofSystemId,
    slopeIndex,
    planContourMm: cc,
    planContourBaseMm: cc.map((p) => ({ x: p.x, y: p.y })),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function monoDrainUnit(cardinal: MonoCardinalDrain): Point2D {
  switch (cardinal) {
    case "n":
      return { x: 0, y: 1 };
    case "s":
      return { x: 0, y: -1 };
    case "e":
      return { x: 1, y: 0 };
    case "w":
      return { x: -1, y: 0 };
    default:
      return { x: 0, y: -1 };
  }
}

/** Односкатная: весь прямоугольник — один скат, сток к выбранной стороне света. */
function buildMono(
  r: ReturnType<typeof rectMetrics>,
  input: RectangleRoofBuildInput,
): RectangleRoofBuildResult {
  const { xmin, xmax, ymin, ymax, Lx, Ly } = r;
  const drain = monoDrainUnit(input.monoDrainCardinal);
  const ridgeU = unit2({ x: -drain.y, y: drain.x }) ?? { x: 1, y: 0 };

  let p1: Point2D;
  let p2: Point2D;
  let depthMm: number;

  if (input.monoDrainCardinal === "s") {
    p1 = { x: xmin, y: ymin };
    p2 = { x: xmax, y: ymin };
    depthMm = Ly;
  } else if (input.monoDrainCardinal === "n") {
    p1 = { x: xmin, y: ymax };
    p2 = { x: xmax, y: ymax };
    depthMm = Ly;
  } else if (input.monoDrainCardinal === "w") {
    p1 = { x: xmin, y: ymin };
    p2 = { x: xmin, y: ymax };
    depthMm = Lx;
  } else {
    p1 = { x: xmax, y: ymin };
    p2 = { x: xmax, y: ymax };
    depthMm = Lx;
  }

  const contour: Point2D[] = [
    { x: xmin, y: ymin },
    { x: xmax, y: ymin },
    { x: xmax, y: ymax },
    { x: xmin, y: ymax },
  ];
  const plane = makePlane(
    {
      layerId: input.layerId,
      p1,
      p2,
      depthMm,
      angleDeg: input.pitchDeg,
      levelMm: input.baseLevelMm,
      profileId: input.profileId,
      slopeDirection: drain,
    },
    contour,
    input.slopeIndexStart,
    input.roofSystemId,
    input.nowIso,
  );
  return {
    planes: [plane],
    ridgeSegmentsPlanMm: [],
    ridgeUnitPlan: ridgeU,
    drainUnitPlan: drain,
  };
}

/**
 * Двускатная: два ската из одной модели — общая линия конька, половины прямоугольника,
 * симметричные относительно оси конька.
 */
function buildGable(
  r: ReturnType<typeof rectMetrics>,
  input: RectangleRoofBuildInput,
): RectangleRoofBuildResult {
  const { xmin, xmax, ymin, ymax, Lx, Ly, cx, cy } = r;
  const horizShorter = Lx <= Ly;
  const wantRidgeAlongShort = input.ridgeAlong === "short";
  const ridgeHorizontal = wantRidgeAlongShort ? horizShorter : !horizShorter;

  let southLike: RoofPlaneEntity;
  let northLike: RoofPlaneEntity;
  let ridgeU: Point2D;
  let drainRep: Point2D;
  let outRidgeSeg: RoofRidgeSegmentMm;

  if (ridgeHorizontal) {
    const ymid = cy;
    outRidgeSeg = { ax: xmin, ay: ymid, bx: xmax, by: ymid };
    ridgeU = { x: 1, y: 0 };
    const southContour: Point2D[] = [
      { x: xmin, y: ymin },
      { x: xmax, y: ymin },
      { x: xmax, y: ymid },
      { x: xmin, y: ymid },
    ];
    const northContour: Point2D[] = [
      { x: xmin, y: ymid },
      { x: xmax, y: ymid },
      { x: xmax, y: ymax },
      { x: xmin, y: ymax },
    ];
    southLike = makePlane(
      {
        layerId: input.layerId,
        p1: { x: xmin, y: ymin },
        p2: { x: xmax, y: ymin },
        depthMm: ymid - ymin,
        angleDeg: input.pitchDeg,
        levelMm: input.baseLevelMm,
        profileId: input.profileId,
        slopeDirection: { x: 0, y: -1 },
      },
      southContour,
      input.slopeIndexStart,
      input.roofSystemId,
      input.nowIso,
    );
    northLike = makePlane(
      {
        layerId: input.layerId,
        p1: { x: xmin, y: ymax },
        p2: { x: xmax, y: ymax },
        depthMm: ymax - ymid,
        angleDeg: input.pitchDeg,
        levelMm: input.baseLevelMm,
        profileId: input.profileId,
        slopeDirection: { x: 0, y: 1 },
      },
      northContour,
      input.slopeIndexStart + 1,
      input.roofSystemId,
      input.nowIso,
    );
    drainRep = { x: 0, y: -1 };
  } else {
    const xmid = cx;
    outRidgeSeg = { ax: xmid, ay: ymin, bx: xmid, by: ymax };
    ridgeU = { x: 0, y: 1 };
    const westContour: Point2D[] = [
      { x: xmin, y: ymin },
      { x: xmid, y: ymin },
      { x: xmid, y: ymax },
      { x: xmin, y: ymax },
    ];
    const eastContour: Point2D[] = [
      { x: xmid, y: ymin },
      { x: xmax, y: ymin },
      { x: xmax, y: ymax },
      { x: xmid, y: ymax },
    ];
    southLike = makePlane(
      {
        layerId: input.layerId,
        p1: { x: xmin, y: ymin },
        p2: { x: xmin, y: ymax },
        depthMm: xmid - xmin,
        angleDeg: input.pitchDeg,
        levelMm: input.baseLevelMm,
        profileId: input.profileId,
        slopeDirection: { x: -1, y: 0 },
      },
      westContour,
      input.slopeIndexStart,
      input.roofSystemId,
      input.nowIso,
    );
    northLike = makePlane(
      {
        layerId: input.layerId,
        p1: { x: xmax, y: ymin },
        p2: { x: xmax, y: ymax },
        depthMm: xmax - xmid,
        angleDeg: input.pitchDeg,
        levelMm: input.baseLevelMm,
        profileId: input.profileId,
        slopeDirection: { x: 1, y: 0 },
      },
      eastContour,
      input.slopeIndexStart + 1,
      input.roofSystemId,
      input.nowIso,
    );
    drainRep = { x: -1, y: 0 };
  }

  return {
    planes: [southLike, northLike],
    ridgeSegmentsPlanMm: [outRidgeSeg],
    ridgeUnitPlan: ridgeU,
    drainUnitPlan: drainRep,
  };
}

/** Вальмовая: конёк параллелен длинной стороне; при квадрате — пирамида. */
function buildHip(
  r: ReturnType<typeof rectMetrics>,
  input: RectangleRoofBuildInput,
): RectangleRoofBuildResult {
  const { xmin, xmax, ymin, ymax, Lx, Ly, cx, cy } = r;

  if (Math.abs(Lx - Ly) < 1) {
    return buildHipSquarePyramid(r, input);
  }

  if (Lx > Ly) {
    const ymid = cy;
    const inset = Ly * 0.5;
    const xR0 = xmin + inset;
    const xR1 = xmax - inset;
    if (xR1 <= xR0 + EPS) {
      return buildHipSquarePyramid(r, input);
    }
    const ridgeSeg: RoofRidgeSegmentMm = { ax: xR0, ay: ymid, bx: xR1, by: ymid };
    const south: Point2D[] = [
      { x: xmin, y: ymin },
      { x: xmax, y: ymin },
      { x: xR1, y: ymid },
      { x: xR0, y: ymid },
    ];
    const north: Point2D[] = [
      { x: xR0, y: ymid },
      { x: xR1, y: ymid },
      { x: xmax, y: ymax },
      { x: xmin, y: ymax },
    ];
    const west: Point2D[] = [
      { x: xmin, y: ymin },
      { x: xR0, y: ymid },
      { x: xmin, y: ymax },
    ];
    const east: Point2D[] = [
      { x: xmax, y: ymin },
      { x: xR1, y: ymid },
      { x: xmax, y: ymax },
    ];
    let idx = input.slopeIndexStart;
    const pS = makePlane(
      {
        layerId: input.layerId,
        p1: south[0]!,
        p2: south[1]!,
        depthMm: Math.hypot(south[2]!.x - south[1]!.x, south[2]!.y - south[1]!.y),
        angleDeg: input.pitchDeg,
        levelMm: input.baseLevelMm,
        profileId: input.profileId,
        slopeDirection: { x: 0, y: -1 },
      },
      south,
      idx++,
      input.roofSystemId,
      input.nowIso,
    );
    const pN = makePlane(
      {
        layerId: input.layerId,
        p1: north[3]!,
        p2: north[2]!,
        depthMm: Math.hypot(north[2]!.x - north[1]!.x, north[2]!.y - north[1]!.y),
        angleDeg: input.pitchDeg,
        levelMm: input.baseLevelMm,
        profileId: input.profileId,
        slopeDirection: { x: 0, y: 1 },
      },
      north,
      idx++,
      input.roofSystemId,
      input.nowIso,
    );
    const pW = makePlane(
      {
        layerId: input.layerId,
        p1: west[0]!,
        p2: west[2]!,
        depthMm: Math.hypot(west[1]!.x - west[0]!.x, west[1]!.y - west[0]!.y),
        angleDeg: input.pitchDeg,
        levelMm: input.baseLevelMm,
        profileId: input.profileId,
        slopeDirection: { x: -1, y: 0 },
      },
      west,
      idx++,
      input.roofSystemId,
      input.nowIso,
    );
    const pE = makePlane(
      {
        layerId: input.layerId,
        p1: east[2]!,
        p2: east[0]!,
        depthMm: Math.hypot(east[1]!.x - east[0]!.x, east[1]!.y - east[0]!.y),
        angleDeg: input.pitchDeg,
        levelMm: input.baseLevelMm,
        profileId: input.profileId,
        slopeDirection: { x: 1, y: 0 },
      },
      east,
      idx++,
      input.roofSystemId,
      input.nowIso,
    );
    return {
      planes: [pS, pN, pW, pE],
      ridgeSegmentsPlanMm: [ridgeSeg],
      ridgeUnitPlan: { x: 1, y: 0 },
      drainUnitPlan: { x: 0, y: -1 },
    };
  }

  const xmid = cx;
  const inset = Lx * 0.5;
  const yR0 = ymin + inset;
  const yR1 = ymax - inset;
  if (yR1 <= yR0 + EPS) {
    return buildHipSquarePyramid(r, input);
  }
  const ridgeSeg: RoofRidgeSegmentMm = { ax: xmid, ay: yR0, bx: xmid, by: yR1 };
  const west: Point2D[] = [
    { x: xmin, y: ymin },
    { x: xmid, y: yR0 },
    { x: xmid, y: yR1 },
    { x: xmin, y: ymax },
  ];
  const east: Point2D[] = [
    { x: xmid, y: yR0 },
    { x: xmax, y: ymin },
    { x: xmax, y: ymax },
    { x: xmid, y: yR1 },
  ];
  const south: Point2D[] = [
    { x: xmin, y: ymin },
    { x: xmax, y: ymin },
    { x: xmid, y: yR0 },
  ];
  const north: Point2D[] = [
    { x: xmid, y: yR1 },
    { x: xmax, y: ymax },
    { x: xmin, y: ymax },
  ];
  let idx = input.slopeIndexStart;
  const pW = makePlane(
    {
      layerId: input.layerId,
      p1: west[0]!,
      p2: west[1]!,
      depthMm: Math.hypot(west[1]!.x - west[0]!.x, west[1]!.y - west[0]!.y),
      angleDeg: input.pitchDeg,
      levelMm: input.baseLevelMm,
      profileId: input.profileId,
      slopeDirection: { x: -1, y: 0 },
    },
    west,
    idx++,
    input.roofSystemId,
    input.nowIso,
  );
  const pE = makePlane(
    {
      layerId: input.layerId,
      p1: east[1]!,
      p2: east[2]!,
      depthMm: Math.hypot(east[2]!.x - east[1]!.x, east[2]!.y - east[1]!.y),
      angleDeg: input.pitchDeg,
      levelMm: input.baseLevelMm,
      profileId: input.profileId,
      slopeDirection: { x: 1, y: 0 },
    },
    east,
    idx++,
    input.roofSystemId,
    input.nowIso,
  );
  const pS = makePlane(
    {
      layerId: input.layerId,
      p1: south[0]!,
      p2: south[1]!,
      depthMm: Math.hypot(south[2]!.x - south[1]!.x, south[2]!.y - south[1]!.y),
      angleDeg: input.pitchDeg,
      levelMm: input.baseLevelMm,
      profileId: input.profileId,
      slopeDirection: { x: 0, y: -1 },
    },
    south,
    idx++,
    input.roofSystemId,
    input.nowIso,
  );
  const pN = makePlane(
    {
      layerId: input.layerId,
      p1: north[2]!,
      p2: north[1]!,
      depthMm: Math.hypot(north[0]!.x - north[2]!.x, north[0]!.y - north[2]!.y),
      angleDeg: input.pitchDeg,
      levelMm: input.baseLevelMm,
      profileId: input.profileId,
      slopeDirection: { x: 0, y: 1 },
    },
    north,
    idx++,
    input.roofSystemId,
    input.nowIso,
  );
  return {
    planes: [pW, pE, pS, pN],
    ridgeSegmentsPlanMm: [ridgeSeg],
    ridgeUnitPlan: { x: 0, y: 1 },
    drainUnitPlan: { x: -1, y: 0 },
  };
}

function buildHipSquarePyramid(
  r: ReturnType<typeof rectMetrics>,
  input: RectangleRoofBuildInput,
): RectangleRoofBuildResult {
  const { xmin, xmax, ymin, ymax, cx, cy } = r;
  const c: Point2D = { x: cx, y: cy };
  const v0: Point2D = { x: xmin, y: ymin };
  const v1: Point2D = { x: xmax, y: ymin };
  const v2: Point2D = { x: xmax, y: ymax };
  const v3: Point2D = { x: xmin, y: ymax };
  const tri = (a: Point2D, b: Point2D, drain: Point2D, si: number): RoofPlaneEntity => {
    const contour = [a, b, c];
    const dm = Math.max(
      Math.hypot(c.x - a.x, c.y - a.y),
      Math.hypot(c.x - b.x, c.y - b.y),
      Math.hypot(b.x - a.x, b.y - a.y),
    );
    return makePlane(
      {
        layerId: input.layerId,
        p1: a,
        p2: b,
        depthMm: dm,
        angleDeg: input.pitchDeg,
        levelMm: input.baseLevelMm,
        profileId: input.profileId,
        slopeDirection: drain,
      },
      contour,
      si,
      input.roofSystemId,
      input.nowIso,
    );
  };
  let idx = input.slopeIndexStart;
  const planes: RoofPlaneEntity[] = [
    tri(v0, v1, { x: 0, y: -1 }, idx++),
    tri(v1, v2, { x: 1, y: 0 }, idx++),
    tri(v2, v3, { x: 0, y: 1 }, idx++),
    tri(v3, v0, { x: -1, y: 0 }, idx++),
  ];
  return {
    planes,
    ridgeSegmentsPlanMm: [{ ax: cx, ay: cy, bx: cx, by: cy }],
    ridgeUnitPlan: { x: 1, y: 0 },
    drainUnitPlan: { x: 0, y: -1 },
  };
}

/**
 * Построить скаты для прямоугольного контура (4 вершины CCW, ось параллельна осям координат).
 */
export function buildRectangleRoofSystemGeometryMm(input: RectangleRoofBuildInput): RectangleRoofBuildResult {
  const fp = input.footprintCcWMm;
  if (fp.length !== 4) {
    throw new Error("rectangle roof: ожидается 4 вершины");
  }
  const r = rectMetrics(fp);
  if (r.Lx < 1 || r.Ly < 1) {
    throw new Error("rectangle roof: слишком малый прямоугольник");
  }

  switch (input.roofKind) {
    case "mono":
      return buildMono(r, input);
    case "gable":
      return buildGable(r, input);
    case "hip":
      return buildHip(r, input);
    default: {
      const _exhaustive: never = input.roofKind;
      return _exhaustive;
    }
  }
}

/**
 * Линии конька/верхнего карниза для превью на 2D без создания сущностей.
 * Для односкатной — отрезок противоположной «верхней» стороне стока (визуальная ось ската).
 */
export function previewRidgeSegmentsForRectangleFootprintMm(
  footprintCcWMm: readonly Point2D[],
  roofKind: RoofSystemKind,
  ridgeAlong: RidgeAlongChoice,
  monoDrainCardinal: MonoCardinalDrain,
): readonly RoofRidgeSegmentMm[] {
  if (footprintCcWMm.length !== 4) {
    return [];
  }
  const r = rectMetrics(footprintCcWMm);
  if (r.Lx < 1 || r.Ly < 1) {
    return [];
  }
  const { xmin, xmax, ymin, ymax, Lx, Ly, cx, cy } = r;

  if (roofKind === "mono") {
    switch (monoDrainCardinal) {
      case "s":
        return [{ ax: xmin, ay: ymax, bx: xmax, by: ymax }];
      case "n":
        return [{ ax: xmin, ay: ymin, bx: xmax, by: ymin }];
      case "w":
        return [{ ax: xmax, ay: ymin, bx: xmax, by: ymax }];
      case "e":
        return [{ ax: xmin, ay: ymin, bx: xmin, by: ymax }];
      default: {
        const _e: never = monoDrainCardinal;
        return _e;
      }
    }
  }

  if (roofKind === "gable") {
    const horizShorter = Lx <= Ly;
    const wantRidgeAlongShort = ridgeAlong === "short";
    const ridgeHorizontal = wantRidgeAlongShort ? horizShorter : !horizShorter;
    if (ridgeHorizontal) {
      return [{ ax: xmin, ay: cy, bx: xmax, by: cy }];
    }
    return [{ ax: cx, ay: ymin, bx: cx, by: ymax }];
  }

  if (roofKind === "hip") {
    if (Math.abs(Lx - Ly) < 1) {
      return [{ ax: cx, ay: cy, bx: cx, by: cy }];
    }
    if (Lx > Ly) {
      const ymid = cy;
      const inset = Ly * 0.5;
      const xR0 = xmin + inset;
      const xR1 = xmax - inset;
      if (xR1 <= xR0 + EPS) {
        return [{ ax: cx, ay: cy, bx: cx, by: cy }];
      }
      return [{ ax: xR0, ay: ymid, bx: xR1, by: ymid }];
    }
    const xmid = cx;
    const inset = Lx * 0.5;
    const yR0 = ymin + inset;
    const yR1 = ymax - inset;
    if (yR1 <= yR0 + EPS) {
      return [{ ax: cx, ay: cy, bx: cx, by: cy }];
    }
    return [{ ax: xmid, ay: yR0, bx: xmid, by: yR1 }];
  }

  return [];
}
