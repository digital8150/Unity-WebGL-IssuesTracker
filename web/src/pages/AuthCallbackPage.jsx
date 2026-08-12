import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLocaleNavigate } from '../hooks/useLocaleNavigate.js';
import { getMe } from '../api.js';

const AUTH_RETURN_TARGET_KEY = 'auth.returnTarget';
const UNSAFE_RETURN_PATHS = ['/login', '/auth/callback', '/consent', '/pending'];

function getSafeReturnTarget(value) {
  const candidate = typeof value === 'string' ? value : '';
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return '/';
  }

  try {
    const url = new URL(candidate, window.location.origin);
    if (url.origin !== window.location.origin) return '/';
    const path = url.pathname.replace(/\/$/, '') || '/';
    if (UNSAFE_RETURN_PATHS.some((unsafePath) => path === unsafePath || path.startsWith(`${unsafePath}/`))) {
      return '/';
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

function readReturnTarget() {
  try {
    return getSafeReturnTarget(window.sessionStorage.getItem(AUTH_RETURN_TARGET_KEY));
  } catch {
    return '/';
  }
}

function clearReturnTarget() {
  try {
    window.sessionStorage.removeItem(AUTH_RETURN_TARGET_KEY);
  } catch {
    // Ignore storage errors; navigation can still complete.
  }
}

export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const { login } = useAuth();
  const navigate = useLocaleNavigate();

  useEffect(() => {
    const token = params.get('token');
    const error = params.get('error');
    const returnTarget = readReturnTarget();
    const provider = error?.startsWith('discord') ? 'discord' : 'github';

    if (error || !token) {
      navigate(`/login?error=${provider}`, { replace: true });
      return;
    }

    let cancelled = false;
    getMe(token)
      .then(({ user }) => {
        if (cancelled) return;
        login(token, user);
        clearReturnTarget();
        if (!user.ageConfirmedAt) {
          navigate('/consent', { replace: true, state: { from: returnTarget } });
        } else {
          navigate(user.status === 'approved' ? '/dashboard' : returnTarget, { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) navigate(`/login?error=${provider}`, { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [login, navigate, params]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#aaa' }}>
      Signing you in…
    </div>
  );
}
