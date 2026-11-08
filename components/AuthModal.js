'use client';

import { useEffect, useState } from 'react';
import { supabase, googleLoginEnabled } from '@/lib/supabase';

const TRANSLATE = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  'User already registered': 'Já existe uma conta com esse e-mail. Use "Entrar".',
  'Password should be at least 6 characters.': 'A senha precisa ter pelo menos 6 caracteres.',
};
const t = (msg = '') =>
  TRANSLATE[msg] ||
  (/fetch|network|load failed/i.test(msg) ? 'Não consegui conectar ao servidor de login. Tente de novo.' : msg);

/**
 * Modal de login/cadastro.
 * mode: 'login' | 'signup' | 'forgot' | 'reset' (definir nova senha após link de recuperação)
 */
export default function AuthModal({ initialMode = 'login', onClose }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function switchMode(m) {
    setMode(m);
    setError('');
    setInfo('');
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    const redirectTo = window.location.origin;
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose();
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        if (data.session) onClose();
        else setInfo('Conta criada! Abra o link que enviamos para ' + email + ' para confirmar e depois entre.');
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        setInfo('Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha.');
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        onClose();
      }
    } catch (err) {
      setError(t(err.message));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(t(error.message));
  }

  const titles = {
    login: 'Entrar',
    signup: 'Criar conta',
    forgot: 'Recuperar senha',
    reset: 'Definir nova senha',
  };
  const buttons = {
    login: 'Entrar',
    signup: 'Criar conta',
    forgot: 'Enviar link',
    reset: 'Salvar nova senha',
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="auth-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titles[mode]}>
        <button className="auth-close" onClick={onClose} aria-label="Fechar">×</button>
        <h2>{titles[mode]}</h2>
        {(mode === 'login' || mode === 'signup') && (
          <p className="auth-sub">Seus canais ficam salvos na conta e aparecem em qualquer dispositivo.</p>
        )}

        {googleLoginEnabled && (mode === 'login' || mode === 'signup') && (
          <>
            <button type="button" className="btn auth-google" onClick={google}>
              <span className="g-mark" aria-hidden>G</span> Continuar com Google
            </button>
            <div className="auth-divider"><span>ou</span></div>
          </>
        )}

        <form onSubmit={submit} className="auth-form">
          {mode !== 'reset' && (
            <label>
              E-mail
              <input
                className="auth-input"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {mode !== 'forgot' && (
            <label>
              {mode === 'reset' ? 'Nova senha' : 'Senha'}
              <input
                className="auth-input"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}

          {error && <div className="auth-error">{error}</div>}
          {info && <div className="auth-info">{info}</div>}

          <button className="btn btn-primary auth-submit" disabled={busy}>
            {busy ? 'Aguarde…' : buttons[mode]}
          </button>
        </form>

        <div className="auth-links">
          {mode === 'login' && (
            <>
              <button type="button" onClick={() => switchMode('forgot')}>Esqueci a senha</button>
              <span>Não tem conta? <button type="button" onClick={() => switchMode('signup')}>Criar conta</button></span>
            </>
          )}
          {mode === 'signup' && (
            <span>Já tem conta? <button type="button" onClick={() => switchMode('login')}>Entrar</button></span>
          )}
          {mode === 'forgot' && (
            <button type="button" onClick={() => switchMode('login')}>Voltar para entrar</button>
          )}
        </div>
      </div>
    </div>
  );
}
