# SEO production checklist — HouseKit Pro by HotWell.kz

Пошаговый чеклист для ручной публикации домена `housekit.pro` в Google и Яндекс
и запуска аналитики. Технический SEO-фундамент уже в коде
(см. `docs/seo-plan-housekit-pro.md`). Этот файл — про действия в панелях сторонних
сервисов.

---

## 0. Предварительная проверка кода

Перед любой работой с панелями проверить, что в проде всё отдаётся:

- [ ] `https://housekit.pro/` — 200, `<title>` и `<meta description>` ок.
- [ ] `https://housekit.pro/robots.txt` — 200, есть `Disallow: /app`, `/login`, `/register`, `/invite/`, `/demo` и `Sitemap: https://housekit.pro/sitemap.xml`.
- [ ] `https://housekit.pro/sitemap.xml` — 200, одна запись `https://housekit.pro/`.
- [ ] `https://housekit.pro/og-image.png` — 200, открывается картинка 1200×630.
- [ ] `https://housekit.pro/favicon.svg` — 200.
- [ ] `curl -sI https://housekit.pro/login` содержит `x-robots-tag: noindex, nofollow`
      (настроено через `public/_headers`). То же — для `/app`, `/register`, `/invite/<id>`.
- [ ] В DevTools на `/login` `document.head` содержит `<meta name="robots" content="noindex, nofollow">`
      (SPA-страница должна поставить тег после маунта).

---

## 1. Google Search Console

1. Зайти: <https://search.google.com/search-console>.
2. Добавить ресурс → **Domain property**: `housekit.pro`.
3. Подтвердить владение:
   - скопировать TXT-запись, которую даст Google;
   - в DNS-зоне (где хостится домен — Namecheap / Cloudflare / регистратор) добавить TXT-запись;
   - вернуться в GSC и нажать **Verify**.
4. Sitemap → **Add a new sitemap** → указать `sitemap.xml` (конечная форма: `https://housekit.pro/sitemap.xml`).
5. **URL Inspection** → ввести `https://housekit.pro/` → «Test live URL» → должен быть «URL is available to Google».
6. Нажать **Request indexing**.
7. (Опционально) Открыть приватный `https://housekit.pro/login` и убедиться, что GSC показывает блокировку в robots.txt / noindex — это ожидаемо.

---

## 2. Яндекс.Вебмастер

1. Зайти: <https://webmaster.yandex.ru>.
2. Добавить сайт → `https://housekit.pro`.
3. Подтвердить права:
   - способ «Meta-тег» — добавить `<meta name="yandex-verification" content="XXXX">` в `index.html`
     (проще всего: скопировать значение → коммит в репозиторий → deploy → вернуться в ЯВ и нажать «Проверить»);
   - либо DNS-способ — добавить TXT-запись.
4. Индексирование → Файлы Sitemap → добавить `https://housekit.pro/sitemap.xml`.
5. Инструменты → Анализ robots.txt → проверить, что `/app`, `/login`, `/register`, `/demo`, `/invite/` помечены как запрещённые для бота.
6. Инструменты → Проверка ответа сервера → ввести `https://housekit.pro/` → убедиться в 200.
7. (Опционально) Региональность → указать регион **Казахстан** + главный город.

---

## 3. Google Analytics 4

1. <https://analytics.google.com> → **Admin** → **Create property** → имя `HouseKit Pro`.
2. Часовой пояс: **Asia/Almaty**. Валюта: `KZT`.
3. **Data Streams** → **Web** → URL `https://housekit.pro`, имя «HouseKit Pro Web».
4. Скопировать **Measurement ID** (вида `G-XXXXXXXXXX`).
5. В Netlify → **Site settings → Environment variables** → добавить:
   - `VITE_GA_MEASUREMENT_ID = G-XXXXXXXXXX`
6. Netlify → **Deploys → Trigger deploy → Clear cache and deploy site** (иначе Vite не пересоберёт с новым env).
7. После деплоя:
   - открыть сайт, в **Network** поискать `googletagmanager.com/gtag/js?id=G-...`;
   - в GA → **Reports → Realtime** — должен появиться активный пользователь;
   - кликнуть «Начать проект» / «Посмотреть демо» → в Realtime появятся события `click_start_project`, `click_demo`.
8. GA4 → **Admin → Events → Mark as conversion** — отметить как конверсии:
   - `registration_success`
   - `create_project`
   - `click_start_project` (при желании)

---

## 4. Яндекс.Метрика

Счётчик с ID **108673725** уже **вшит инлайн в `index.html`** — стартует в `<head>`
до загрузки приложения и успевает отправить просмотр даже при мгновенном уходе.
Настройка в env **не требуется**; `VITE_YANDEX_METRICA_ID` — только для случая,
когда нужно перегнать на другой счётчик (тогда он заменит инлайн-ID в `trackEvent`).

1. Открыть счётчик в панели: <https://metrika.yandex.ru/list>
   → счётчик **108673725 (HouseKit Pro)**.
