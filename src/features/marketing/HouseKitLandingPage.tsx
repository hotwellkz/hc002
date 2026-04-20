import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { Box, FileText, LayoutGrid, Menu, X } from "lucide-react";

import { useAuth } from "@/features/auth/AuthProvider";
import { trackEvent } from "@/shared/analytics/analytics";
import { useDocumentSeo } from "@/shared/seo/useDocumentSeo";

import "./houseKitLanding.css";
import "./seoArticlePage.css";

const LANDING_TITLE = "HouseKit Pro — программа для проектирования СИП-домов онлайн";
const LANDING_DESCRIPTION =
  "Онлайн-сервис для проектирования СИП-домов: 2D-план, 3D-модель, стены, крыша, стропильная система, PDF-отчёты и спецификации материалов.";
const LANDING_CANONICAL = "https://housekit.pro/";

const PAIN_CARDS = [
  {
    title: "Чертежи собираются вручную",
    body: "Правки в плане размножают ручную работу: фасады, разрезы и спецификации отстают от модели.",
  },
  {
    title: "Размеры легко потерять при изменениях",
    body: "Любой сдвиг стены требует перепроверки цепочки размеров и узлов на всех листах.",
  },
  {
    title: "Спецификация не всегда совпадает с моделью",
    body: "Excel и отчёты живут отдельно от 3D: ошибки в количестве панелей и досок всплывают на производстве.",
  },
  {
    title: "Монтажникам нужны понятные отчёты",
    body: "На площадке нужны ясные виды стен и крыши с метками — без лишних файлов и версий.",
  },
  {
    title: "Производству нужны точные размеры панелей и досок",
    body: "Раскрой и раскладка СИП-панелей должны идти из одной геометрии, а не из черновых таблиц.",
  },
];

const FEATURE_CARDS = [
  { title: "2D-план дома", body: "Чертите несущие стены, проёмы и инженерные контуры в привычной 2D-среде." },
  { title: "3D-вид дома", body: "Проверяйте объём, фасады и коллизии в интерактивной 3D-сцене." },
  { title: "СИП-стены и проёмы", body: "Профили стен, узлы и маркировка для производства и монтажа." },
  { title: "Стартовая доска", body: "Учёт стартового ряда и связка с несущим контуром." },
  { title: "Фундамент и сваи", body: "Заготовки под ленты, плиты и сваи в общей модели." },
  { title: "Фасады", body: "Визуальный контроль внешнего вида и отделки по слоям." },
  { title: "План скатов", body: "Геометрия кровли и скатов для дальнейшей стропильной системы." },
  { title: "Стропильная система", body: "Параметры стропил и узлы крыши в связке с плоскостями кровли." },
  { title: "PDF-отчёты", body: "Комплекты листов для цеха, монтажа и заказчика из актуальной модели." },
  { title: "Спецификация материалов", body: "Ведомости и спецификации, согласованные с геометрией проекта." },
];

const AUDIENCE = [
  "Производители СИП-домов",
  "Проектировщики",
  "Строительные компании",
  "Монтажные бригады",
  "Отдел продаж",
];

const PIPELINE = [
  "2D-план",
  "3D-модель",
  "Виды стен",
  "Крыша",
  "PDF-отчёты",
  "Спецификация",
];

