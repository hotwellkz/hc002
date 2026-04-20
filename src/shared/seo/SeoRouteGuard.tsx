import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { applyDocumentSeo, isPrivateRoute } from "./documentSeo";

/**
 * Центральная страховка для SEO: при переходе на приватный маршрут принудительно
 * выставляет meta robots=noindex,nofollow, даже если конкретная страница забыла
 * вызвать useDocumentSeo. Срабатывает после маунта страницы, но до того, как
 * страница успеет запросить у поисковика индексацию (нам важен только DOM-стейт
 * в момент рендера).
 *
 * Компонент ничего не отображает.
 */
export function SeoRouteGuard(): null {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!isPrivateRoute(pathname)) {
      return;
    }
    const restore = applyDocumentSeo({ robots: "noindex" });
    return restore;
  }, [pathname]);
  return null;
}
