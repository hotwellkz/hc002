/**
 * Компактная подложка под номер доски на фасаде «Вид стены» — только внутри прямоугольника доски,
 * без выносок и плавающих маркеров.
 */

export type LumberPieceNumberLabelPx = {
  readonly cx: number;
  readonly cy: number;
  readonly pillX: number;
  readonly pillY: number;
  readonly pillW: number;
  readonly pillH: number;
  readonly fontSizePx: number;
};

const PAD_DEFAULT = 3;
const PAD_NARROW = 2;
const PAD_TIGHT = 1.5;
const PAD_MIN = 1;
const FS_DEFAULT = 10;
const FS_MIN = 8;
const NARROW_BOARD_PX = 22;

function estimateLabelBoxPx(n: number, fontSizePx: number): { tw: number; th: number } {
  const s = String(n);
  const tw = Math.max(fontSizePx * 0.72, s.length * fontSizePx * 0.56);
  const th = fontSizePx * 1.18;
  return { tw, th };
}

export function computeLumberPieceNumberLabelPx(args: {
  readonly leftPx: number;
  readonly topPx: number;
  readonly wPx: number;
  readonly hPx: number;
  readonly n: number;
}): LumberPieceNumberLabelPx {
  const { leftPx, topPx, wPx, hPx, n } = args;
  const narrow = Math.min(wPx, hPx) < NARROW_BOARD_PX;

  let pad = narrow ? PAD_NARROW : PAD_DEFAULT;
  let fs = FS_DEFAULT;

  const innerMaxW = Math.max(2, wPx - 2);
  const innerMaxH = Math.max(2, hPx - 2);

  let lw = 0;
  let lh = 0;
  for (let guard = 0; guard < 24; guard++) {
    const { tw, th } = estimateLabelBoxPx(n, fs);
    lw = tw + 2 * pad;
    lh = th + 2 * pad;
    if (lw <= innerMaxW && lh <= innerMaxH) break;
    if (pad > PAD_TIGHT) {
      pad = PAD_TIGHT;
      continue;
    }
    if (fs > FS_MIN) {
      fs -= 1;
      continue;
    }
    break;
  }

  if ((lw > innerMaxW || lh > innerMaxH) && pad > PAD_MIN) {
    const { tw, th } = estimateLabelBoxPx(n, fs);
    pad = PAD_MIN;
    lw = tw + 2 * pad;
    lh = th + 2 * pad;
  }

  const effW = Math.min(lw, innerMaxW);
  const effH = Math.min(lh, innerMaxH);
  const halfW = effW / 2;
  const halfH = effH / 2;

  let cx = leftPx + wPx / 2;
  let cy = topPx + hPx / 2;
  const m = 0.75;
  cx = Math.min(Math.max(cx, leftPx + halfW + m), leftPx + wPx - halfW - m);
  cy = Math.min(Math.max(cy, topPx + halfH + m), topPx + hPx - halfH - m);

  return {
    cx,
    cy,
    pillX: cx - halfW,
    pillY: cy - halfH,
    pillW: Math.max(1, effW),
    pillH: Math.max(1, effH),
    fontSizePx: fs,
  };
}
