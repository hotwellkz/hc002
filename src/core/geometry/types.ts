/** Все линейные величины в миллиметрах, углы в радианах, если не указано иное. */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Vector2D {
  readonly x: number;
  readonly y: number;
}

export interface LineSegment2D {
  readonly a: Point2D;
  readonly b: Point2D;
}

export interface Rect2D {
  readonly origin: Point2D;
  readonly width: number;
  readonly height: number;
}

export interface BBox2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}
