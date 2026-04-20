/**
 * Подключение Google Analytics 4 и Яндекс.Метрики.
 *
 * - GA: ID берётся из VITE_GA_MEASUREMENT_ID. Если пусто — GA не подключается.
 * - Яндекс.Метрика: основной счётчик вшит инлайн в index.html (ID 108673725),
 *   чтобы грузиться как можно раньше и успевать отправить просмотр даже при
 *   мгновенном уходе со страницы. Этот модуль только подхватывает уже
 *   инициализированный window.ym для trackEvent/trackPageView. Если по какой-то
 *   причине снипета нет, но задан VITE_YANDEX_METRICA_ID — поднимаем счётчик
 *   программно (legacy-сценарий).
 * - Если ничего не подключено, trackEvent/trackPageView безопасно молчат.
 *
 * См. список поддерживаемых событий в analyticsConfig.ts (AnalyticsEventName).
 */

import {
  type AnalyticsEventName,
  type AnalyticsEventParams,
  isValidGaMeasurementId,
  isValidYandexMetricaId,
} from "./analyticsConfig";

/**
 * ID счётчика, встроенного инлайн-снипетом в index.html.
 * Должен совпадать со значением в <script> блоке Yandex.Metrika counter.
 */
const INLINE_YANDEX_METRICA_ID = 108_673_725;

let initDone = false;
let gaId: string | null = null;
let ymId: number | null = null;

function injectScript(src: string, attrs?: Readonly<Record<string, string>>): void {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      s.setAttribute(k, v);
    }
  }
  document.head.appendChild(s);
}

function bootstrapGa(measurementId: string): void {
  window.dataLayer = window.dataLayer ?? [];
  const dl = window.dataLayer;
  const gtag = (...args: unknown[]) => {
    dl.push(args);
  };
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", measurementId, { anonymize_ip: true, send_page_view: true });
  injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`);
}

function bootstrapYandex(counterId: number): void {
  // Минимальный snippet Метрики, повторяющий поведение официального loader:
  // создаёт глобальный ym и подгружает tag.js, после чего выполняет ym('init').
  const w = window as unknown as { ym?: (...args: unknown[]) => void; [k: string]: unknown };
  if (typeof w.ym !== "function") {
    const queue: unknown[][] = [];
    const ym = (...args: unknown[]) => {
      queue.push(args);
    };
    (ym as unknown as { a: unknown[][]; l: number }).a = queue;
    (ym as unknown as { a: unknown[][]; l: number }).l = Date.now();
    w.ym = ym;
  }
  injectScript("https://mc.yandex.ru/metrika/tag.js");
  window.ym?.(counterId, "init", {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: false,
  });
}

/**
 * Однократно подключает доступные системы аналитики. Безопасно вызывать
 * на старте приложения. Повторные вызовы — no-op.
 */
export function initAnalytics(): void {
  if (initDone || typeof window === "undefined") {
    return;
  }
  initDone = true;

  const env = import.meta.env;
  const rawGa = env["VITE_GA_MEASUREMENT_ID"]?.trim();
  const rawYm = env["VITE_YANDEX_METRICA_ID"]?.trim();

  if (isValidGaMeasurementId(rawGa)) {
    gaId = rawGa;
    bootstrapGa(rawGa);
  }

  // Приоритет 1: счётчик уже поднят инлайн-снипетом в index.html.
  // Тогда просто фиксируем ID (из env, если задан, иначе — дефолтный инлайн-ID),
  // чтобы trackEvent/trackPageView ходили в уже работающий ym(), без повторного init.
  const inlineYmReady =
    typeof (window as unknown as { ym?: unknown }).ym === "function";
  if (inlineYmReady) {
    ymId = isValidYandexMetricaId(rawYm) ? Number(rawYm) : INLINE_YANDEX_METRICA_ID;
    return;
  }

  // Приоритет 2 (legacy): инлайн-снипета нет, но задан env — поднимаем счётчик сами.
  if (isValidYandexMetricaId(rawYm)) {
    ymId = Number(rawYm);
    bootstrapYandex(ymId);
  }
}

/** Отправка SPA pageview (вызывается при смене маршрута). */
export function trackPageView(path: string): void {
  if (typeof window === "undefined") {
    return;
  }
  if (gaId && typeof window.gtag === "function") {
    window.gtag("event", "page_view", { page_path: path });
  }
  if (ymId !== null && typeof window.ym === "function") {
    window.ym(ymId, "hit", path);
  }
}

/**
 * Унифицированная отправка события в GA4 и Яндекс.Метрику.
 * Если аналитика не подключена — вызов безопасно игнорируется.
 */
export function trackEvent(name: AnalyticsEventName, params?: AnalyticsEventParams): void {
  if (typeof window === "undefined") {
    return;
  }
  if (gaId && typeof window.gtag === "function") {
    window.gtag("event", name, params ?? {});
  }
  if (ymId !== null && typeof window.ym === "function") {
    window.ym(ymId, "reachGoal", name, params ?? {});
  }
}

/** Только для тестов / отладки. */
export function __resetAnalyticsForTests(): void {
  initDone = false;
  gaId = null;
  ymId = null;
}
