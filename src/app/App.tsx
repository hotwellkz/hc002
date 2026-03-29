import { useCallback } from "react";

import { AppShell } from "@/features/ui/AppShell";
import { useAppStore } from "@/store/useAppStore";

function ErrorBanner() {
  const err = useAppStore((s) => s.lastError);
  const clear = useCallback(() => {
    useAppStore.setState({ lastError: null });
  }, []);

  if (!err) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        bottom: 36,
        maxWidth: 420,
        padding: "10px 12px",
        background: "#2a1214",
        border: "1px solid #5c2a30",
        borderRadius: 8,
        color: "#ffd3d6",
        fontSize: 12,
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span>{err}</span>
        <button type="button" className="btn" onClick={clear}>
          Закрыть
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <AppShell />
      <ErrorBanner />
    </>
  );
}
