/** Локальный бейдж статуса привязки (используется внутри InstructionOverlay). */
export function SnapStatusBadge({ label }: { readonly label: string }) {
  return <div className="ed2d-snap-status-badge">{label}</div>;
}
