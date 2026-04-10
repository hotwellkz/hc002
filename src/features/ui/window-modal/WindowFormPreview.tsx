import type { ReactNode } from "react";

import type { WindowViewPresetKey } from "@/core/domain/windowFormCatalog";
import { viewPresetByKey } from "@/core/domain/windowFormCatalog";
import { OpeningDimPreview, type OpeningPreviewGeometry } from "./OpeningDimPreview";

export interface WindowFormPreviewProps {
  readonly widthMm: number;
  readonly heightMm: number;
  readonly viewPreset: WindowViewPresetKey;
}

/** Схематичное превью окна: контур + синие размерные линии + импосты по пресету. */
export function WindowFormPreview({ widthMm, heightMm, viewPreset }: WindowFormPreviewProps) {
  const preset = viewPresetByKey(viewPreset);
  const v = preset?.previewVariant ?? 1;

  return (
    <OpeningDimPreview widthMm={widthMm} heightMm={heightMm} hint={`мм · схема «${preset?.label ?? viewPreset}»`}>
      {(g) => (
        <>
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
          <g stroke="var(--color-text-secondary)" strokeWidth="1" fill="none">
            {mullionPaths(v, g)}
          </g>
        </>
      )}
    </OpeningDimPreview>
  );
}

function mullionPaths(variant: number, geometry: OpeningPreviewGeometry): ReactNode {
  const { frameX: x0, frameY: y0, frameW: w, frameH: h } = geometry;
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
