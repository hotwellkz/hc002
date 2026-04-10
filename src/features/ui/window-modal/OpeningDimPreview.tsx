import type { ReactNode } from "react";

export interface OpeningPreviewGeometry {
  readonly frameX: number;
  readonly frameY: number;
  readonly frameW: number;
  readonly frameH: number;
}

interface OpeningDimPreviewProps {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly hint: string;
  readonly children?: (geometry: OpeningPreviewGeometry) => ReactNode;
}

const SVG_W = 220;
const SVG_H = 280;
const FRAME_MAX_W = 140;
const FRAME_MAX_H = 160;
const FRAME_CENTER_X = 110;
const FRAME_CENTER_Y = 120;

/** Базовая панель схемы проёма с авто-масштабом и размерными линиями. */
export function OpeningDimPreview({ widthMm, heightMm, hint, children }: OpeningDimPreviewProps) {
  const safeWidth = Number.isFinite(widthMm) && widthMm > 0 ? widthMm : 1000;
  const safeHeight = Number.isFinite(heightMm) && heightMm > 0 ? heightMm : 1200;
  const scale = Math.min(FRAME_MAX_W / safeWidth, FRAME_MAX_H / safeHeight);
  const frameW = safeWidth * scale;
  const frameH = safeHeight * scale;
  const frameX = FRAME_CENTER_X - frameW / 2;
  const frameY = FRAME_CENTER_Y - frameH / 2;
  const geometry: OpeningPreviewGeometry = { frameX, frameY, frameW, frameH };
  const wLabel = Number.isFinite(widthMm) ? `${Math.round(widthMm)}` : "—";
  const hLabel = Number.isFinite(heightMm) ? `${Math.round(heightMm)}` : "—";
  const dimY = frameY + frameH + 30;
  const dimX = frameX - 14;

  return (
    <div className="wp-preview" aria-hidden>
      <svg className="wp-preview__svg" viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="xMidYMid meet">
        <line
          x1={frameX}
          y1={dimY}
          x2={frameX + frameW}
          y2={dimY}
          stroke="var(--wp-dim-line, var(--color-accent, #2563eb))"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <line x1={frameX} y1={dimY - 4} x2={frameX} y2={dimY + 4} stroke="var(--wp-dim-line, var(--color-accent, #2563eb))" strokeWidth="1.2" />
        <line
          x1={frameX + frameW}
          y1={dimY - 4}
          x2={frameX + frameW}
          y2={dimY + 4}
          stroke="var(--wp-dim-line, var(--color-accent, #2563eb))"
          strokeWidth="1.2"
        />
        <text x={frameX + frameW / 2} y={dimY + 20} textAnchor="middle" className="wp-preview__dim-text" fontSize="11">
          {wLabel}
        </text>

        <line
          x1={dimX}
          y1={frameY}
          x2={dimX}
          y2={frameY + frameH}
          stroke="var(--wp-dim-line, var(--color-accent, #2563eb))"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <line x1={dimX - 4} y1={frameY} x2={dimX + 4} y2={frameY} stroke="var(--wp-dim-line, var(--color-accent, #2563eb))" strokeWidth="1.2" />
        <line
          x1={dimX - 4}
          y1={frameY + frameH}
          x2={dimX + 4}
          y2={frameY + frameH}
          stroke="var(--wp-dim-line, var(--color-accent, #2563eb))"
          strokeWidth="1.2"
        />
        <text
          x={dimX - 14}
          y={frameY + frameH / 2}
          textAnchor="middle"
          className="wp-preview__dim-text"
          fontSize="11"
          transform={`rotate(-90 ${dimX - 14} ${frameY + frameH / 2})`}
        >
          {hLabel}
        </text>

        {children?.(geometry)}
      </svg>
      <p className="wp-preview__hint">{hint}</p>
    </div>
  );
}
