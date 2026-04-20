/**
 * Управление SEO-тегами в <head> на лету для SPA: title, meta description,
 * canonical, robots. Лендинг должен иметь index,follow (что задано в index.html);
 * приватные маршруты (/app, /login, /register, /app/projects, /invite) — noindex,nofollow.
 *
 * Используется в HouseKitLandingPage и приватных страницах через хук useDocumentSeo.
 */

export type RobotsDirective = "index" | "noindex";

export interface DocumentSeoInput {
  /** Если задан — будет установлен document.title. */
  readonly title?: string;
  /** Если задан — обновит meta[name="description"]. */
  readonly description?: string;
  /** Канонический URL страницы. */
  readonly canonical?: string;
  /** Поведение поисковых ботов. По умолчанию index. */
  readonly robots?: RobotsDirective;
}

const ROBOTS_INDEX = "index, follow";
const ROBOTS_NOINDEX = "noindex, nofollow";

/** Маршруты, которые мы НЕ хотим видеть в поиске. */
const PRIVATE_ROUTE_PREFIXES = ["/app", "/login", "/register", "/invite", "/demo"] as const;

/**
 * Определяет, является ли маршрут приватным (не для индексации).
 * Чистая функция — удобно покрывать тестами.
 */
export function isPrivateRoute(pathname: string): boolean {
  if (!pathname) {
    return false;
  }
  for (const prefix of PRIVATE_ROUTE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}

/** Сериализует robots-директиву. */
export function serializeRobots(value: RobotsDirective): string {
  return value === "noindex" ? ROBOTS_NOINDEX : ROBOTS_INDEX;
}

function ensureMeta(name: string): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  return el;
}

function ensureCanonical(): HTMLLinkElement {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  return el;
}

/**
 * Применяет SEO-настройки к <head>. Возвращает функцию-restore, которая
 * откатывает изменения title и robots обратно. description/canonical обычно
 * не откатываем — главная их подменит при возврате.
 */
export function applyDocumentSeo(input: DocumentSeoInput): () => void {
  const prevTitle = document.title;
  const robotsEl = ensureMeta("robots");
  const yandexEl = ensureMeta("yandex");
  const googlebotEl = ensureMeta("googlebot");
  const prevRobots = robotsEl.getAttribute("content");
  const prevYandex = yandexEl.getAttribute("content");
  const prevGooglebot = googlebotEl.getAttribute("content");

  if (input.title) {
    document.title = input.title;
  }

  if (input.description !== undefined) {
    ensureMeta("description").setAttribute("content", input.description);
  }

  if (input.canonical !== undefined) {
    ensureCanonical().setAttribute("href", input.canonical);
  }

  const robotsValue = serializeRobots(input.robots ?? "index");
  robotsEl.setAttribute("content", robotsValue);
  yandexEl.setAttribute("content", robotsValue);
  googlebotEl.setAttribute("content", robotsValue);

  return () => {
    document.title = prevTitle;
    if (prevRobots !== null) {
      robotsEl.setAttribute("content", prevRobots);
    }
    if (prevYandex !== null) {
      yandexEl.setAttribute("content", prevYandex);
    }
    if (prevGooglebot !== null) {
      googlebotEl.setAttribute("content", prevGooglebot);
    }
  };
}
