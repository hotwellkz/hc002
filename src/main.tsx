import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/styles/theme.css";
import "@/styles/ui-primitives.css";

import { AuthProvider } from "@/features/auth/AuthProvider";
import { bootstrapThemeFromStorage } from "@/store/useUiThemeStore";

import App from "./app/App";

bootstrapThemeFromStorage();

if (import.meta.env.DEV) {
  void import("@/core/domain/lumberCutList").then((m) => {
    (globalThis as unknown as { __SIP_PRECUT__: typeof m }).__SIP_PRECUT__ = m;
  });
}

const el = document.getElementById("root");
if (!el) {
  throw new Error("root element not found");
}

createRoot(el).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
