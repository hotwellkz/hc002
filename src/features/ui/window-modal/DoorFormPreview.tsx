import { OpeningDimPreview } from "./OpeningDimPreview";

export interface DoorFormPreviewProps {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly doorType: "single";
  readonly doorSwing: "in_right" | "in_left" | "out_right" | "out_left";
  readonly isEmptyOpening: boolean;
  readonly trimMm: number;
}

/** Схематичное превью двери: проём, полотно, дуга открывания и размеры. */
export function DoorFormPreview({
  widthMm,
  heightMm,
  doorType,
  doorSwing,
  isEmptyOpening,
  trimMm,
}: DoorFormPreviewProps) {
  const hint = `мм · схема двери «${doorTypeLabel(doorType)}»`;
  const safeTrim = Number.isFinite(trimMm) && trimMm > 0 ? trimMm : 0;

  return (
    <OpeningDimPreview widthMm={widthMm} heightMm={heightMm} hint={hint}>
      {(g) => {
        const inset = Math.max(3, Math.min(g.frameW, g.frameH) * 0.05);
        const clearX = g.frameX + inset;
        const clearY = g.frameY + inset;
        const clearW = g.frameW - inset * 2;
        const clearH = g.frameH - inset * 2;
        const showTrim = !isEmptyOpening && safeTrim > 0;
        const trimPx = showTrim ? Math.min(8, Math.max(2, (safeTrim / Math.max(widthMm, heightMm, 1)) * Math.max(g.frameW, g.frameH) * 4)) : 0;

        const hingeLeft = doorSwing.endsWith("_left");
        const swingIn = doorSwing.startsWith("in_");
        const pivotX = hingeLeft ? clearX : clearX + clearW;
        const pivotY = clearY + clearH * 0.58;
        const leafLen = clearW * 0.88;
        const angleDeg = (hingeLeft ? 1 : -1) * (swingIn ? 55 : 35);
        const angleRad = (angleDeg * Math.PI) / 180;
        const leafEndX = pivotX + Math.cos(angleRad) * leafLen;
        const leafEndY = pivotY - Math.sin(angleRad) * leafLen;
        const arcSweep = hingeLeft ? (swingIn ? 0 : 1) : swingIn ? 1 : 0;

        return (
          <>
            {showTrim ? (
              <rect
                x={g.frameX - trimPx}
                y={g.frameY - trimPx}
                width={g.frameW + trimPx * 2}
                height={g.frameH + trimPx * 2}
                fill="none"
                stroke="var(--color-text-secondary)"
                strokeWidth="1"
                strokeDasharray="2.5 2"
                rx="2"
              />
            ) : null}

            <rect
              x={g.frameX}
              y={g.frameY}
              width={g.frameW}
              height={g.frameH}
              fill="var(--wp-preview-fill, color-mix(in srgb, var(--color-surface-hover) 65%, transparent))"
              stroke="var(--color-text-primary)"
              strokeWidth="1.5"
              rx="2"
            />
            <rect
              x={clearX}
              y={clearY}
              width={clearW}
              height={clearH}
              fill="none"
              stroke="var(--color-border-subtle)"
              strokeWidth="1"
            />

            {!isEmptyOpening ? (
              <g fill="none" stroke="var(--color-text-secondary)" strokeWidth="1.2" strokeLinecap="round">
                <line x1={pivotX} y1={pivotY} x2={leafEndX} y2={leafEndY} />
                <path d={`M ${pivotX} ${pivotY} A ${leafLen} ${leafLen} 0 0 ${arcSweep} ${leafEndX} ${leafEndY}`} />
                <circle cx={pivotX} cy={pivotY} r="1.8" fill="var(--color-text-secondary)" />
              </g>
            ) : null}
          </>
        );
      }}
    </OpeningDimPreview>
  );
}

function doorTypeLabel(type: "single"): string {
  switch (type) {
    case "single":
      return "Одинарная дверь";
    default:
      return "Дверь";
  }
}
