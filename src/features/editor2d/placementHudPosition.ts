/** Оценочные размеры overlay (px) без измерения DOM. */
const INSTR_MAX_W = 360;
const INSTR_SAFE_H = 200;
const INSTR_PAD = 12;
const INSTR_PARK_H = 150;

const LIVE_W = 300;
const LIVE_H = 56;
const CURSOR_GAP = 18;
const VIEWPORT_PAD = 8;

export interface EditorOverlayScreenLayout {
  readonly instruction: { readonly left: number; readonly top: number };
  /** null, если HUD отключён (модалка координат и т.п.). */
  readonly liveHud: { readonly left: number; readonly top: number } | null;
  readonly anyCoordModalOpen: boolean;
}

/**
 * Прямоугольник подсказки-инструкции (экранные координаты), чтобы live-HUD не наезжал на карточку.
 */
export function getEditorInstructionAvoidanceRect(
  canvasRect: DOMRect,
  anyCoordModalOpen: boolean,
): { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number } {
  if (anyCoordModalOpen) {
    const h = INSTR_PARK_H;
    return {
      left: canvasRect.left + INSTR_PAD,
      top: canvasRect.bottom - h - INSTR_PAD,
      right: canvasRect.left + INSTR_PAD + INSTR_MAX_W,
      bottom: canvasRect.bottom - INSTR_PAD,
    };
  }
  return {
    left: canvasRect.left + INSTR_PAD,
    top: canvasRect.top + INSTR_PAD,
    right: canvasRect.left + INSTR_PAD + INSTR_MAX_W,
    bottom: canvasRect.top + INSTR_PAD + INSTR_SAFE_H,
  };
}

/**
 * Основная инструкция: фиксированный угол canvas (верхний левый), не следует за курсором.
 * При открытой модалке координат — «парковка» внизу слева внутри canvas.
 */
export function computeEditorInstructionScreenPosition(opts: {
  readonly canvasRect: DOMRect;
  readonly wallCoordinateModalOpen: boolean;
  readonly floorBeamPlacementCoordinateModalOpen?: boolean;
  readonly wallAnchorCoordinateModalOpen?: boolean;
  readonly wallMoveCopyCoordinateModalOpen?: boolean;
  readonly floorBeamMoveCopyCoordinateModalOpen?: boolean;
  readonly entityCopyCoordinateModalOpen?: boolean;
  readonly slabCoordinateModalOpen?: boolean;
  readonly lengthChangeCoordinateModalOpen?: boolean;
}): { readonly left: number; readonly top: number } {
  const anyCoordModalOpen =
    opts.wallCoordinateModalOpen ||
    Boolean(opts.floorBeamPlacementCoordinateModalOpen) ||
    Boolean(opts.wallAnchorCoordinateModalOpen) ||
    Boolean(opts.wallMoveCopyCoordinateModalOpen) ||
    Boolean(opts.floorBeamMoveCopyCoordinateModalOpen) ||
    Boolean(opts.entityCopyCoordinateModalOpen) ||
    Boolean(opts.slabCoordinateModalOpen) ||
    Boolean(opts.lengthChangeCoordinateModalOpen);

  const r = opts.canvasRect;
  if (anyCoordModalOpen) {
    return {
      left: r.left + INSTR_PAD,
      top: Math.max(r.top + INSTR_PAD, r.bottom - INSTR_PARK_H - INSTR_PAD),
    };
  }
  return {
    left: r.left + INSTR_PAD,
    top: r.top + INSTR_PAD,
  };
}

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * Живой числовой HUD: рядом с курсором, с flip по краям viewport и без пересечения с зоной инструкции.
 */
