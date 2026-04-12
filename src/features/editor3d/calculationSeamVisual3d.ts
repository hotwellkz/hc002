/** Стиль пунктирных линий стыков SIP на фасаде в 3D (`ProjectSipSeamLines`). */
export const CALC_SEAM_VISUAL = {
  /**
   * Деликатная вспомогательная разметка: тёмный серо-коричневый, тонкая линия, лёгкая прозрачность —
   * стык читается вблизи, не конкурирует с каркасом и оболочкой.
   */
  sipLine: {
    color: 0x6d6458,
    lineWidthPx: 1,
    dashSizeM: 0.036,
    gapSizeM: 0.024,
    opacity: 0.58,
  },
} as const;

/** Контур выбранного box-меша (точные размеры, без «надувания» 1–2 %). */
export const SELECTION_BOX_OUTLINE_3D = {
  color: 0xf2c94c,
  opacity: 0.95,
} as const;

/** Мягкая подсветка под курсором (ниже контраста, чем выбор). */
export const HOVER_BOX_OUTLINE_3D = {
  color: 0x8ec5ff,
  opacity: 0.55,
} as const;

/** Инструмент «Применить текстуру»: наведение (raycast). */
export const TEXTURE_TOOL_HOVER_OUTLINE_3D = {
  color: 0x6ee7b7,
  opacity: 0.72,
} as const;

/** Объект, для которого открыто окно параметров текстуры. */
export const TEXTURE_TOOL_LOCKED_OUTLINE_3D = {
  color: 0xfbbf24,
  opacity: 0.92,
} as const;

/**
 * Рёбра бруса каркаса и линейных профилей перекрытия (`Edges` на той же boxGeometry, что и solid) —
 * границы досок / балок без грубой обводки, в одном визуальном языке.
 */
export const LUMBER_FRAME_VISUAL_3D = {
  edges: {
    color: 0x4d453c,
    lineWidthPx: 1,
    opacity: 0.5,
    /** Угол (°) для drei `Edges` / граней бокса. */
    threshold: 15,
  },
} as const;

/** Балки перекрытия в 3D: те же параметры рёбер, что у расчётного бруса каркаса стен. */
export const FLOOR_BEAM_PROFILE_EDGES_3D = LUMBER_FRAME_VISUAL_3D;
