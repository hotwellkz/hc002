import { getLayerById } from "./layerOps";
import { openingSillLevelMm, openingTopLevelMmForShell } from "./doorGeometry";
import { isOpeningPlacedOnWall, type Opening } from "./opening";
import type { OpeningFramingPiece, OpeningFramingPieceKind } from "./openingFramingPiece";
import { getProfileById } from "./profileOps";
import type { Profile } from "./profile";
import type { Project } from "./project";
import type { Wall } from "./wall";
import { computeProfileThickness } from "./wallOps";
import { resolveEffectiveWallManufacturing, resolveWallCalculationModel } from "./wallManufacturing";
import { viewPresetByKey, type WindowViewPresetKey } from "./windowFormCatalog";

const MM_TO_M = 0.001;
const MIN_LEN = 1;

export type Opening3dMeshKind =
  | "window_frame"
  | "window_glass"
  | "window_mullion"
  | "door_leaf"
  | "door_handle"
  | "door_frame"
  | "opening_framing";

/** Объём для 3D-сцены: те же оси, что и wallMeshSpec (width ⟂ стены, height ↑, depth вдоль стены). */
export interface Opening3dMeshSpec {
  readonly reactKey: string;
  readonly kind: Opening3dMeshKind;
  readonly wallId: string;
  readonly openingId: string;
  readonly position: readonly [number, number, number];
  readonly rotationY: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

function wallBottomElevationMm(wall: Wall, project: Project): number {
  if (wall.baseElevationMm != null && Number.isFinite(wall.baseElevationMm)) {
    return wall.baseElevationMm;
  }
  return getLayerById(project, wall.layerId)?.elevationMm ?? 0;
}

function thicknessNormalUnit(
  sx: number,
  sy: number,
  ex: number,
  ey: number,
): { readonly nx: number; readonly nz: number; readonly lenMm: number; readonly ux: number; readonly uy: number } {
  const dxMm = ex - sx;
  const dyMm = ey - sy;
  const lenMm = Math.hypot(dxMm, dyMm);
  if (lenMm < MIN_LEN) {
    return { nx: 1, nz: 0, lenMm: 0, ux: 1, uy: 0 };
  }
  const ux = dxMm / lenMm;
  const uy = dyMm / lenMm;
  const nx = -dyMm / lenMm;
  const nz = -dxMm / lenMm;
  return { nx, nz, lenMm, ux, uy };
}

function profileBoardThicknessMm(profile: Profile | undefined): number {
  if (!profile?.layers.length) {
    return 45;
  }
  return Math.max(18, profile.layers[0]!.thicknessMm);
}

function profileDepthAlongNormalMm(profile: Profile | undefined): number {
  if (!profile) {
    return 145;
  }
  const t = computeProfileThickness(profile);
  return Math.max(40, Math.min(200, t));
}

/** Для каркасной стены — сечение каркаса из профиля стены, не из SIP-дефолта 145 мм. */
function frameWallMemberSizeMm(wall: Wall, project: Project): number | null {
  const wp = wall.profileId ? getProfileById(project, wall.profileId) : undefined;
  if (!wp || resolveWallCalculationModel(wp) !== "frame") {
    return null;
  }
  const m = resolveEffectiveWallManufacturing(wp);
  return Math.max(1, Math.round(m.jointBoardDepthMm));
}

const FRAME_MM = 55;
const DOOR_LEAF_THICKNESS_MM = 40;
const DOOR_FRAME_FACE_MM = 32;
const DOOR_CLEARANCE_MM = 10;
const DOOR_HANDLE_BACKSET_MM = 80;
const DOOR_HANDLE_HEIGHT_MM = 1050;
const DOOR_HANDLE_PLATE_W_MM = 22;
const DOOR_HANDLE_PLATE_H_MM = 140;
const DOOR_HANDLE_PLATE_T_MM = 6;
const DOOR_HANDLE_GRIP_LEN_MM = 90;
const DOOR_HANDLE_GRIP_D_MM = 12;

/** Оконный блок (рама + стекло + импосты). Пустой проём — не генерируется. */
export function buildWindowAssemblySpecsForOpening(wall: Wall, opening: Opening, project: Project): readonly Opening3dMeshSpec[] {
  if (!isOpeningPlacedOnWall(opening) || opening.kind !== "window" || opening.isEmptyOpening) {
    return [];
  }
  const sx = wall.start.x;
  const sy = wall.start.y;
  const ex = wall.end.x;
  const ey = wall.end.y;
  const { nx, nz, lenMm, ux, uy } = thicknessNormalUnit(sx, sy, ex, ey);
  if (lenMm < MIN_LEN) {
    return [];
  }
  const dxM = (ex - sx) * MM_TO_M;
  const dzM = -(ey - sy) * MM_TO_M;
  const rotationY = Math.atan2(dxM, dzM);

  const o0 = opening.offsetFromStartMm;
  const o1 = o0 + opening.widthMm;
  const sill = opening.sillHeightMm ?? opening.position?.sillLevelMm ?? 900;
  const H = opening.heightMm;
  const W = opening.widthMm;
  const T = wall.thicknessMm;
  const frameDepthMm = Math.min(90, Math.max(40, T * 0.42));
  const windowNormalOffsetMm = Math.max(0, T / 2 - frameDepthMm / 2 - 4);
  const innerW = Math.max(40, W - 2 * FRAME_MM);
  const innerH = Math.max(40, H - 2 * FRAME_MM);

  const bottomMm = wallBottomElevationMm(wall, project);
  const preset = viewPresetByKey((opening.viewPreset ?? "form1") as WindowViewPresetKey);
  const variant = preset?.previewVariant ?? 1;

  const out: Opening3dMeshSpec[] = [];
  let k = 0;
  const key = (suffix: string) => `${opening.id}-win-${suffix}-${k++}`;

  const placeCenter = (uMid: number, yMid: number): [number, number, number] => {
    const px = sx + ux * uMid;
    const py = sy + uy * uMid;
    const cx = (px + nx * windowNormalOffsetMm) * MM_TO_M;
    const cz = (-py + nz * windowNormalOffsetMm) * MM_TO_M;
    const cy = bottomMm * MM_TO_M + yMid * MM_TO_M;
    return [cx, cy, cz];
  };

  const uC = (o0 + o1) / 2;
  const yC = sill + H / 2;

  /** Верх / низ / бок — рама. */
  const top = placeCenter(uC, sill + H - FRAME_MM / 2);
  out.push({
    reactKey: key("ft"),
    kind: "window_frame",
    wallId: wall.id,
    openingId: opening.id,
    position: top,
    rotationY,
    width: frameDepthMm * MM_TO_M,
    height: FRAME_MM * MM_TO_M,
    depth: W * MM_TO_M,
  });
  const bot = placeCenter(uC, sill + FRAME_MM / 2);
  out.push({
    reactKey: key("fb"),
    kind: "window_frame",
    wallId: wall.id,
    openingId: opening.id,
    position: bot,
    rotationY,
    width: frameDepthMm * MM_TO_M,
    height: FRAME_MM * MM_TO_M,
    depth: W * MM_TO_M,
  });
  const left = placeCenter(o0 + FRAME_MM / 2, yC);
  out.push({
    reactKey: key("fl"),
    kind: "window_frame",
    wallId: wall.id,
    openingId: opening.id,
    position: left,
    rotationY,
    width: frameDepthMm * MM_TO_M,
    height: H * MM_TO_M,
    depth: FRAME_MM * MM_TO_M,
  });
  const right = placeCenter(o1 - FRAME_MM / 2, yC);
  out.push({
    reactKey: key("fr"),
    kind: "window_frame",
    wallId: wall.id,
    openingId: opening.id,
    position: right,
    rotationY,
    width: frameDepthMm * MM_TO_M,
    height: H * MM_TO_M,
    depth: FRAME_MM * MM_TO_M,
  });

  const glass = placeCenter(uC, yC);
  out.push({
    reactKey: key("glass"),
    kind: "window_glass",
    wallId: wall.id,
    openingId: opening.id,
    position: glass,
    rotationY,
    width: Math.min(28, frameDepthMm * 0.35) * MM_TO_M,
    height: innerH * MM_TO_M,
    depth: innerW * MM_TO_M,
  });

  const x0 = 0;
  const y0 = 0;
  const w = W;
  const h = H;
  const cx = w / 2;
  const cy = h / 2;

  const mullion = (uA: number, uB: number, yA: number, yB: number) => {
    const uMid = o0 + (uA + uB) / 2;
    const yMid = sill + (yA + yB) / 2;
    const du = Math.abs(uB - uA);
    const dy = Math.abs(yB - yA);
    if (du < 8 && dy < 8) {
      return;
    }
    if (du < 8) {
      /** вертикальный */
      const p = placeCenter(uMid, yMid);
      out.push({
        reactKey: key("mv"),
        kind: "window_mullion",
        wallId: wall.id,
        openingId: opening.id,
        position: p,
        rotationY,
        width: frameDepthMm * 0.85 * MM_TO_M,
        height: dy * MM_TO_M,
        depth: FRAME_MM * 0.85 * MM_TO_M,
      });
    } else if (dy < 8) {
      const p = placeCenter(uMid, yMid);
      out.push({
        reactKey: key("mh"),
        kind: "window_mullion",
        wallId: wall.id,
        openingId: opening.id,
        position: p,
        rotationY,
        width: frameDepthMm * 0.85 * MM_TO_M,
        height: FRAME_MM * 0.85 * MM_TO_M,
        depth: du * MM_TO_M,
      });
    }
  };

  switch (variant) {
    case 2:
      mullion(cx, cx, y0, h);
      break;
    case 3:
      mullion(x0, w, cy, cy);
      break;
    case 4:
      mullion(cx, cx, y0, h);
      mullion(x0, w, cy, cy);
      break;
    case 5: {
      const x1 = w / 3;
      const x2 = (2 * w) / 3;
      mullion(x1, x1, y0, h);
      mullion(x2, x2, y0, h);
      break;
    }
    case 6: {
      const y1 = h / 3;
      mullion(x0, w, y1, y1);
      mullion(cx, cx, y1, h);
      break;
    }
    case 7: {
      const x1 = w / 3;
      const x2 = (2 * w) / 3;
      mullion(x1, x1, y0, h);
      mullion(x2, x2, y0, h);
      break;
    }
    case 8: {
      const y1 = h / 2;
      mullion(x0, w, y1, y1);
      mullion(x0, w, y0 + h * 0.25, y0 + h * 0.25);
      break;
    }
    case 9: {
      const x1 = w / 3;
      const x2 = (2 * w) / 3;
      const y1 = h / 3;
      const y2 = (2 * h) / 3;
      mullion(x1, x1, y0, h);
      mullion(x2, x2, y0, h);
      mullion(x0, w, y1, y1);
      mullion(x0, w, y2, y2);
      break;
    }
    default:
      break;
  }

  return out;
}

/** Дверной блок (полотно + простая коробка). Пустой проём — не генерируется. */
export function buildDoorAssemblySpecsForOpening(wall: Wall, opening: Opening, project: Project): readonly Opening3dMeshSpec[] {
  if (!isOpeningPlacedOnWall(opening) || opening.kind !== "door" || opening.isEmptyOpening) {
    return [];
  }
  const sx = wall.start.x;
  const sy = wall.start.y;
  const ex = wall.end.x;
  const ey = wall.end.y;
  const { nx, nz, lenMm, ux, uy } = thicknessNormalUnit(sx, sy, ex, ey);
  if (lenMm < MIN_LEN) {
    return [];
  }
  const dxM = (ex - sx) * MM_TO_M;
  const dzM = -(ey - sy) * MM_TO_M;
  const rotationY = Math.atan2(dxM, dzM);
  const bottomMm = wallBottomElevationMm(wall, project);
  const o0 = opening.offsetFromStartMm;
  const o1 = o0 + opening.widthMm;
  const sill = openingSillLevelMm(opening);
  const openTop = openingTopLevelMmForShell(opening);
  const W = Math.max(200, opening.widthMm);
  const T = Math.max(60, wall.thicknessMm);
  const frameDepthMm = Math.max(26, Math.min(60, T * 0.35));
  const frameFaceMm = Math.max(20, Math.min(DOOR_FRAME_FACE_MM, W * 0.1, Math.max(200, openTop - sill) * 0.1));
  const leafDepthMm = Math.max(24, Math.min(DOOR_LEAF_THICKNESS_MM, frameDepthMm - 4));
  const leafWmm = Math.max(120, W - 2 * DOOR_CLEARANCE_MM);
  const clearHmm = Math.max(200, openTop - sill);
  const leafHmm = Math.max(180, clearHmm - 2 * DOOR_CLEARANCE_MM);
  const leafNormalOffsetMm = Math.max(0, T / 2 - leafDepthMm / 2 - 8);

  const placeCenter = (uMid: number, yMid: number, normalOffsetMm = 0): [number, number, number] => {
    const px = sx + ux * uMid;
    const py = sy + uy * uMid;
    const cx = (px + nx * normalOffsetMm) * MM_TO_M;
    const cz = (-py + nz * normalOffsetMm) * MM_TO_M;
    const cy = bottomMm * MM_TO_M + yMid * MM_TO_M;
    return [cx, cy, cz];
  };

  const out: Opening3dMeshSpec[] = [];
  let k = 0;
  const key = (suffix: string) => `${opening.id}-door-${suffix}-${k++}`;
  const uC = (o0 + o1) / 2;
  const yC = sill + clearHmm / 2;

  out.push({
    reactKey: key("leaf"),
    kind: "door_leaf",
    wallId: wall.id,
    openingId: opening.id,
    position: placeCenter(uC, sill + DOOR_CLEARANCE_MM + leafHmm / 2, leafNormalOffsetMm),
    rotationY,
    width: leafDepthMm * MM_TO_M,
    height: leafHmm * MM_TO_M,
    depth: leafWmm * MM_TO_M,
  });

  out.push({
    reactKey: key("frame-left"),
    kind: "door_frame",
    wallId: wall.id,
    openingId: opening.id,
    position: placeCenter(o0 + frameFaceMm / 2, yC),
    rotationY,
    width: frameDepthMm * MM_TO_M,
    height: clearHmm * MM_TO_M,
    depth: frameFaceMm * MM_TO_M,
  });
  out.push({
    reactKey: key("frame-right"),
    kind: "door_frame",
    wallId: wall.id,
    openingId: opening.id,
    position: placeCenter(o1 - frameFaceMm / 2, yC),
    rotationY,
    width: frameDepthMm * MM_TO_M,
    height: clearHmm * MM_TO_M,
    depth: frameFaceMm * MM_TO_M,
  });
  out.push({
    reactKey: key("frame-top"),
    kind: "door_frame",
    wallId: wall.id,
    openingId: opening.id,
    position: placeCenter(uC, openTop - frameFaceMm / 2),
    rotationY,
    width: frameDepthMm * MM_TO_M,
    height: frameFaceMm * MM_TO_M,
    depth: W * MM_TO_M,
  });

  const hingeAtStart = (opening.doorSwing ?? "in_right").endsWith("left");
  const handleAlongSign = hingeAtStart ? 1 : -1;
  const handleAlong = (hingeAtStart ? o0 : o1) + handleAlongSign * Math.max(45, W - DOOR_HANDLE_BACKSET_MM);
  const handleY = sill + Math.min(DOOR_HANDLE_HEIGHT_MM, leafHmm - 120);
  for (const side of [-1, 1] as const) {
    const plateNormal = leafNormalOffsetMm + side * (leafDepthMm / 2 + DOOR_HANDLE_PLATE_T_MM / 2);
    const gripNormal = leafNormalOffsetMm + side * (leafDepthMm / 2 + DOOR_HANDLE_PLATE_T_MM + DOOR_HANDLE_GRIP_D_MM / 2);
    const suffix = side > 0 ? "outer" : "inner";
    out.push({
      reactKey: key(`handle-plate-${suffix}`),
      kind: "door_handle",
      wallId: wall.id,
      openingId: opening.id,
      position: placeCenter(handleAlong, handleY, plateNormal),
      rotationY,
      width: DOOR_HANDLE_PLATE_T_MM * MM_TO_M,
      height: DOOR_HANDLE_PLATE_H_MM * MM_TO_M,
      depth: DOOR_HANDLE_PLATE_W_MM * MM_TO_M,
    });
    out.push({
      reactKey: key(`handle-grip-${suffix}`),
      kind: "door_handle",
      wallId: wall.id,
      openingId: opening.id,
      position: placeCenter(handleAlong, handleY, gripNormal),
      rotationY,
      width: DOOR_HANDLE_GRIP_D_MM * MM_TO_M,
      height: DOOR_HANDLE_GRIP_D_MM * MM_TO_M,
      depth: DOOR_HANDLE_GRIP_LEN_MM * MM_TO_M,
    });
  }

  return out;
}

/** Элементы openingFramingPieces — упрощённая геометрия вокруг проёма. */
export function buildOpeningFramingPieceSpecs(wall: Wall, project: Project): readonly Opening3dMeshSpec[] {
  const sx = wall.start.x;
  const sy = wall.start.y;
  const ex = wall.end.x;
  const ey = wall.end.y;
  const { lenMm, ux, uy } = thicknessNormalUnit(sx, sy, ex, ey);
  if (lenMm < MIN_LEN) {
    return [];
  }
  const dxM = (ex - sx) * MM_TO_M;
  const dzM = -(ey - sy) * MM_TO_M;
  const rotationY = Math.atan2(dxM, dzM);
  const bottomMm = wallBottomElevationMm(wall, project);

  const byOpening = new Map<string, OpeningFramingPiece[]>();
  for (const p of project.openingFramingPieces) {
    if (p.wallId !== wall.id) {
      continue;
    }
    const arr = byOpening.get(p.openingId) ?? [];
    arr.push(p);
    byOpening.set(p.openingId, arr);
  }

  const out: Opening3dMeshSpec[] = [];
  for (const [openingId, pieces] of byOpening) {
    const opening = project.openings.find((o) => o.id === openingId);
    if (!opening || !isOpeningPlacedOnWall(opening) || opening.wallId !== wall.id) {
      continue;
    }
    const o0 = opening.offsetFromStartMm;
    const o1 = o0 + opening.widthMm;
    const sill = opening.sillHeightMm ?? opening.position?.sillLevelMm ?? 900;
    const H = opening.heightMm;
    const uC = (o0 + o1) / 2;
    const yC = sill + H / 2;
    const sideVerticalExtra3dMm = 200;

    const kindCount = new Map<OpeningFramingPieceKind, number>();
    const frameMm = frameWallMemberSizeMm(wall, project);
    for (const piece of pieces) {
      const prof = getProfileById(project, piece.profileId);
      const th = frameMm != null ? frameMm : profileBoardThicknessMm(prof);
      const dep = frameMm != null ? frameMm : profileDepthAlongNormalMm(prof);
      const idx = kindCount.get(piece.kind) ?? 0;
      kindCount.set(piece.kind, idx + 1);

      let uMid = uC;
      let yMid = yC;
      let depthM = piece.lengthMm * MM_TO_M;
      let widthM = dep * MM_TO_M;
      let heightM = th * MM_TO_M;

      if (piece.kind === "above" || piece.kind === "lintel_top" || piece.kind === "lintel_bottom" || piece.kind === "below") {
        const stack = idx * (th + 10);
        yMid =
          piece.kind === "above"
            ? sill + H + th / 2 + 35 + stack
            : piece.kind === "below"
              ? sill - th / 2 - 35 - stack
              : piece.kind === "lintel_top"
                ? sill + H - th / 2 - 8 - stack
                : sill + th / 2 + 8 + stack;
        uMid = uC;
        heightM = th * MM_TO_M;
        widthM = dep * MM_TO_M;
        depthM = Math.min(piece.lengthMm, o1 - o0 + 160) * MM_TO_M;
      } else if (piece.kind === "side_fix_left" || piece.kind === "side_fix_right") {
        uMid =
          piece.kind === "side_fix_left"
            ? o0 - FRAME_MM * 0.45 - idx * 14
            : o1 + FRAME_MM * 0.45 + idx * 14;
        yMid = sill + H * 0.52;
        heightM = piece.lengthMm * MM_TO_M;
        widthM = dep * MM_TO_M;
        depthM = th * MM_TO_M;
      } else {
        /** боковые основные */
        uMid = piece.kind === "side_left" ? o0 - FRAME_MM / 2 - 18 - idx * 24 : o1 + FRAME_MM / 2 + 18 + idx * 24;
        yMid = yC;
        heightM = Math.min(piece.lengthMm, H + sideVerticalExtra3dMm) * MM_TO_M;
        widthM = dep * MM_TO_M;
        depthM = th * MM_TO_M;
      }

      const px = sx + ux * uMid;
      const py = sy + uy * uMid;
      const cx = px * MM_TO_M;
      const cz = -py * MM_TO_M;
      const cy = bottomMm * MM_TO_M + yMid * MM_TO_M;
      out.push({
        reactKey: `${piece.id}-3d`,
        kind: "opening_framing",
        wallId: wall.id,
        openingId: opening.id,
        position: [cx, cy, cz],
        rotationY,
        width: widthM,
        height: heightM,
        depth: depthM,
      });
    }
  }
  return out;
}

export function buildOpening3dSpecsForWall(wall: Wall, project: Project): readonly Opening3dMeshSpec[] {
  const win: Opening3dMeshSpec[] = [];
  for (const o of project.openings) {
    if (o.wallId !== wall.id || !isOpeningPlacedOnWall(o)) {
      continue;
    }
    win.push(...buildWindowAssemblySpecsForOpening(wall, o, project));
    win.push(...buildDoorAssemblySpecsForOpening(wall, o, project));
  }
  win.push(...buildOpeningFramingPieceSpecs(wall, project));
  return win;
}

export function buildOpening3dSpecsForProject(project: Project): readonly Opening3dMeshSpec[] {
  const out: Opening3dMeshSpec[] = [];
  for (const w of project.walls) {
    out.push(...buildOpening3dSpecsForWall(w, project));
  }
  return out;
}
