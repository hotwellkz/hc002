import { useCallback, useEffect } from "react";

import { initProjectPersistence } from "@/data/projectPersistence";
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
    <div className="ui-error-banner">
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
  useEffect(() => {
    void initProjectPersistence();
  }, []);

  return (
    <>
      <AppShell />
      <ErrorBanner />
    </>
  );
}
