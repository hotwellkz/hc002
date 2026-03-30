import type { WindowFormKey, WindowViewPresetKey } from "./windowFormCatalog";
import type { OpeningPositionSpec, OpeningSipConstructionSpec } from "./openingWindowTypes";

export type OpeningKind = "door" | "window" | "other";

/** Проём, уже привязанный к стене (есть wallId и смещение вдоль оси). */
export function isOpeningPlacedOnWall(o: Opening): o is Opening & { wallId: string; offsetFromStartMm: number } {
  return o.wallId != null && o.offsetFromStartMm != null;
}

export interface Opening {
  readonly id: string;
  /** null — проём ещё не привязан к стене. */
  readonly wallId: string | null;
  readonly kind: OpeningKind;
  /**
   * Расстояние от start стены вдоль оси, мм (левый край проёма).
   * null — не размещён на стене (черновик окна).
   */
  readonly offsetFromStartMm: number | null;
  readonly widthMm: number;
  readonly heightMm: number;
  /** Для окон: высота подоконника от уровня пола, мм (совместимость с расчётом). */
  readonly sillHeightMm?: number;
  /** Окно: форма проёма (прямоугольник и далее). */
  readonly formKey?: WindowFormKey;
  readonly formName?: string;
  /** Пустой проём без заполнения. */
  readonly isEmptyOpening?: boolean;
  /** Пресет схемы остекления / импостов (превью). */
  readonly viewPreset?: WindowViewPresetKey;
  /** Наплыв (мм). */
  readonly sillOverhangMm?: number;
  /** Вкладка «Позиция»: привязка и уровень. */
  readonly position?: OpeningPositionSpec | null;
  /** Вкладка «Конструкция SIP»: профили обрамления. */
  readonly sipConstruction?: OpeningSipConstructionSpec | null;
  /** Стабильный номер окна в проекте (для марки ОК-n). */
  readonly windowSequenceNumber?: number;
  readonly markLabel?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}
