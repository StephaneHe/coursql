import { useState } from 'react';
import { api } from '../api';
import type { Me } from '../types';

interface LoginProps {
  onAuth: (me: Me) => void;
}

// Home page = name + password. Profiles are no longer listed before authentication
// (anti-enumeration), and a profile can only be opened with its password.
export function Login({ onAuth }: LoginProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !password) return;
    setError(null);
    setBusy(true);
    try {
      const me =
        mode === 'login'
          ? await api.login(name, password)
          : await api.createUser(name, password);
      onAuth(me);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next);
    setError(null);
    setPassword('');
  }

  return (
    <div className="home">
      <h1>coursSQL</h1>
      <p className="subtitle">Apprendre le SQL pas à pas, à ton rythme.</p>

      <div className="auth-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'login'}
          className={mode === 'login' ? 'auth-tab active' : 'auth-tab'}
          onClick={() => switchMode('login')}
        >
          Se connecter
        </button>
        <button
          role="tab"
          aria-selected={mode === 'register'}
          className={mode === 'register' ? 'auth-tab active' : 'auth-tab'}
          onClick={() => switchMode('register')}
        >
          Créer un profil
        </button>
      </div>

      <div className="create-box">
        <label htmlFor="name">Ton prénom ou pseudo</label>
        <input
          id="name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex. Camille"
          maxLength={40}
          autoComplete="username"
        />

        <label htmlFor="password">Mot de passe</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'register' ? 'au moins 4 caractères' : 'ton mot de passe'}
          maxLength={128}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim() && password) submit();
          }}
        />

        <div className="create-actions">
          <button className="run" disabled={busy || !name.trim() || !password} onClick={submit}>
            {mode === 'login' ? 'Se connecter' : 'Créer mon profil'}
          </button>
        </div>

        {mode === 'register' && (
          <p className="muted">Choisis un mot de passe : il te servira à retrouver ta progression.</p>
        )}
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
