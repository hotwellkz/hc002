/** Оценочные размеры overlay (px) для clamp без измерения DOM. */
const HINT_MAX_W = 300;
const HINT_MAX_H = 140;
/** Примерная высота многострочного hint для стыковки coord HUD под/над пузырьком. */
const HINT_CONTENT_APPROX_H = 68;
const COORD_HUD_H = 44;
const PAD = 12;
const CURSOR_GAP = 20;

export interface PlacementHudScreenPosition {
  readonly hintLeft: number;
  readonly hintTop: number;
  /** Дублирующий HUD X/Y/D — только если не открыта модалка координат. */
  readonly coordHudLeft: number | null;
  readonly coordHudTop: number | null;
}

/**
 * Позиция floating-подсказки и coord HUD относительно курсора на canvas:
 * квадрантная стратегия (не накрывать курсор и рабочую зону по возможности),
 * clamp в границах canvas, при открытой модалке координат — «парковка» внизу слева и скрытие coord HUD.
 */
export function computePlacementHudScreenPosition(opts: {
  readonly canvasRect: DOMRect;
  readonly cursorCanvasX: number;
  readonly cursorCanvasY: number;
  readonly wallCoordinateModalOpen: boolean;
  /** Модалка смещения от опорной точки — та же «парковка» подсказки, что и у координат стены. */
  readonly wallAnchorCoordinateModalOpen?: boolean;
  readonly showCoordHud: boolean;
}): PlacementHudScreenPosition {
  const { canvasRect, cursorCanvasX, cursorCanvasY, wallCoordinateModalOpen, showCoordHud } = opts;
  const anyCoordModalOpen = wallCoordinateModalOpen || Boolean(opts.wallAnchorCoordinateModalOpen);

  const screenX = canvasRect.left + cursorCanvasX;
  const screenY = canvasRect.top + cursorCanvasY;

  if (anyCoordModalOpen) {
    const hintLeft = canvasRect.left + PAD;
    const hintTop = Math.max(canvasRect.top + PAD, canvasRect.bottom - HINT_MAX_H - PAD);
    return {
      hintLeft,
      hintTop,
      coordHudLeft: null,
      coordHudTop: null,
    };
  }

  const w = canvasRect.width;
  const h = canvasRect.height;
  const preferRight = cursorCanvasX < w * 0.5;
  const preferBelow = cursorCanvasY < h * 0.5;

  let hintLeft = preferRight ? screenX + CURSOR_GAP : screenX - HINT_MAX_W - CURSOR_GAP;
  let hintTop = preferBelow ? screenY + CURSOR_GAP : screenY - HINT_MAX_H - CURSOR_GAP;

  hintLeft = clamp(hintLeft, canvasRect.left + PAD, canvasRect.right - HINT_MAX_W - PAD);
  hintTop = clamp(hintTop, canvasRect.top + PAD, canvasRect.bottom - HINT_MAX_H - PAD);

  let coordHudLeft: number | null = null;
  let coordHudTop: number | null = null;

  if (showCoordHud) {
    coordHudLeft = hintLeft;
    const gap = 6;
    if (preferBelow) {
      coordHudTop = hintTop + HINT_CONTENT_APPROX_H + gap;
    } else {
      coordHudTop = hintTop - COORD_HUD_H - gap;
    }
    coordHudTop = clamp(coordHudTop, canvasRect.top + PAD, canvasRect.bottom - COORD_HUD_H - PAD);
  }

  return {
    hintLeft,
    hintTop,
    coordHudLeft,
    coordHudTop,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
