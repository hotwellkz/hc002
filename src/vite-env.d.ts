/// <reference types="vite/client" />

declare module "*.json" {
  const value: Record<string, unknown>;
  export default value;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}
export {};
