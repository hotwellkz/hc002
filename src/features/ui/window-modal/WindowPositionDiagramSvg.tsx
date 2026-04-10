import { useId } from "react";

import type { OpeningAlongAnchor, OpeningAlongAlignment } from "@/core/domain/openingWindowTypes";

export interface WindowPositionDiagramSvgProps {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly anchorAlongWall: OpeningAlongAnchor;
  readonly offsetAlongWallMm: number;
  readonly alignment: OpeningAlongAlignment;
  readonly sillLevelMm: number;
}

const VB = { w: 400, h: 312 };

/** Только SVG-схема: короткие подписи и числа, без длинных фраз (они вынесены в summary рядом). */
export function WindowPositionDiagramSvg({
  widthMm,
  heightMm,
  anchorAlongWall,
  offsetAlongWallMm,
  alignment,
  sillLevelMm,
}: WindowPositionDiagramSvgProps) {
  const markerId = useId().replace(/:/g, "");

  const safeW = Number.isFinite(widthMm) && widthMm > 0 ? widthMm : 1000;
  const safeH = Number.isFinite(heightMm) && heightMm > 0 ? heightMm : 1200;
  const sill = Number.isFinite(sillLevelMm) && sillLevelMm >= 0 ? sillLevelMm : 0;

  const floorY = 228;
  const wallLeft = 52;
  const wallW = 108;
  const wallTop = 36;
  const winScale = Math.min(78 / safeW, 112 / safeH);
  const winW = safeW * winScale;
  const winH = safeH * winScale;

  const sillSpanMm = 3200;
  const sillPx = Math.min(118, Math.max(28, (sill / sillSpanMm) * 118));
  const winBottom = floorY - sillPx;
  const winTop = winBottom - winH;
  const winLeft = wallLeft + (wallW - winW) / 2;

  const planY = 278;
  const planWallX0 = 28;
  const planWallX1 = 372;
  const planWallLen = planWallX1 - planWallX0;
  const anchorX =
    anchorAlongWall === "wall_start"
      ? planWallX0 + 8
      : anchorAlongWall === "wall_end"
        ? planWallX1 - 8
        : planWallX0 + planWallLen / 2;

  const offNorm = Math.min(1, Math.abs(offsetAlongWallMm) / 12000);
  const offDir = offsetAlongWallMm === 0 ? 1 : Math.sign(offsetAlongWallMm);
  const offPx = (18 + offNorm * 52) * offDir;
  let refX = anchorX + offPx;
  refX = Math.min(planWallX1 - 24, Math.max(planWallX0 + 24, refX));

  const winPlanW = Math.min(88, Math.max(36, (safeW / 4500) * planWallLen * 0.35));
  let winPlanLeft = refX;
  if (alignment === "center") {
    winPlanLeft = refX - winPlanW / 2;
  } else if (alignment === "leading") {
    winPlanLeft = refX;
  } else {
    winPlanLeft = refX - winPlanW;
  }
  winPlanLeft = Math.min(planWallX1 - winPlanW - 4, Math.max(planWallX0 + 4, winPlanLeft));

  const dimAccent = "var(--wp-pos-dim, var(--color-dimension-line, #94a3b8))";
  const dimMuted = "var(--wp-pos-dim-muted, var(--color-text-muted, #8a919c))";
  const wallStroke = "var(--wp-pos-wall, var(--color-border-strong, #3a4350))";
  const wallFill = "var(--wp-pos-wall-fill, color-mix(in srgb, var(--color-surface-hover) 70%, transparent))";
  const openingStroke = "var(--wp-pos-opening, var(--color-accent-outline, #4e97e8))";
  const sillLine = "var(--wp-pos-sill, var(--color-accent, #5aa7ff))";

  return (
    <svg
      className="wp-position-diagram__svg"
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <marker id={markerId} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
          <path d="M0,0 L5,2.5 L0,5 Z" fill={dimMuted} />
        </marker>
      </defs>

      {/* Фасад: пол */}
      <line x1={42} y1={floorY} x2={wallLeft + wallW + 56} y2={floorY} stroke={wallStroke} strokeWidth="1.25" />
      <text x={44} y={floorY + 14} className="wp-position-diagram__cap" fontSize="10" fill={dimMuted}>
        пол / база
      </text>

      {/* Стена */}
      <rect
        x={wallLeft}
        y={wallTop}
        width={wallW}
        height={floorY - wallTop}
        rx="3"
        fill={wallFill}
        stroke={wallStroke}
        strokeWidth="1.35"
      />
      <text
        x={wallLeft + wallW / 2}
        y={wallTop - 8}
        textAnchor="middle"
        className="wp-position-diagram__cap"
        fontSize="10"
        fill={dimMuted}
      >
        стена
      </text>

      {/* Проём */}
      <rect
        x={winLeft}
        y={winTop}
        width={winW}
        height={winH}
        rx="2"
        fill="none"
        stroke={openingStroke}
        strokeWidth="2"
      />

      {/* Уровень низа проёма */}
      <line
        x1={winLeft - 6}
        y1={winBottom}
        x2={winLeft + winW + 6}
        y2={winBottom}
        stroke={sillLine}
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />

      {/* Высота окна — справа */}
      <g stroke={dimAccent} strokeWidth="1.15" fill="none" strokeLinecap="round">
        <line x1={winLeft + winW + 22} y1={winTop} x2={winLeft + winW + 22} y2={winBottom} />
        <line x1={winLeft + winW + 18} y1={winTop} x2={winLeft + winW + 26} y2={winTop} />
        <line x1={winLeft + winW + 18} y1={winBottom} x2={winLeft + winW + 26} y2={winBottom} />
      </g>
      <text
        x={winLeft + winW + 34}
        y={(winTop + winBottom) / 2}
        textAnchor="start"
        dominantBaseline="middle"
        className="wp-position-diagram__val-lg"
        fontSize="13"
        fill="var(--wp-pos-val, var(--color-text-primary))"
        transform={`rotate(-90 ${winLeft + winW + 34} ${(winTop + winBottom) / 2})`}
      >
        {Math.round(safeH)}
      </text>
      <text
        x={winLeft + winW + 48}
        y={(winTop + winBottom) / 2}
        textAnchor="start"
        dominantBaseline="middle"
        className="wp-position-diagram__unit"
        fontSize="9"
        fill={dimMuted}
        transform={`rotate(-90 ${winLeft + winW + 48} ${(winTop + winBottom) / 2})`}
      >
        мм
      </text>

      {/* Ширина — снизу */}
      <g stroke={dimAccent} strokeWidth="1.15" fill="none" strokeLinecap="round">
        <line x1={winLeft} y1={winBottom + 28} x2={winLeft + winW} y2={winBottom + 28} />
        <line x1={winLeft} y1={winBottom + 24} x2={winLeft} y2={winBottom + 32} />
        <line x1={winLeft + winW} y1={winBottom + 24} x2={winLeft + winW} y2={winBottom + 32} />
      </g>
      <text
        x={winLeft + winW / 2}
        y={winBottom + 44}
        textAnchor="middle"
        className="wp-position-diagram__val-lg"
        fontSize="13"
        fill="var(--wp-pos-val, var(--color-text-primary))"
      >
        {Math.round(safeW)}
      </text>
      <text
        x={winLeft + winW / 2}
        y={winBottom + 56}
        textAnchor="middle"
        className="wp-position-diagram__unit"
        fontSize="9"
        fill={dimMuted}
      >
        мм
      </text>

      {/* Низ проёма от базы — слева (число; подпись в summary) */}
      <g stroke={dimAccent} strokeWidth="1.1" fill="none" strokeLinecap="round">
        <line x1={36} y1={floorY} x2={36} y2={winBottom} />
        <line x1={32} y1={floorY} x2={40} y2={floorY} />
        <line x1={32} y1={winBottom} x2={40} y2={winBottom} />
      </g>
      <text
        x={30}
        y={(floorY + winBottom) / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        className="wp-position-diagram__val"
        fontSize="12"
        fill="var(--wp-pos-val, var(--color-text-primary))"
        transform={`rotate(-90 30 ${(floorY + winBottom) / 2})`}
      >
        {Math.round(sill)}
      </text>

      {/* План: ось стены */}
      <line x1={planWallX0} y1={planY} x2={planWallX1} y2={planY} stroke={wallStroke} strokeWidth="10" strokeLinecap="round" />
      <line x1={planWallX0} y1={planY} x2={planWallX1} y2={planY} stroke={wallFill} strokeWidth="6" strokeLinecap="round" />

      <rect
        x={winPlanLeft}
        y={planY - 14}
        width={winPlanW}
        height={28}
        rx="2"
        fill="color-mix(in srgb, var(--color-accent-soft) 35%, transparent)"
        stroke={openingStroke}
        strokeWidth="1.5"
      />

      <circle cx={anchorX} cy={planY} r="4" fill="var(--wp-pos-anchor, var(--color-accent))" />
      <line x1={anchorX} y1={planY - 22} x2={anchorX} y2={planY + 22} stroke={dimMuted} strokeWidth="1" strokeDasharray="2 2" />

      <line
        x1={anchorX}
        y1={planY + 20}
        x2={refX}
        y2={planY + 20}
        stroke={dimMuted}
        strokeWidth="1.2"
        strokeDasharray="3 2"
        markerEnd={`url(#${markerId})`}
      />
      <text
        x={(anchorX + refX) / 2}
        y={planY + 34}
        textAnchor="middle"
        className="wp-position-diagram__cap"
        fontSize="9"
        fill={dimMuted}
      >
        вдоль стены
      </text>

      <text x={planWallX0 + planWallLen / 2} y={298} textAnchor="middle" className="wp-position-diagram__cap" fontSize="9" fill={dimMuted}>
        вид сверху
      </text>
    </svg>
  );
}
