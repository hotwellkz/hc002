/**
 * Управление SEO-тегами в <head> на лету для SPA:
 * title, meta description, canonical, robots, Open Graph, Twitter Card.
 *
 * Лендинг и публичные SEO-страницы должны иметь index,follow
 * (что задано в index.html как базовое значение); приватные маршруты
 * (/app, /login, /register, /app/projects, /invite, /demo) — noindex,nofollow.
 *
 * Используется в маркетинговых страницах и приватных через хук useDocumentSeo.
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
  /** Заголовок для Open Graph / Twitter Card (обычно совпадает с title). */
  readonly ogTitle?: string;
  /** Описание для Open Graph / Twitter Card (обычно совпадает с description). */
  readonly ogDescription?: string;
  /** Абсолютный URL OG-картинки. По умолчанию наследуется из index.html. */
  readonly ogImage?: string;
  /** Абсолютный URL страницы для og:url / twitter:url (обычно = canonical). */
  readonly ogUrl?: string;
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

function ensureMetaProperty(property: string): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
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

interface MetaSnapshot {
  readonly el: HTMLMetaElement;
  readonly prev: string | null;
}

function snapshotAndSet(el: HTMLMetaElement, value: string): MetaSnapshot {
  const prev = el.getAttribute("content");
  el.setAttribute("content", value);
  return { el, prev };
}

function restoreSnapshot(snap: MetaSnapshot): void {
  if (snap.prev !== null) {
    snap.el.setAttribute("content", snap.prev);
  }
}

/**
 * Применяет SEO-настройки к <head>. Возвращает функцию-restore, которая
 * откатывает изменения title, robots, OG/Twitter обратно — чтобы при
 * возврате на другую страницу значения из index.html / предыдущей страницы
 * не «залипали».
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

  // Open Graph + Twitter Card — обновляем только если задано на уровне страницы.
  // Иначе остаются глобальные значения из index.html.
  const ogSnapshots: MetaSnapshot[] = [];
  if (input.ogTitle !== undefined) {
    ogSnapshots.push(snapshotAndSet(ensureMetaProperty("og:title"), input.ogTitle));
    ogSnapshots.push(snapshotAndSet(ensureMeta("twitter:title"), input.ogTitle));
  }
  if (input.ogDescription !== undefined) {
    ogSnapshots.push(snapshotAndSet(ensureMetaProperty("og:description"), input.ogDescription));
    ogSnapshots.push(snapshotAndSet(ensureMeta("twitter:description"), input.ogDescription));
  }
  if (input.ogImage !== undefined) {
    ogSnapshots.push(snapshotAndSet(ensureMetaProperty("og:image"), input.ogImage));
    ogSnapshots.push(snapshotAndSet(ensureMetaProperty("og:image:secure_url"), input.ogImage));
    ogSnapshots.push(snapshotAndSet(ensureMeta("twitter:image"), input.ogImage));
  }
  if (input.ogUrl !== undefined) {
    ogSnapshots.push(snapshotAndSet(ensureMetaProperty("og:url"), input.ogUrl));
    ogSnapshots.push(snapshotAndSet(ensureMeta("twitter:url"), input.ogUrl));
  }

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
    for (const snap of ogSnapshots) {
      restoreSnapshot(snap);
    }
  };
}
