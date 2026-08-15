import { useState } from 'react';
import { api } from '../api';
import type { Me } from '../types';

interface LoginProps {
  onAuth: (me: Me) => void;
}

export function Login({ onAuth }: LoginProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(mode: 'create' | 'login') {
    setError(null);
    setBusy(true);
    try {
      const me = mode === 'create' ? await api.createUser(name) : await api.login(name);
      onAuth(me);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <h1>coursSQL</h1>
      <p className="subtitle">Apprendre le SQL pas à pas, à ton rythme.</p>

      <label htmlFor="name">Ton prénom ou pseudo</label>
      <input
        id="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="ex. Camille"
        maxLength={40}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) submit('login');
        }}
      />

      <div className="login-actions">
        <button disabled={busy || !name.trim()} onClick={() => submit('create')}>
          Créer mon profil
        </button>
        <button className="secondary" disabled={busy || !name.trim()} onClick={() => submit('login')}>
          Me reconnecter
        </button>
      </div>

      {error && <p className="error-text" role="alert">{error}</p>}

      <p className="notice">
        ℹ️ Il n'y a pas de mot de passe : toute personne qui connaît ce nom peut ouvrir ce profil.
        C'est prévu pour un usage personnel, familial ou scolaire de confiance.
      </p>
    </div>
  );
}