2. Проверить настройки счётчика:
   - адрес: `housekit.pro`, часовой пояс `Asia/Almaty`;
   - **Вебвизор 2.0** — ВКЛ (в снипете `webvisor: true`);
   - **Карта кликов** — ВКЛ (`clickmap: true`);
   - **Точный показатель отказа** — ВКЛ (`accurateTrackBounce: true`);
   - **Отслеживание внешних ссылок** — ВКЛ (`trackLinks: true`);
   - **Электронная коммерция** — контейнер `dataLayer` (`ecommerce: "dataLayer"`).
3. Подтверждение прав на сайт (если ещё не сделано):
   - способ «Через счётчик Метрики» → панель сама увидит, что счётчик стоит.
4. После деплоя (`housekit.pro`) открыть сайт в приватном окне и проверить:
   - в **Network** DevTools → запрос `https://mc.yandex.ru/metrika/tag.js?id=108673725` → 200;
   - в Метрике → **В реальном времени** — должен появиться визит в течение 10–30 сек;
   - открыть `/login`, `/register`, кликнуть «Начать проект» → в Метрике → **Отчёты → Содержимое → Страницы входа** / **Конверсии**.
5. Метрика → **Настройка → Цели** → создать JavaScript-цели, идентификаторы
   должны полностью совпадать с именами событий (чтобы совпало с GA4):
   - `click_start_project`
   - `click_demo`
   - `click_register`
   - `click_login`
   - `click_faq_item`
   - `registration_success`
   - `create_project`
   - `open_demo`
6. Метрика → **Настройка → Фильтры** → при необходимости добавить фильтр
   «Не считать мои визиты» (по IP или cookie), чтобы внутренние клики не портили статистику.
7. (Опционально) Метрика → **Настройка → Роботы** → оставить «Только достоверно нероботные визиты».

> Если потребуется переключить счётчик (например, на тестовый): заменить ID
> `108673725` в `index.html` (оба места — `tag.js?id=…` и `ym(…, 'init', …)`,
> плюс `<noscript>` и `mc.yandex.ru/watch/…`) **и** обновить константу
> `INLINE_YANDEX_METRICA_ID` в `src/shared/analytics/analytics.ts`.

---

## 5. Сетевая проверка после подключения

После шагов 3 и 4 открыть `https://housekit.pro/` в приватном окне и
проверить DevTools → Network:

- [ ] GET `https://www.googletagmanager.com/gtag/js?id=G-...` → 200;
- [ ] GET `https://www.google-analytics.com/g/collect?...` отправляется при навигации / кликах;
- [ ] GET `https://mc.yandex.ru/metrika/tag.js?id=108673725` → 200 (снипет стартует инлайн из `<head>`);
- [ ] POST `https://mc.yandex.ru/watch/108673725` отправляется при навигации.

Проверить события:

- [ ] клик «Начать проект» → `click_start_project` в GA Realtime и в Метрике (reachGoal);
- [ ] клик «Посмотреть демо» / кнопка «Открыть демо» → `click_demo`;
- [ ] клик «Зарегистрироваться» → `click_register`;
- [ ] клик «Войти» → `click_login`;
- [ ] открытие любого вопроса в FAQ → `click_faq_item`;
- [ ] успешная регистрация нового аккаунта → `registration_success`;
- [ ] создание проекта в `/app/projects` → `create_project`;
- [ ] переход по `/demo` → `open_demo`.

---

## 6. Lighthouse (DevTools → Lighthouse)

Прогнать на `https://housekit.pro/` в режиме «Mobile» с категориями:

- [ ] Performance ≥ 85
- [ ] Accessibility ≥ 95
- [ ] Best Practices ≥ 95
- [ ] SEO = 100

Частые «минусы» и что проверить:

- `Has a <meta name="viewport">` — ✅ в `index.html`.
- `Document has a valid hreflang` — для ru-only сайта не обязателен; появится только если будем запускать EN-версию.
- `Image elements have explicit width and height` — актуально, когда появятся реальные картинки.
- `Properly size images` — избегать загрузки огромных jpg; OG PNG 1200×630 ок.
- `Minimize main-thread work` — ожидаемо «жёлтый» из-за Three.js/Pixi, но на главной они не должны загружаться (лендинг и редактор разделены).

---

## 7. Соцсети (превью)

После любого изменения OG-тегов прогнать URL через:

- Facebook Sharing Debugger: <https://developers.facebook.com/tools/debug/>
- LinkedIn Post Inspector: <https://www.linkedin.com/post-inspector/>
- Twitter Card Validator: <https://cards-dev.twitter.com/validator> (если жив; иначе — Post Composer).
- Telegram: отправить ссылку в «Избранное», убедиться что превью появилось.

Все должны показать:

- title: **HouseKit Pro — программа для проектирования СИП-домов онлайн**;
- description: про 2D/3D/PDF;
- image: `/og-image.png`.

---

## 8. Обновление sitemap при выходе новых страниц

При добавлении SEO-страниц (`/sip-house-design-software`, `/sip-panel-calculator` и т.д.):

1. Добавить маршрут в `src/app/App.tsx` + компонент страницы с `useDocumentSeo({ robots: "index" })`.
2. Дописать URL в `public/sitemap.xml` (блок `<url>`).
3. Обновить `docs/seo-plan-housekit-pro.md` (проставить «готово»).
4. После деплоя — GSC → Sitemaps → **Resubmit**; ЯВ → Sitemap → **Проверить**.
5. GSC → URL Inspection → проверить новую страницу → Request indexing.
