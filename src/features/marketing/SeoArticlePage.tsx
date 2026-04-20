import { useEffect, useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

import { useAuth } from "@/features/auth/AuthProvider";
import { trackEvent } from "@/shared/analytics/analytics";
import { useDocumentSeo } from "@/shared/seo/useDocumentSeo";

import "./houseKitLanding.css";
import "./seoArticlePage.css";

export interface SeoFaqItem {
  readonly q: string;
  readonly a: string;
}

export interface SeoArticleCard {
  readonly title: string;
  readonly body: string;
}

export interface SeoArticleStep {
  readonly n: number;
  readonly title: string;
  readonly body?: string;
}

export interface SeoArticleRelatedLink {
  readonly to: string;
  readonly title: string;
  readonly body: string;
}

export interface SeoArticleSection {
  readonly id: string;
  readonly title: string;
  readonly lead?: string;
  /** Сетка карточек 2-3 колонки. */
  readonly cards?: ReadonlyArray<SeoArticleCard>;
  /** Пронумерованные шаги (пайплайн). */
  readonly steps?: ReadonlyArray<SeoArticleStep>;
  /** Простой список bullet-ов (аудитория / результат). */
  readonly bullets?: ReadonlyArray<string>;
  /** Произвольный ReactNode вместо стандартных карточек. */
  readonly children?: ReactNode;
}

export interface SeoArticlePageProps {
  readonly slug: string;
  readonly canonicalPath: string;
  readonly title: string;
  readonly description: string;
  readonly ogImage?: string;
  readonly breadcrumbName: string;
  readonly heroHeadline: string;
  readonly heroLead: string;
  readonly heroHighlights?: ReadonlyArray<string>;
  readonly sections: ReadonlyArray<SeoArticleSection>;
  readonly faq: ReadonlyArray<SeoFaqItem>;
  readonly relatedLinks: ReadonlyArray<SeoArticleRelatedLink>;
  readonly finalCtaTitle: string;
  readonly finalCtaLead: string;
}

const REGISTER_WITH_RETURN = "/register?returnUrl=/app/projects";
const SITE_ORIGIN = "https://housekit.pro";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

function buildFaqJsonLd(items: ReadonlyArray<SeoFaqItem>): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  });
}

