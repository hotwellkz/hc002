import { useAppStore } from "@/store/useAppStore";

interface StatusBarProps {
  readonly cursorWorldMm: { x: number; y: number } | null;
}

function persistenceHint(
  ready: boolean,
  enabled: boolean,
  status: "idle" | "loading" | "saving" | "saved" | "error",
): string {
  if (!ready || status === "loading") {
    return "Проект: загрузка…";
  }
  if (!enabled) {
    return "Облако: нет (задайте VITE_FIREBASE_* в .env)";
  }
  if (status === "saving") {
    return "Облако: сохранение…";
  }
  if (status === "error") {
    return "Облако: ошибка";
  }
  if (status === "saved") {
    return "Облако: сохранено";
  }
  return "Облако: готово";
}

export function StatusBar({ cursorWorldMm }: StatusBarProps) {
  const cursor =
    cursorWorldMm === null
      ? "—"
      : `X: ${cursorWorldMm.x.toFixed(0)} мм · Y: ${cursorWorldMm.y.toFixed(0)} мм`;

  const persistenceReady = useAppStore((s) => s.persistenceReady);
  const firestoreEnabled = useAppStore((s) => s.firestoreEnabled);
  const persistenceStatus = useAppStore((s) => s.persistenceStatus);

  return (
    <footer className="shell-status">
      <span>Курсор (мир, мм): {cursor}</span>
      <span className="muted">{persistenceHint(persistenceReady, firestoreEnabled, persistenceStatus)}</span>
      <span className="muted">ЛКМ: выбор · СКМ / инструмент «Панорама»: перетаскивание · Колёсико: масштаб</span>
    </footer>
  );
}
