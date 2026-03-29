import { clamp } from "../geometry/compare";
import { segmentLength } from "../geometry/lineSegment";
import type { Point2D } from "../geometry/types";

import type { Opening } from "./opening";
import type { Wall } from "./wall";

/** Центр проёма вдоль оси стены (мм). */
export function openingCenterOnWallMm(wall: Wall, opening: Opening): Point2D {
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
