import type { ReactNode } from "react";

import type { WindowViewPresetKey } from "@/core/domain/windowFormCatalog";
import { viewPresetByKey } from "@/core/domain/windowFormCatalog";

export interface WindowFormPreviewProps {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly viewPreset: WindowViewPresetKey;
}

/** Схематичное превью окна: контур + синие размерные линии + импосты по пресету. */
export function WindowFormPreview({ widthMm, heightMm, viewPreset }: WindowFormPreviewProps) {
  const preset = viewPresetByKey(viewPreset);
  const v = preset?.previewVariant ?? 1;
  const wLabel = Number.isFinite(widthMm) ? `${Math.round(widthMm)}` : "—";
  const hLabel = Number.isFinite(heightMm) ? `${Math.round(heightMm)}` : "—";

  return (
    <div className="wp-preview" aria-hidden>
      <svg className="wp-preview__svg" viewBox="0 0 220 280" preserveAspectRatio="xMidYMid meet">
        {/* Размерная линия по ширине (снизу) */}
        <line
          x1="40"
          y1="248"
          x2="180"
          y2="248"
          stroke="var(--wp-dim-line, var(--color-accent, #2563eb))"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <text x="110" y="268" textAnchor="middle" className="wp-preview__dim-text" fontSize="11">
          {wLabel}
        </text>

        {/* Размерная линия по высоте (слева) */}
        <line
          x1="28"
          y1="40"
          x2="28"
          y2="200"
          stroke="var(--wp-dim-line, var(--color-accent, #2563eb))"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <text
          x="14"
          y="122"
          textAnchor="middle"
          className="wp-preview__dim-text"
          fontSize="11"
          transform="rotate(-90 14 122)"
        >
          {hLabel}
        </text>

        {/* Контур окна */}
        <rect
          x="40"
          y="40"
          width="140"
          height="160"
          fill="var(--wp-preview-fill, color-mix(in srgb, var(--color-surface-hover) 65%, transparent))"
          stroke="var(--color-text-primary)"
          strokeWidth="1.5"
          rx="2"
        />

        <g stroke="var(--color-text-secondary)" strokeWidth="1" fill="none">
          {mullionPaths(v)}
        </g>
      </svg>
      <p className="wp-preview__hint">мм · схема «{preset?.label ?? viewPreset}»</p>
    </div>
  );
}

function mullionPaths(variant: number): ReactNode {
  const x0 = 40;
  const y0 = 40;
  const w = 140;
  const h = 160;
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;

  switch (variant) {
    case 1:
      return null;
    case 2:
      return <line x1={cx} y1={y0} x2={cx} y2={y0 + h} />;
    case 3:
      return <line x1={x0} y1={cy} x2={x0 + w} y2={cy} />;
    case 4:
      return (
        <>
          <line x1={cx} y1={y0} x2={cx} y2={y0 + h} />
          <line x1={x0} y1={cy} x2={x0 + w} y2={cy} />
        </>
      );
    case 5: {
      const x1 = x0 + w / 3;
      const x2 = x0 + (2 * w) / 3;
      return (
        <>
          <line x1={x1} y1={y0} x2={x1} y2={y0 + h} />
          <line x1={x2} y1={y0} x2={x2} y2={y0 + h} />
        </>
      );
    }
    case 6: {
      const y1 = y0 + h / 3;
      return (
        <>
          <line x1={x0} y1={y1} x2={x0 + w} y2={y1} />
          <line x1={cx} y1={y1} x2={cx} y2={y0 + h} />
        </>
      );
    }
    case 7: {
      const x1 = x0 + w / 3;
      const x2 = x0 + (2 * w) / 3;
      return (
        <>
          <line x1={x1} y1={y0} x2={x1} y2={y0 + h} />
          <line x1={x2} y1={y0} x2={x2} y2={y0 + h} />
        </>
      );
    }
    case 8: {
      const y1 = y0 + h / 2;
      return (
        <>
          <line x1={x0} y1={y1} x2={x0 + w} y2={y1} />
          <line x1={x0} y1={y0 + h * 0.25} x2={x0 + w} y2={y0 + h * 0.25} />
        </>
      );
    }
    case 9: {
      const x1 = x0 + w / 3;
      const x2 = x0 + (2 * w) / 3;
      const y1 = y0 + h / 3;
      const y2 = y0 + (2 * h) / 3;
      return (
        <>
          <line x1={x1} y1={y0} x2={x1} y2={y0 + h} />
          <line x1={x2} y1={y0} x2={x2} y2={y0 + h} />
          <line x1={x0} y1={y1} x2={x0 + w} y2={y1} />
          <line x1={x0} y1={y2} x2={x0 + w} y2={y2} />
        </>
      );
    }
    default:
      return null;
  }
}
