import type { KeyboardEvent as ReactKeyboardEvent, Ref } from "react";

import { sanitizeSignedNumericHudDraft } from "../liveHudNumericDraft";

export type LiveHudInlineField = "x" | "y" | "d";

export interface LiveHudInlineEdit {
  readonly field: LiveHudInlineField;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  readonly inputRef: Ref<HTMLInputElement>;
}

export function LiveHudBadge({
  left,
  top,
  dx,
  dy,
  d,
  angleDeg,
  angleSnapLockedDeg,
  secondLine,
  inlineEdit,
}: {
  readonly left: number;
  readonly top: number;
  readonly dx: number;
  readonly dy: number;
  readonly d: number;
  readonly angleDeg?: number;
  readonly angleSnapLockedDeg?: number | null;
  /** Ось / доп. пояснение или вторая метрика (Δ, L…). */
  readonly secondLine?: string | null;
  readonly inlineEdit?: LiveHudInlineEdit | null;
}) {
  const snap = angleSnapLockedDeg != null;
  const interactive = inlineEdit != null;
  const cls = [
    "ed2d-live-hud-badge",
    interactive ? "ed2d-live-hud-badge--interactive" : "",
    snap ? "ed2d-live-hud-badge--angle-snap" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const pair = (k: string, v: number, field: LiveHudInlineField) => {
    const ed = inlineEdit?.field === field ? inlineEdit : null;
    return (
      <span className="ed2d-live-hud-badge__pair">
        <span className="ed2d-live-hud-badge__k">{k}</span>
        {ed ? (
          <input
            ref={ed.inputRef}
            className="ed2d-live-hud-badge__input"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            aria-label={k === "D" ? "Длина D, мм" : `${k}, мм`}
            value={ed.value}
            onChange={(e) => {
              const next = sanitizeSignedNumericHudDraft(ed.value, e.target.value);
              ed.onChange(next);
            }}
            onKeyDown={ed.onKeyDown}
          />
        ) : (
          <span className="ed2d-live-hud-badge__v">{Math.round(v)}</span>
        )}
      </span>
    );
  };

  return (
    <div className={cls} style={{ left, top }} aria-hidden={!interactive}>
      <div className="ed2d-live-hud-badge__metrics">
        {pair("X", dx, "x")}
        <span className="ed2d-live-hud-badge__sep" aria-hidden>
          ·
        </span>
        {pair("Y", dy, "y")}
        <span className="ed2d-live-hud-badge__sep" aria-hidden>
          ·
        </span>
        {pair("D", d, "d")}
        {angleDeg != null ? (
          <>
            <span className="ed2d-live-hud-badge__sep" aria-hidden>
              ·
            </span>
            <span className="ed2d-live-hud-badge__pair">
              <span className="ed2d-live-hud-badge__k">∠</span>
              <span className="ed2d-live-hud-badge__v">{Math.round(angleDeg)}°</span>
            </span>
          </>
        ) : null}
      </div>
      {secondLine ? <div className="ed2d-live-hud-badge__sub">{secondLine}</div> : null}
    </div>
  );
}
