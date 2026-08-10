import React from 'react';
import { useParams } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo.jsx';
import PageLink from '../components/PageLink.jsx';
import { PRIVACY_POLICY_VERSIONS } from '../data/privacyPolicyVersions.jsx';
import { useDocumentMeta } from '../hooks/useDocumentMeta.js';
import './PrivacyPolicyPage.css';

export default function PrivacyPolicyPage() {
  const { date } = useParams();
  const latest = PRIVACY_POLICY_VERSIONS[0];
  const current = date
    ? PRIVACY_POLICY_VERSIONS.find((v) => v.effectiveDate === date) || latest
    : latest;
  const isPast = current.effectiveDate !== latest.effectiveDate;

  useDocumentMeta({
    title: '개인정보처리방침 — BCSDLab. Arcade',
    description: 'BCSDLab. Arcade 개인정보처리방침입니다.',
    url: `${window.location.origin}${date ? `/privacy/${date}` : '/privacy'}`,
    type: 'website',
  });

  return (
    <div className="pp-page">
      <nav className="pp-nav">
        <PageLink to="/" className="pp-logo"><BrandLogo size="md" /></PageLink>
        <PageLink to="/" className="pp-back">← 홈으로</PageLink>
      </nav>

      <article className="pp-article">
        <h1>개인정보처리방침</h1>
        <p className="pp-effective">시행일자: {current.effectiveDate}</p>

        {isPast && (
          <p className="pp-history-notice">
            이 문서는 과거에 시행되었던 버전입니다.{' '}
            <PageLink to="/privacy">최신 개인정보처리방침 보기 →</PageLink>
          </p>
        )}

        {current.body}

        {PRIVACY_POLICY_VERSIONS.length > 1 && (
          <>
            <h2>이전 버전</h2>
            <ul className="pp-history-list">
              {PRIVACY_POLICY_VERSIONS.filter((v) => v.effectiveDate !== current.effectiveDate).map((v) => (
                <li key={v.effectiveDate}>
                  <PageLink to={`/privacy/${v.effectiveDate}`}>{v.effectiveDate} 시행본</PageLink>
                </li>
              ))}
            </ul>
          </>
        )}
      </article>
    </div>
  );
}
