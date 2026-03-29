interface StatusBarProps {
  readonly cursorWorldMm: { x: number; y: number } | null;
}

export function StatusBar({ cursorWorldMm }: StatusBarProps) {
  const cursor =
    cursorWorldMm === null
      ? "—"
      : `X: ${cursorWorldMm.x.toFixed(0)} мм · Y: ${cursorWorldMm.y.toFixed(0)} мм`;

  return (
    <footer className="shell-status">
      <span>Курсор (мир, мм): {cursor}</span>
      <span className="muted">ЛКМ: выбор · СКМ / инструмент «Панорама»: перетаскивание · Колёсико: масштаб</span>
    </footer>
  );
}
