import type { EditorInstructionLine } from "./instructionHintModel";
import { SnapStatusBadge } from "./SnapStatusBadge";

export function InstructionOverlay({
  left,
  top,
  lines,
  snapLabel,
}: {
  readonly left: number;
  readonly top: number;
  readonly lines: readonly EditorInstructionLine[];
  /** Краткий статус привязки — отдельный бейдж под основным заголовком. */
  readonly snapLabel?: string | null;
}) {
  if (lines.length === 0) {
    return null;
  }

  const primary = lines[0]!;
  const rest = lines.slice(1);

  return (
    <div className="ed2d-instruction-overlay" style={{ left, top }} role="status" aria-live="polite">
      <div className={`ed2d-instruction-overlay__line ed2d-instruction-overlay__line--${primary.variant}`}>
        {primary.text}
      </div>
      {snapLabel ? <SnapStatusBadge label={snapLabel} /> : null}
      {rest.map((line, i) => (
        <div
          key={i}
          className={`ed2d-instruction-overlay__line ed2d-instruction-overlay__line--${line.variant}`}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
}