const FAQ_ITEMS: ReadonlyArray<{ readonly q: string; readonly a: string }> = [
  {
    q: "Для чего нужен HouseKit Pro?",
    a: "HouseKit Pro — это онлайн-программа для проектирования СИП-домов: 2D-план и 3D-модель, расчёт СИП-панелей, чертежи стен, крыши и стропильной системы, PDF-отчёты и спецификации материалов в одном сервисе.",
  },
  {
    q: "Можно ли проектировать СИП-дома онлайн?",
    a: "Да. Сервис работает в браузере: вы создаёте план, проверяете 3D, формируете отчёты и спецификации без установки и привязки к рабочему месту.",
  },
  {
    q: "Формирует ли программа PDF-отчёты?",
    a: "Да. HouseKit Pro генерирует комплекты PDF-отчётов: листы стен и крыши, фасады, спецификации СИП-панелей и материалов — напрямую из актуальной модели проекта.",
  },
  {
    q: "Можно ли рассчитать СИП-панели и материалы?",
    a: "Да. На основе геометрии модели программа делает раскладку и расчёт СИП-панелей, ведомость пиломатериалов, стартовую доску, фундамент и стропильную систему — всё попадает в спецификацию.",
  },
  {
    q: "Подходит ли сервис для строительных компаний?",
    a: "Да. HouseKit Pro используют строительные компании и производители СИП-домов: один источник истины для проектировщика, цеха и монтажной бригады, единый комплект отчётов и спецификаций.",
  },
  {
    q: "Можно ли работать командой в одной компании?",
    a: "Да. После регистрации создаётся рабочее пространство компании: можно пригласить сотрудников, разграничить роли и хранить проекты в облаке.",
  },
];

const REGISTER_WITH_RETURN = "/register?returnUrl=/app/projects";

function buildFaqJsonLd(items: ReadonlyArray<{ readonly q: string; readonly a: string }>): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: it.a,
      },
    })),
  });
}

function LandingStartProjectLink({ className }: { readonly className?: string }) {
  const { isAuthenticated, status } = useAuth();
  const handleClick = () => trackEvent("click_start_project", { auth: status });
  if (status === "loading") {
    return (
      <Link className={className} to={REGISTER_WITH_RETURN} onClick={handleClick}>
        Начать проект
      </Link>
    );
  }
  return (
    <Link
      className={className}
      to={isAuthenticated ? "/app/projects" : REGISTER_WITH_RETURN}
      onClick={handleClick}
    >
      Начать проект
    </Link>
  );
}

/**
 * Маркетинговая стартовая страница. Дальше: Firebase Auth, Company, облачные проекты (см. TODO в auth-страницах).
 */
