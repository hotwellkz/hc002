/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_USE_STORAGE?: string;
  /** Google Analytics 4 measurement ID, формат: G-XXXXXXXX. Если пусто — GA не подключается. */
  readonly VITE_GA_MEASUREMENT_ID?: string;
  /** Яндекс.Метрика, числовой идентификатор счётчика. Если пусто — Метрика не подключается. */
  readonly VITE_YANDEX_METRICA_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.json" {
  const value: Record<string, unknown>;
  export default value;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    /** dataLayer для Google Analytics 4 (gtag). */
    dataLayer?: unknown[];
    /** gtag для GA4. */
    gtag?: (...args: unknown[]) => void;
    /** Яндекс.Метрика. */
    ym?: (...args: unknown[]) => void;
  }
}
export {};
