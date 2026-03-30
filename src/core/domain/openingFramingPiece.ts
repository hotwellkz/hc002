/**
 * Конструктивные элементы обрамления проёма (отдельные сущности проекта).
 * Связь с окном — openingId; для спецификации и будущего 3D/монтажа.
 */

export type OpeningFramingPieceKind =
  | "above"
  | "lintel_top"
  | "lintel_bottom"
  | "side_left"
  | "side_right"
  | "side_fix_left"
  | "side_fix_right"
  | "below";

export interface OpeningFramingPiece {
  readonly id: string;
  readonly openingId: string;
  readonly wallId: string;
  readonly kind: OpeningFramingPieceKind;
  readonly profileId: string;
  /** Рабочая длина заготовки, мм. */
  readonly lengthMm: number;
  /** Стабильная марка (например ОК-1-H1). */
  readonly markLabel: string;
  /** Порядок сортировки в спецификации. */
  readonly sequenceIndex: number;
}