export function HouseKitLandingPage() {
  const navId = useId();
  const faqJsonLdId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);

  useDocumentSeo({
    title: LANDING_TITLE,
    description: LANDING_DESCRIPTION,
    canonical: LANDING_CANONICAL,
    robots: "index",
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="hk-root">
      <a className="hk-skip" href="#hk-main">
        Перейти к содержанию
      </a>

      <header className="hk-header">
        <div className="hk-header-inner">
          <Link className="hk-brand-block" to="/" onClick={closeMobile}>
            <span className="hk-brand-title">HouseKit Pro</span>
            <span className="hk-brand-sub">by HotWell.kz</span>
          </Link>

          <nav className="hk-nav-desktop" aria-label="Разделы страницы">
            <a href="#features">Возможности</a>
            <a href="#reports">Отчёты</a>
            <a href="#for-who">Для кого</a>
            <a href="#demo">Демо</a>
            <a href="#faq">FAQ</a>
          </nav>

          <div className="hk-header-actions">
            <Link
              className="hk-btn hk-btn-ghost"
              to="/login"
              onClick={() => trackEvent("click_login", { source: "header" })}
            >
              Войти
            </Link>
            <Link
              className="hk-btn hk-btn-primary"
              to={REGISTER_WITH_RETURN}
              onClick={() => trackEvent("click_register", { source: "header" })}
            >
              Зарегистрироваться
            </Link>
          </div>

          <button
            type="button"
            className="hk-menu-btn"
            aria-expanded={mobileOpen}
            aria-controls={navId}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
            <span className="sr-only">{mobileOpen ? "Закрыть меню" : "Открыть меню"}</span>
          </button>
        </div>

        <div id={navId} className="hk-mobile-drawer" hidden={!mobileOpen}>
          <a href="#features" onClick={closeMobile}>
            Возможности
          </a>
          <a href="#reports" onClick={closeMobile}>
            Отчёты
          </a>
          <a href="#for-who" onClick={closeMobile}>
            Для кого
          </a>
          <a href="#demo" onClick={closeMobile}>
            Демо
          </a>
          <a href="#faq" onClick={closeMobile}>
            FAQ
          </a>
          <div className="hk-mobile-drawer-actions">
            <Link
              className="hk-btn hk-btn-ghost"
              to="/login"
              onClick={() => {
                trackEvent("click_login", { source: "mobile_drawer" });
                closeMobile();
              }}
            >
              Войти
            </Link>
            <Link
              className="hk-btn hk-btn-primary"
              to={REGISTER_WITH_RETURN}
              onClick={() => {
                trackEvent("click_register", { source: "mobile_drawer" });
                closeMobile();
              }}
            >
              Зарегистрироваться
            </Link>
          </div>
        </div>
      </header>

      <main id="hk-main">
        <div className="hk-main">
          <section className="hk-hero" aria-labelledby="hk-hero-title">
            <div>
              <h1 id="hk-hero-title">Онлайн-проектирование СИП-домов от 3D-модели до отчётов и спецификаций</h1>
              <p className="hk-hero-lead">
                Создавайте СИП-дома, раскладку стен, крышу, стропильную систему, PDF-отчёты и спецификации в одном
                онлайн-сервисе.
              </p>
              <div className="hk-hero-ctas">
                <LandingStartProjectLink className="hk-btn hk-btn-primary hk-btn-lg" />
                <Link
                  className="hk-btn hk-btn-ghost hk-btn-lg"
                  to="/demo"
                  onClick={() => trackEvent("click_demo", { source: "hero" })}
                >
                  Посмотреть демо
                </Link>
              </div>
            </div>

            <div className="hk-hero-preview" aria-hidden={false}>
              <div className="hk-preview-grid">
                <div className="hk-preview-tile">
                  <Box size={28} strokeWidth={1.5} aria-hidden />
                  <span className="hk-preview-label">3D дом</span>
                </div>
                <div className="hk-preview-tile">
                  <LayoutGrid size={28} strokeWidth={1.5} aria-hidden />
                  <span className="hk-preview-label">2D план</span>
                </div>
                <div className="hk-preview-tile">
                  <FileText size={28} strokeWidth={1.5} aria-hidden />
                  <span className="hk-preview-label">PDF отчёты</span>
                </div>
              </div>
              <p className="hk-preview-caption">Путь от модели к производству — в одном интерфейсе</p>
            </div>
          </section>

          <section className="hk-section" aria-labelledby="hk-pain-title">
            <h2 id="hk-pain-title" className="hk-section-title">
              Почему проектирование СИП-домов занимает слишком много времени
            </h2>
            <p className="hk-section-lead">
              Разрыв между моделью, чертежами и спецификациями тянет сроки и создаёт риски на производстве и на площадке.
            </p>
            <div className="hk-card-grid cols-3">
              {PAIN_CARDS.map((c) => (
                <article key={c.title} className="hk-glass-card">
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="hk-section" aria-labelledby="hk-solution-title">
            <h2 id="hk-solution-title" className="hk-section-title">
              HouseKit Pro связывает модель, отчёты и спецификацию
            </h2>
            <p className="hk-section-lead">
              Одна среда для проектирования домокомплектов: изменения в плане и 3D автоматически отражаются в отчётах и
              ведомостях.
            </p>
            <div className="hk-pipeline" role="group" aria-label="Цепочка проектирования">
              {PIPELINE.map((step, i) => (
                <span key={step} style={{ display: "contents" }}>
                  <span className="hk-pipeline-step">{step}</span>
                  {i < PIPELINE.length - 1 ? <span className="hk-pipeline-arrow" aria-hidden="true">→</span> : null}
                </span>
              ))}
            </div>
          </section>

          <section className="hk-section" id="reports" aria-labelledby="hk-reports-title">
            <h2 id="hk-reports-title" className="hk-section-title">
              PDF-отчёты и спецификация без ручного копирования
            </h2>
            <p className="hk-section-lead">
              Формируйте комплекты листов для производства и монтажа, а также спецификации СИП-панелей и материалов —
              напрямую из актуальной модели. Это снижает расхождения между офисом, цехом и стройплощадкой при
              проектировании СИП-домов онлайн.
            </p>
          </section>

          <section className="hk-section" id="pillars" aria-labelledby="hk-pillars-title">
            <h2 id="hk-pillars-title" className="hk-section-title">
              Возможности HouseKit Pro для разных задач
            </h2>
            <p className="hk-section-lead">
              Три направления, которые в HouseKit Pro работают в одной связке: проектирование СИП-дома, расчёт панелей и
              формирование отчётов.
            </p>
            <div className="hk-seo-pillars-grid">
              <Link
                to="/sip-house-design-software"
                className="hk-seo-pillar"
                onClick={() =>
                  trackEvent("click_seo_internal_link", {
                    slug: "landing",
                    to: "/sip-house-design-software",
                    placement: "pillars",
                  })
                }
              >
                <h3>Проектирование СИП-домов</h3>
                <p>2D-план, 3D-модель, стены, крыша и стропильная система в одной программе.</p>
                <span className="hk-seo-pillar-cta">Подробнее</span>
              </Link>
              <Link
                to="/sip-panel-calculator"
                className="hk-seo-pillar"
                onClick={() =>
                  trackEvent("click_seo_internal_link", {
                    slug: "landing",
                    to: "/sip-panel-calculator",
                    placement: "pillars",
                  })
                }
              >
                <h3>Расчёт СИП-панелей</h3>
                <p>Раскладка панелей, размеры, ведомость и данные для производства — из модели дома.</p>
                <span className="hk-seo-pillar-cta">Подробнее</span>
              </Link>
              <Link
                to="/reports"
                className="hk-seo-pillar"
                onClick={() =>
                  trackEvent("click_seo_internal_link", {
                    slug: "landing",
                    to: "/reports",
                    placement: "pillars",
                  })
                }
              >
                <h3>PDF-отчёты</h3>
                <p>Комплекты листов и спецификации СИП-дома для цеха, монтажа и заказчика.</p>
                <span className="hk-seo-pillar-cta">Подробнее</span>
              </Link>
            </div>
          </section>

          <section className="hk-section" id="features" aria-labelledby="hk-features-title">
            <h2 id="hk-features-title" className="hk-section-title">
              Возможности HouseKit Pro
            </h2>
            <p className="hk-section-lead">
              Инструменты для полного цикла: от плана и 3D до кровли, стропил, расчёта СИП-панелей и программы для СИП
              панелей в производстве.
            </p>
            <div className="hk-card-grid cols-3">
              {FEATURE_CARDS.map((c) => (
                <article key={c.title} className="hk-glass-card">
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="hk-section" id="for-who" aria-labelledby="hk-audience-title">
            <h2 id="hk-audience-title" className="hk-section-title">
              Для кого
            </h2>
            <p className="hk-section-lead">
              Платформа для команд, которые проектируют домокомплекты и поставляют СИП-дома под ключ.
            </p>
            <ul className="hk-card-grid cols-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {AUDIENCE.map((label) => (
                <li key={label} className="hk-glass-card">
                  <h3 style={{ marginBottom: 0 }}>{label}</h3>
                </li>
              ))}
            </ul>
          </section>

          <section className="hk-section" aria-labelledby="hk-cloud-title">
            <h2 id="hk-cloud-title" className="hk-section-title">
              Работайте командой в одной компании
            </h2>
            <p className="hk-section-lead">
              После регистрации вы сможете создать рабочее пространство компании, пригласить сотрудников и хранить
              проекты в облаке.
            </p>
            {/**
             * TODO: визуализация облачной компании — связать с Firestore Company / CompanyMember / роли.
             */}
            <div className="hk-cloud-flow" aria-label="Схема: компания, сотрудники, проекты, отчёты">
              <div className="hk-cloud-node">Компания</div>
              <span className="hk-cloud-arrow" aria-hidden="true">
                →
              </span>
              <div className="hk-cloud-node">Сотрудники</div>
              <span className="hk-cloud-arrow" aria-hidden="true">
                →
              </span>
              <div className="hk-cloud-node">Проекты</div>
              <span className="hk-cloud-arrow" aria-hidden="true">
                →
              </span>
              <div className="hk-cloud-node">Отчёты</div>
            </div>
          </section>

          <section className="hk-section" id="demo" aria-labelledby="hk-demo-title">
            <h2 id="hk-demo-title" className="hk-section-title">
              Демо-проект
            </h2>
            <p className="hk-section-lead">
              Откройте готовый пример: 2D, 3D, отчёты и спецификация — как в реальном рабочем проекте.
            </p>
            <div className="hk-hero-ctas">
              <Link
                className="hk-btn hk-btn-primary hk-btn-lg"
                to="/demo"
                onClick={() => trackEvent("click_demo", { source: "demo_section" })}
              >
                Открыть демо
              </Link>
              <Link className="hk-btn hk-btn-ghost hk-btn-lg" to="/app">
                Пустой проект
              </Link>
            </div>
          </section>

          <section className="hk-section" id="faq" aria-labelledby="hk-faq-title">
            <h2 id="hk-faq-title" className="hk-section-title">
              Частые вопросы про HouseKit Pro
            </h2>
            <p className="hk-section-lead">
              Коротко о ключевых сценариях: проектирование СИП-домов онлайн, расчёт СИП-панелей, отчёты и работа в
              команде.
            </p>
            <div className="hk-faq" role="list">
              {FAQ_ITEMS.map((item, idx) => (
                <details
                  key={item.q}
                  className="hk-faq-item"
                  role="listitem"
                  open={idx === 0}
                  onToggle={(ev) => {
                    if (ev.currentTarget.open) {
                      trackEvent("click_faq_item", { question: item.q });
                    }
                  }}
                >
                  <summary className="hk-faq-q">{item.q}</summary>
                  <div className="hk-faq-a">{item.a}</div>
                </details>
              ))}
            </div>
            <script
              type="application/ld+json"
              id={faqJsonLdId}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: buildFaqJsonLd(FAQ_ITEMS) }}
            />
          </section>

          <section className="hk-section hk-cta" aria-labelledby="hk-cta-title">
            <h2 id="hk-cta-title">Попробуйте HouseKit Pro для СИП-домов</h2>
            <p>Расчёт СИП-панелей, чертежи СИП-дома и спецификация СИП-дома — начните с демо или нового проекта.</p>
            <div className="hk-cta-btns">
              <Link
                className="hk-btn hk-btn-primary hk-btn-lg"
                to={REGISTER_WITH_RETURN}
                onClick={() => trackEvent("click_register", { source: "footer_cta" })}
              >
                Зарегистрироваться
              </Link>
              <Link
                className="hk-btn hk-btn-ghost hk-btn-lg"
                to="/demo"
                onClick={() => trackEvent("click_demo", { source: "footer_cta" })}
              >
                Открыть демо
              </Link>
            </div>
          </section>
        </div>
      </main>

      <footer className="hk-footer">
        <div className="hk-footer-inner">
          <div className="hk-footer-brand">HouseKit Pro by HotWell.kz</div>
          <nav className="hk-footer-seo-nav" aria-label="SEO-навигация">
            <Link
              to="/sip-house-design-software"
              onClick={() =>
                trackEvent("click_seo_internal_link", {
                  slug: "landing",
                  to: "/sip-house-design-software",
                  placement: "footer",
                })
              }
            >
              Проектирование СИП-домов
            </Link>
            <Link
              to="/sip-panel-calculator"
              onClick={() =>
                trackEvent("click_seo_internal_link", {
                  slug: "landing",
                  to: "/sip-panel-calculator",
                  placement: "footer",
                })
              }
            >
              Расчёт СИП-панелей
            </Link>
            <Link
              to="/reports"
              onClick={() =>
                trackEvent("click_seo_internal_link", {
                  slug: "landing",
                  to: "/reports",
                  placement: "footer",
                })
              }
            >
              PDF-отчёты
            </Link>
          </nav>
          <div>
            <a href="https://housekit.pro" rel="noreferrer">
              housekit.pro
            </a>{" "}
            — онлайн-проектирование СИП-домов и домокомплектов
          </div>
        </div>
      </footer>
    </div>
  );
}
