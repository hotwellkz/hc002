export type OpeningKind = "door" | "window" | "other";

export interface Opening {
  readonly id: string;
  readonly wallId: string;
  readonly kind: OpeningKind;
  /** Расстояние от start стены вдоль оси стены, мм. */
  readonly offsetFromStartMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  /** Для окон: высота подоконника от уровня пола, мм. */
  readonly sillHeightMm?: number;
}
