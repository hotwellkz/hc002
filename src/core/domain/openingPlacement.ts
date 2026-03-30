import { clamp } from "../geometry/compare";
import { segmentLength } from "../geometry/lineSegment";
import type { Point2D } from "../geometry/types";

import type { Opening } from "./opening";
import type { Wall } from "./wall";
import { wallLengthMm } from "./wallCalculationGeometry";

/** Точка на оси стены на расстоянии alongMm от start (по прямой), мм. */
export function wallPointAtAlongFromStartMm(wall: Wall, alongMm: number): Point2D {
  const L = wallLengthMm(wall);
  const t = L < 1e-6 ? 0 : clamp(alongMm / L, 0, 1);
  return {
    x: wall.start.x + t * (wall.end.x - wall.start.x),
    y: wall.start.y + t * (wall.end.y - wall.start.y),
  };
}

/** Центр проёма вдоль оси стены (мм). Только для проёмов, уже привязанных к стене. */
export function openingCenterOnWallMm(wall: Wall, opening: Opening): Point2D {
  if (opening.wallId == null || opening.offsetFromStartMm == null) {
    throw new Error("openingCenterOnWallMm: проём не привязан к стене");
  }
  const len = segmentLength({ a: wall.start, b: wall.end });
  if (len < 1e-6) {
    return wall.start;
  }
  const along = opening.offsetFromStartMm + opening.widthMm / 2;
  const t = clamp(along / len, 0, 1);
  return {
    x: wall.start.x + t * (wall.end.x - wall.start.x),
    y: wall.start.y + t * (wall.end.y - wall.start.y),
  };
}
