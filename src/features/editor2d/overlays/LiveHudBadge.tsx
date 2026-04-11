export function LiveHudBadge({
  left,
  top,
  dx,
  dy,
  d,
  angleDeg,
  angleSnapLockedDeg,
  secondLine,
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
}) {
  const snap = angleSnapLockedDeg != null;
  return (
    <div
      className={snap ? "ed2d-live-hud-badge ed2d-live-hud-badge--angle-snap" : "ed2d-live-hud-badge"}
      style={{ left, top }}
      aria-hidden
    >
      <div className="ed2d-live-hud-badge__metrics">
        <span className="ed2d-live-hud-badge__pair">
          <span className="ed2d-live-hud-badge__k">X</span>
          <span className="ed2d-live-hud-badge__v">{Math.round(dx)}</span>
        </span>
        <span className="ed2d-live-hud-badge__sep" aria-hidden>
          ·
        </span>
        <span className="ed2d-live-hud-badge__pair">
          <span className="ed2d-live-hud-badge__k">Y</span>
          <span className="ed2d-live-hud-badge__v">{Math.round(dy)}</span>
        </span>
        <span className="ed2d-live-hud-badge__sep" aria-hidden>
          ·
        </span>
        <span className="ed2d-live-hud-badge__pair">
          <span className="ed2d-live-hud-badge__k">D</span>
          <span className="ed2d-live-hud-badge__v">{Math.round(d)}</span>
        </span>
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
