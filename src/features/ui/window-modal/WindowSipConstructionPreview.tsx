import type { OpeningSipConstructionSpec } from "@/core/domain/openingWindowTypes";

export interface WindowSipConstructionPreviewProps {
  readonly sip: OpeningSipConstructionSpec;
}

/**
 * Схематичное превью вкладки «Конструкция SIP»: соответствует логике типов боковых и двойных пакетов.
 */
export function WindowSipConstructionPreview({ sip }: WindowSipConstructionPreviewProps) {
  const sideN = sip.sideType === "type1" ? 1 : sip.sideType === "type2" ? 2 : 3;
  const hasFix = sip.sideClosingStuds;

  return (
    <svg className="wp-sip-preview-svg" viewBox="0 0 200 220" aria-hidden="true">
      <rect x="40" y="50" width="120" height="110" fill="none" stroke="currentColor" strokeWidth="2" opacity={0.85} />
      <text x="100" y="108" textAnchor="middle" fill="currentColor" fontSize="11" opacity={0.7}>
        проём
      </text>

      {/* Над / под */}
      <rect x="25" y="32" width="150" height="10" fill="currentColor" opacity={0.35} />
      {sip.aboveDouble ? <rect x="25" y="22" width="150" height="8" fill="currentColor" opacity={0.28} /> : null}
      <rect x="25" y="168" width="150" height="10" fill="currentColor" opacity={0.35} />
      {sip.belowDouble ? <rect x="25" y="180" width="150" height="8" fill="currentColor" opacity={0.28} /> : null}

      {/* Перемычки */}
      <rect x="48" y="58" width="104" height="6" fill="currentColor" opacity={0.45} />
      {sip.lintelTopDouble ? <rect x="48" y="52" width="104" height="5" fill="currentColor" opacity={0.35} /> : null}
      <rect x="48" y="146" width="104" height="6" fill="currentColor" opacity={0.45} />
      {sip.lintelBottomDouble ? <rect x="48" y="153" width="104" height="5" fill="currentColor" opacity={0.35} /> : null}

      {/* Боковые: N сегментов слева/справа */}
      {Array.from({ length: sideN }, (_, i) => {
        const gap = 110 / sideN;
        const y0 = 50 + i * gap + (sideN > 1 ? 4 : 0);
        const h = Math.max(18, gap - (sideN > 1 ? 8 : 0));
        return (
          <g key={`s-${i}`}>
            <rect x="32" y={y0} width="8" height={h} fill="currentColor" opacity={0.5} />
            <rect x="160" y={y0} width="8" height={h} fill="currentColor" opacity={0.5} />
          </g>
        );
      })}

      {hasFix ? (
        <>
          <rect x="22" y="95" width="6" height="28" fill="currentColor" opacity={0.55} />
          <rect x="172" y="95" width="6" height="28" fill="currentColor" opacity={0.55} />
        </>
      ) : null}
    </svg>
  );
}