export function computeEditorLiveHudScreenPosition(opts: {
  readonly canvasRect: DOMRect;
  readonly cursorCanvasX: number;
  readonly cursorCanvasY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly showCoordHud: boolean;
  readonly anyCoordModalOpen: boolean;
  readonly instructionAvoidRect: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
}): { readonly left: number; readonly top: number } | null {
  if (!opts.showCoordHud || opts.anyCoordModalOpen) {
    return null;
  }

  const { canvasRect, cursorCanvasX, cursorCanvasY, viewportWidth, viewportHeight, instructionAvoidRect } = opts;
  const cx = canvasRect.left + cursorCanvasX;
  const cy = canvasRect.top + cursorCanvasY;

  const hudBox = (left: number, top: number) => ({
    left,
    top,
    right: left + LIVE_W,
    bottom: top + LIVE_H,
  });

  const candidates: ReadonlyArray<{ readonly left: number; readonly top: number }> = [
    { left: cx + CURSOR_GAP, top: cy + CURSOR_GAP },
    { left: cx + CURSOR_GAP, top: cy - LIVE_H - CURSOR_GAP },
    { left: cx - LIVE_W - CURSOR_GAP, top: cy + CURSOR_GAP },
    { left: cx - LIVE_W - CURSOR_GAP, top: cy - LIVE_H - CURSOR_GAP },
    { left: cx + CURSOR_GAP, top: cy - LIVE_H * 0.5 },
    { left: cx - LIVE_W - CURSOR_GAP, top: cy - LIVE_H * 0.5 },
  ];

  const viewL = VIEWPORT_PAD;
  const viewT = VIEWPORT_PAD;
  const viewR = viewportWidth - VIEWPORT_PAD;
  const viewB = viewportHeight - VIEWPORT_PAD;

  const fitsViewport = (left: number, top: number) => {
    const b = hudBox(left, top);
    return b.left >= viewL && b.top >= viewT && b.right <= viewR && b.bottom <= viewB;
  };

  const clearInstruction = (left: number, top: number) =>
    !rectsOverlap(hudBox(left, top), instructionAvoidRect);

  for (const c of candidates) {
    if (fitsViewport(c.left, c.top) && clearInstruction(c.left, c.top)) {
      return {
        left: clamp(c.left, viewL, viewR - LIVE_W),
        top: clamp(c.top, viewT, viewB - LIVE_H),
      };
    }
  }

  let left = cx + CURSOR_GAP;
  let top = cy + CURSOR_GAP;
  left = clamp(left, viewL, viewR - LIVE_W);
  top = clamp(top, viewT, viewB - LIVE_H);

  if (!clearInstruction(left, top)) {
    left = instructionAvoidRect.right + 8;
    top = instructionAvoidRect.top;
    if (!fitsViewport(left, top)) {
      left = instructionAvoidRect.left;
      top = instructionAvoidRect.bottom + 8;
    }
    left = clamp(left, viewL, viewR - LIVE_W);
    top = clamp(top, viewT, viewB - LIVE_H);
  }

  if (!fitsViewport(left, top)) {
    left = clamp(cx - LIVE_W * 0.5, viewL, viewR - LIVE_W);
    top = clamp(cy - LIVE_H - CURSOR_GAP, viewT, viewB - LIVE_H);
  }

  return { left, top };
}

export function computeEditorOverlayLayout(opts: {
  readonly canvasRect: DOMRect;
  readonly cursorCanvasX: number;
  readonly cursorCanvasY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly wallCoordinateModalOpen: boolean;
  readonly floorBeamPlacementCoordinateModalOpen?: boolean;
  readonly wallAnchorCoordinateModalOpen?: boolean;
  readonly wallMoveCopyCoordinateModalOpen?: boolean;
  readonly floorBeamMoveCopyCoordinateModalOpen?: boolean;
  readonly entityCopyCoordinateModalOpen?: boolean;
  readonly slabCoordinateModalOpen?: boolean;
  readonly lengthChangeCoordinateModalOpen?: boolean;
  readonly showCoordHud: boolean;
}): EditorOverlayScreenLayout {
  const anyCoordModalOpen =
    opts.wallCoordinateModalOpen ||
    Boolean(opts.floorBeamPlacementCoordinateModalOpen) ||
    Boolean(opts.wallAnchorCoordinateModalOpen) ||
    Boolean(opts.wallMoveCopyCoordinateModalOpen) ||
    Boolean(opts.floorBeamMoveCopyCoordinateModalOpen) ||
    Boolean(opts.entityCopyCoordinateModalOpen) ||
    Boolean(opts.slabCoordinateModalOpen) ||
    Boolean(opts.lengthChangeCoordinateModalOpen);

  const instruction = computeEditorInstructionScreenPosition({
    canvasRect: opts.canvasRect,
    wallCoordinateModalOpen: opts.wallCoordinateModalOpen,
    floorBeamPlacementCoordinateModalOpen: opts.floorBeamPlacementCoordinateModalOpen,
    wallAnchorCoordinateModalOpen: opts.wallAnchorCoordinateModalOpen,
    wallMoveCopyCoordinateModalOpen: opts.wallMoveCopyCoordinateModalOpen,
    floorBeamMoveCopyCoordinateModalOpen: opts.floorBeamMoveCopyCoordinateModalOpen,
    entityCopyCoordinateModalOpen: opts.entityCopyCoordinateModalOpen,
    slabCoordinateModalOpen: opts.slabCoordinateModalOpen,
    lengthChangeCoordinateModalOpen: opts.lengthChangeCoordinateModalOpen,
  });

  const instructionAvoidRect = getEditorInstructionAvoidanceRect(opts.canvasRect, anyCoordModalOpen);

  const liveHud = computeEditorLiveHudScreenPosition({
    canvasRect: opts.canvasRect,
    cursorCanvasX: opts.cursorCanvasX,
    cursorCanvasY: opts.cursorCanvasY,
    viewportWidth: opts.viewportWidth,
    viewportHeight: opts.viewportHeight,
    showCoordHud: opts.showCoordHud,
    anyCoordModalOpen,
    instructionAvoidRect,
  });

  return { instruction, liveHud, anyCoordModalOpen };
}
