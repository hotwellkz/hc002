/** Чистые помощники для аналитики — без обращения к window/import.meta, чтобы их можно было покрыть unit-тестами. */

const GA_MEASUREMENT_ID_RE = /^G-[A-Z0-9]{6,}$/;
const YANDEX_METRICA_ID_RE = /^\d{4,12}$/;

export function isValidGaMeasurementId(value: string | undefined | null): value is string {
  if (!value) {
    return false;
  }
  return GA_MEASUREMENT_ID_RE.test(value.trim());
}

export function isValidYandexMetricaId(value: string | undefined | null): value is string {
  if (!value) {
    return false;
  }
  return YANDEX_METRICA_ID_RE.test(value.trim());
}

/** Названия событий, которые ходят в обе системы аналитики. */
export type AnalyticsEventName =
  | "click_start_project"
  | "click_demo"
  | "click_register"
  | "click_login"
  | "click_faq_item"
  | "registration_success"
  | "create_project"
  | "open_demo"
  // Публичные SEO-страницы (/sip-house-design-software, /sip-panel-calculator, /reports).
  | "click_seo_start_project"
  | "click_seo_demo"
  | "click_seo_internal_link"
  | "click_seo_faq_item";

export type AnalyticsEventParams = Readonly<Record<string, string | number | boolean | null>>;
