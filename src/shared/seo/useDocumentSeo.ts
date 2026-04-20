import { useEffect } from "react";

import { applyDocumentSeo, type DocumentSeoInput } from "./documentSeo";

/**
 * React-обёртка над applyDocumentSeo. Применяет SEO-настройки на маунте
 * страницы и откатывает на размонтировании.
 *
 * Используется на маркетинговых и приватных страницах, чтобы поддерживать
 * корректные title/description и noindex для приватных маршрутов.
 */
export function useDocumentSeo(input: DocumentSeoInput): void {
  const { title, description, canonical, robots, ogTitle, ogDescription, ogImage, ogUrl } = input;
  useEffect(() => {
    return applyDocumentSeo({
      title,
      description,
      canonical,
      robots,
      ogTitle,
      ogDescription,
      ogImage,
      ogUrl,
    });
  }, [title, description, canonical, robots, ogTitle, ogDescription, ogImage, ogUrl]);
}
