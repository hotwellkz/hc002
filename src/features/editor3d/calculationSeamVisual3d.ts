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
