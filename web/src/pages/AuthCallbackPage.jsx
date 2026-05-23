import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getMe } from '../api.js';

export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    const error = params.get('error');

    if (error || !token) {
      navigate('/login?error=github', { replace: true });
      return;
    }

    getMe(token)
      .then(({ user }) => {
        login(token, user);
        navigate(user.status === 'approved' ? '/dashboard' : '/pending', { replace: true });
      })
      .catch(() => navigate('/login?error=github', { replace: true }));
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#aaa' }}>
      Signing you in…
    </div>
  );
}
