import type { OpeningAlongAnchor, OpeningAlongAlignment } from "@/core/domain/openingWindowTypes";

export interface WindowPositionDimPreviewProps {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly anchorAlongWall: OpeningAlongAnchor;
  readonly offsetAlongWallMm: number;
  readonly alignment: OpeningAlongAlignment;
  readonly sillLevelMm: number;
}

function anchorShort(a: OpeningAlongAnchor): string {
  switch (a) {
    case "wall_start":
      return "Нач.";
    case "wall_end":
      return "Кон.";
    case "wall_center":
      return "Центр";
    default:
      return "";
  }
}

/** Схематичное превью: стена, проём, подписи смещения и уровня (синие размерные линии в стиле формы окна). */
export function WindowPositionDimPreview({
  widthMm,
  heightMm,
  anchorAlongWall,
  offsetAlongWallMm,
  alignment,
  sillLevelMm,
}: WindowPositionDimPreviewProps) {
  const wLab = `${Math.round(widthMm)}`;
  const hLab = `${Math.round(heightMm)}`;
  const offLab = `${Math.round(offsetAlongWallMm)}`;
  const sillLab = `${Math.round(sillLevelMm)}`;
  const al =
    alignment === "center" ? "центр" : alignment === "leading" ? "лево" : "право";

  return (
    <div className="wp-preview wp-preview--position" aria-hidden>
      <svg className="wp-preview__svg" viewBox="0 0 220 300" preserveAspectRatio="xMidYMid meet">
        <line
          x1="24"
          y1="200"
          x2="196"
          y2="200"
          stroke="var(--wp-dim-line, var(--color-accent, #2563eb))"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <text x="110" y="222" textAnchor="middle" className="wp-preview__dim-text" fontSize="10">
          ось стены · {anchorShort(anchorAlongWall)} · {al}
        </text>

        <rect
          x="70"
          y="118"
          width="80"
          height="72"
          rx="2"
          fill="var(--color-surface-raised, rgba(255,255,255,0.06))"
          stroke="var(--color-accent, #2563eb)"
          strokeWidth="1.4"
        />

        <line
          x1="40"
          y1="260"
          x2="180"
          y2="260"
          stroke="var(--wp-dim-line, var(--color-accent, #2563eb))"
          strokeWidth="1.1"
        />
        <text x="110" y="278" textAnchor="middle" className="wp-preview__dim-text" fontSize="11">
          {wLab} мм
        </text>

        <line
          x1="188"
          y1="110"
          x2="188"
          y2="198"
          stroke="var(--wp-dim-line, var(--color-accent, #2563eb))"
          strokeWidth="1.1"
        />
        <text
          x="198"
          y="158"
          textAnchor="start"
          className="wp-preview__dim-text"
          fontSize="11"
          transform="rotate(-90 198 158)"
        >
          {hLab}
        </text>

        <line
          x1="32"
          y1="246"
          x2="32"
          y2="190"
          stroke="var(--wp-dim-line, var(--color-accent, #2563eb))"
          strokeWidth="1"
          strokeDasharray="3 2"
        />
        <text x="20" y="218" textAnchor="end" className="wp-preview__dim-text" fontSize="9.5">
          уровень
        </text>
        <text x="20" y="232" textAnchor="end" className="wp-preview__dim-text" fontSize="10">
          {sillLab}
        </text>

        <text x="110" y="104" textAnchor="middle" className="wp-preview__dim-text" fontSize="10">
          смещение по оси: {offLab} мм
        </text>
      </svg>
    </div>
  );
}
