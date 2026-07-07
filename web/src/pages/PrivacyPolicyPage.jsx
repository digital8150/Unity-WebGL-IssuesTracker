import React from 'react';
import { Link, useParams } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo.jsx';
import { PRIVACY_POLICY_VERSIONS } from '../data/privacyPolicyVersions.jsx';
import './PrivacyPolicyPage.css';

export default function PrivacyPolicyPage() {
  const { date } = useParams();
  const latest = PRIVACY_POLICY_VERSIONS[0];
  const current = date
    ? PRIVACY_POLICY_VERSIONS.find((v) => v.effectiveDate === date) || latest
    : latest;
  const isPast = current.effectiveDate !== latest.effectiveDate;

  return (
    <div className="pp-page">
      <nav className="pp-nav">
        <Link to="/" className="pp-logo"><BrandLogo size="md" /></Link>
        <Link to="/" className="pp-back">← 홈으로</Link>
      </nav>

      <article className="pp-article">
        <h1>개인정보처리방침</h1>
        <p className="pp-effective">시행일자: {current.effectiveDate}</p>

        {isPast && (
          <p className="pp-history-notice">
            이 문서는 과거에 시행되었던 버전입니다.{' '}
            <Link to="/privacy">최신 개인정보처리방침 보기 →</Link>
          </p>
        )}

        {current.body}

        {PRIVACY_POLICY_VERSIONS.length > 1 && (
          <>
            <h2>이전 버전</h2>
            <ul className="pp-history-list">
              {PRIVACY_POLICY_VERSIONS.filter((v) => v.effectiveDate !== current.effectiveDate).map((v) => (
                <li key={v.effectiveDate}>
                  <Link to={`/privacy/${v.effectiveDate}`}>{v.effectiveDate} 시행본</Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </article>
    </div>
  );
}
