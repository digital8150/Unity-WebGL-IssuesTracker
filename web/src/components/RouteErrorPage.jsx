import BrandLogo from './BrandLogo.jsx';
import { useI18n } from '../i18n.jsx';
import './RouteErrorPage.css';

const copy = {
  en: {
    eyebrow: 'TEMPORARY ERROR',
    title: 'Something went wrong',
    description: 'We could not load this page. Refresh and try again.',
    refresh: 'Refresh page',
    home: 'Go to home',
    loading: 'Loading page',
  },
  ko: {
    eyebrow: 'TEMPORARY ERROR',
    title: '앗, 문제가 발생했습니다',
    description: '페이지를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.',
    refresh: '새로고침',
    home: '홈으로 이동',
    loading: '페이지를 불러오는 중',
  },
};

function ErrorMark() {
  return (
    <div className="route-error-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" role="presentation">
        <path d="M16 9.5v7.75" />
        <circle cx="16" cy="22" r="1" />
      </svg>
    </div>
  );
}

export function RouteHydrateFallback() {
  const { lang } = useI18n();
  const text = copy[lang];

  return (
    <main className="route-loading-page" aria-label={text.loading} aria-busy="true">
      <BrandLogo size="md" />
      <span className="route-loading-indicator" aria-hidden="true" />
    </main>
  );
}

export default function RouteErrorPage() {
  const { lang } = useI18n();
  const text = copy[lang];
  const homeHref = lang === 'en' ? '/en' : '/';

  return (
    <main className="route-error-page">
      <a className="route-error-brand" href={homeHref} aria-label="BCSDLab. Arcade">
        <BrandLogo size="md" />
      </a>

      <section className="route-error-card" aria-labelledby="route-error-title">
        <ErrorMark />
        <p className="route-error-eyebrow">{text.eyebrow}</p>
        <h1 id="route-error-title">{text.title}</h1>
        <p className="route-error-description">{text.description}</p>
        <div className="route-error-actions">
          <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 11a8 8 0 1 0-2.34 5.66" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M20 5v6h-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {text.refresh}
          </button>
          <a className="btn btn-secondary" href={homeHref}>{text.home}</a>
        </div>
      </section>
    </main>
  );
}