function buildBreadcrumbJsonLd(canonicalUrl: string, currentName: string): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Главная",
        item: `${SITE_ORIGIN}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: currentName,
        item: canonicalUrl,
      },
    ],
  });
}

function SeoStartProjectLink({
  className,
  slug,
  placement,
}: {
  readonly className?: string;
  readonly slug: string;
  readonly placement: string;
}) {
  const { isAuthenticated, status } = useAuth();
  const target = status === "loading" ? REGISTER_WITH_RETURN : isAuthenticated ? "/app/projects" : REGISTER_WITH_RETURN;
  const handleClick = () => {
    trackEvent("click_seo_start_project", { slug, placement, auth: status });
  };
  return (
    <Link className={className} to={target} onClick={handleClick}>
      Начать проект
    </Link>
  );
}

function SeoDemoLink({
  className,
  slug,
  placement,
  label = "Посмотреть демо",
}: {
  readonly className?: string;
  readonly slug: string;
  readonly placement: string;
  readonly label?: string;
}) {
  return (
    <Link
      className={className}
      to="/demo"
      onClick={() => trackEvent("click_seo_demo", { slug, placement })}
    >
      {label}
    </Link>
  );
}

function SeoHeader({
  slug,
  mobileOpen,
  onToggle,
  onClose,
}: {
  readonly slug: string;
  readonly mobileOpen: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
}) {
  const navId = useId();
  return (
    <header className="hk-header">
      <div className="hk-header-inner">
        <Link className="hk-brand-block" to="/" onClick={onClose}>
          <span className="hk-brand-title">HouseKit Pro</span>
          <span className="hk-brand-sub">by HotWell.kz</span>
        </Link>

        <nav className="hk-nav-desktop" aria-label="Основные разделы">
          <Link
            to="/sip-house-design-software"
            onClick={() =>
              trackEvent("click_seo_internal_link", {
                slug,
                to: "/sip-house-design-software",
                placement: "header",
              })
            }
          >
            Проектирование
          </Link>
          <Link
            to="/sip-panel-calculator"
            onClick={() =>
              trackEvent("click_seo_internal_link", {
                slug,
                to: "/sip-panel-calculator",
                placement: "header",
              })
            }
          >
            Расчёт панелей
          </Link>
          <Link
            to="/reports"
            onClick={() =>
              trackEvent("click_seo_internal_link", {
                slug,
                to: "/reports",
                placement: "header",
              })
            }
          >
            Отчёты
          </Link>
          <Link
            to="/"
            onClick={() =>
              trackEvent("click_seo_internal_link", {
                slug,
                to: "/",
                placement: "header",
              })
            }
          >
            Главная
          </Link>
        </nav>

        <div className="hk-header-actions">
          <Link
            className="hk-btn hk-btn-ghost"
            to="/login"
            onClick={() => trackEvent("click_login", { source: `seo_${slug}_header` })}
          >
            Войти
          </Link>
          <SeoStartProjectLink className="hk-btn hk-btn-primary" slug={slug} placement="header" />
        </div>

        <button
          type="button"
          className="hk-menu-btn"
          aria-expanded={mobileOpen}
          aria-controls={navId}
          onClick={onToggle}
        >
          {mobileOpen ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
          <span className="sr-only">{mobileOpen ? "Закрыть меню" : "Открыть меню"}</span>
        </button>
      </div>

      <div id={navId} className="hk-mobile-drawer" hidden={!mobileOpen}>
        <Link
          to="/sip-house-design-software"
          onClick={() => {
            trackEvent("click_seo_internal_link", {
              slug,
              to: "/sip-house-design-software",
              placement: "mobile_drawer",
            });
            onClose();
          }}
        >
          Проектирование СИП-домов
        </Link>
        <Link
          to="/sip-panel-calculator"
          onClick={() => {
            trackEvent("click_seo_internal_link", {
              slug,
              to: "/sip-panel-calculator",
              placement: "mobile_drawer",
            });
            onClose();
          }}
        >
          Расчёт СИП-панелей
        </Link>
        <Link
          to="/reports"
          onClick={() => {
            trackEvent("click_seo_internal_link", {
              slug,
              to: "/reports",
              placement: "mobile_drawer",
            });
            onClose();
          }}
        >
          PDF-отчёты
        </Link>
        <Link
          to="/"
          onClick={() => {
            trackEvent("click_seo_internal_link", { slug, to: "/", placement: "mobile_drawer" });
            onClose();
          }}
        >
          Главная
        </Link>
        <div className="hk-mobile-drawer-actions">
          <Link
            className="hk-btn hk-btn-ghost"
            to="/login"
            onClick={() => {
              trackEvent("click_login", { source: `seo_${slug}_mobile_drawer` });
              onClose();
            }}
          >
            Войти
          </Link>
          <SeoStartProjectLink
            className="hk-btn hk-btn-primary"
            slug={slug}
            placement="mobile_drawer"
          />
        </div>
      </div>
    </header>
  );
}

function SeoFooter({ slug }: { readonly slug: string }) {
  const handleLink = (to: string) => () => {
    trackEvent("click_seo_internal_link", { slug, to, placement: "footer" });
  };
  return (
    <footer className="hk-footer">
      <div className="hk-footer-inner seo-footer-inner">
        <div className="hk-footer-brand">HouseKit Pro by HotWell.kz</div>
        <nav className="seo-footer-nav" aria-label="Навигация по SEO-разделам">
          <Link to="/" onClick={handleLink("/")}>
            Главная
          </Link>
          <Link to="/sip-house-design-software" onClick={handleLink("/sip-house-design-software")}>
            Проектирование СИП-домов
          </Link>
          <Link to="/sip-panel-calculator" onClick={handleLink("/sip-panel-calculator")}>
            Расчёт СИП-панелей
          </Link>
          <Link to="/reports" onClick={handleLink("/reports")}>
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
  );
}

function SectionCards({ cards }: { readonly cards: ReadonlyArray<SeoArticleCard> }) {
  const cols = cards.length >= 3 ? "cols-3" : "cols-2";
  return (
    <div className={`hk-card-grid ${cols}`}>
      {cards.map((c) => (
        <article key={c.title} className="hk-glass-card">
          <h3>{c.title}</h3>
          <p>{c.body}</p>
        </article>
      ))}
    </div>
  );
}

function SectionSteps({ steps }: { readonly steps: ReadonlyArray<SeoArticleStep> }) {
  return (
    <ol className="seo-steps">
      {steps.map((s) => (
        <li key={s.n} className="seo-steps-item">
          <span className="seo-steps-num" aria-hidden>
            {String(s.n).padStart(2, "0")}
          </span>
          <div className="seo-steps-body">
            <h3>{s.title}</h3>
            {s.body ? <p>{s.body}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function SectionBullets({ bullets }: { readonly bullets: ReadonlyArray<string> }) {
  return (
    <ul className="hk-card-grid cols-2 seo-bullets-list">
      {bullets.map((b) => (
        <li key={b} className="hk-glass-card seo-bullets-item">
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

export function SeoArticlePage(props: SeoArticlePageProps) {
  const {
    slug,
    canonicalPath,
    title,
    description,
    ogImage = DEFAULT_OG_IMAGE,
    breadcrumbName,
    heroHeadline,
    heroLead,
    heroHighlights,
    sections,
    faq,
    relatedLinks,
    finalCtaTitle,
    finalCtaLead,
  } = props;

  const canonicalUrl = `${SITE_ORIGIN}${canonicalPath}`;
  const faqJsonLdId = useId();
  const breadcrumbJsonLdId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);

  useDocumentSeo({
    title,
    description,
    canonical: canonicalUrl,
    robots: "index",
    ogTitle: title,
    ogDescription: description,
    ogImage,
    ogUrl: canonicalUrl,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
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

      <SeoHeader
        slug={slug}
        mobileOpen={mobileOpen}
        onToggle={() => setMobileOpen((o) => !o)}
        onClose={closeMobile}
      />

      <main id="hk-main">
        <div className="hk-main">
          <nav className="seo-breadcrumbs" aria-label="Хлебные крошки">
            <Link
              to="/"
              onClick={() =>
                trackEvent("click_seo_internal_link", {
                  slug,
                  to: "/",
                  placement: "breadcrumbs",
                })
              }
            >
              Главная
            </Link>
            <span aria-hidden>›</span>
            <span aria-current="page">{breadcrumbName}</span>
          </nav>

          <section className="hk-hero seo-hero" aria-labelledby="seo-hero-title">
            <div>
              <h1 id="seo-hero-title">{heroHeadline}</h1>
              <p className="hk-hero-lead">{heroLead}</p>
              <div className="hk-hero-ctas">
                <SeoStartProjectLink
                  className="hk-btn hk-btn-primary hk-btn-lg"
                  slug={slug}
                  placement="hero"
                />
                <SeoDemoLink
                  className="hk-btn hk-btn-ghost hk-btn-lg"
                  slug={slug}
                  placement="hero"
                />
              </div>
            </div>

            {heroHighlights && heroHighlights.length > 0 ? (
              <div className="hk-hero-preview seo-hero-highlights" aria-hidden={false}>
                <ul>
                  {heroHighlights.map((h) => (
                    <li key={h}>
                      <span className="seo-hero-bullet" aria-hidden>
                        ◆
                      </span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <p className="hk-preview-caption">Всё в одной онлайн-программе</p>
              </div>
            ) : null}
          </section>

          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="hk-section"
              aria-labelledby={`${section.id}-title`}
            >
              <h2 id={`${section.id}-title`} className="hk-section-title">
                {section.title}
              </h2>
              {section.lead ? <p className="hk-section-lead">{section.lead}</p> : null}
              {section.cards ? <SectionCards cards={section.cards} /> : null}
              {section.steps ? <SectionSteps steps={section.steps} /> : null}
              {section.bullets ? <SectionBullets bullets={section.bullets} /> : null}
              {section.children}
            </section>
          ))}

          <section className="hk-section" id="faq" aria-labelledby="seo-faq-title">
            <h2 id="seo-faq-title" className="hk-section-title">
              Частые вопросы
            </h2>
            <p className="hk-section-lead">Коротко о ключевых сценариях использования.</p>
            <div className="hk-faq" role="list">
              {faq.map((item, idx) => (
                <details
                  key={item.q}
                  className="hk-faq-item"
                  role="listitem"
                  open={idx === 0}
                  onToggle={(ev) => {
                    if (ev.currentTarget.open) {
                      trackEvent("click_seo_faq_item", { slug, question: item.q });
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
              dangerouslySetInnerHTML={{ __html: buildFaqJsonLd(faq) }}
            />
          </section>

          {relatedLinks.length > 0 ? (
            <section
              className="hk-section"
              id="related"
              aria-labelledby="seo-related-title"
            >
              <h2 id="seo-related-title" className="hk-section-title">
                Связанные возможности
              </h2>
              <p className="hk-section-lead">
                Эти разделы раскрывают соседние задачи в HouseKit Pro.
              </p>
              <div className="hk-card-grid cols-3">
                {relatedLinks.map((r) => (
                  <Link
                    key={r.to}
                    to={r.to}
                    className="hk-glass-card seo-related-card"
                    onClick={() =>
                      trackEvent("click_seo_internal_link", {
                        slug,
                        to: r.to,
                        placement: "related",
                      })
                    }
                  >
                    <h3>{r.title}</h3>
                    <p>{r.body}</p>
                    <span className="seo-related-arrow" aria-hidden>
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="hk-section hk-cta" aria-labelledby="seo-cta-title">
            <h2 id="seo-cta-title">{finalCtaTitle}</h2>
            <p>{finalCtaLead}</p>
            <div className="hk-cta-btns">
              <SeoStartProjectLink
                className="hk-btn hk-btn-primary hk-btn-lg"
                slug={slug}
                placement="final_cta"
              />
              <SeoDemoLink
                className="hk-btn hk-btn-ghost hk-btn-lg"
                slug={slug}
                placement="final_cta"
                label="Открыть демо"
              />
            </div>
          </section>

          <script
            type="application/ld+json"
            id={breadcrumbJsonLdId}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html: buildBreadcrumbJsonLd(canonicalUrl, breadcrumbName),
            }}
          />
        </div>
      </main>

      <SeoFooter slug={slug} />
    </div>
  );
}
