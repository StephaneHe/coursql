import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Me } from '../types';

interface LoginProps {
  onAuth: (me: Me) => void;
}

// Home page = account picker. Each existing profile is a small clickable card; clicking it
// opens that profile's session (by name, no password — see DESIGN §7). A "+ Nouveau profil"
// card reveals a field to create a new profile.
export function Login({ onAuth }: LoginProps) {
  const [accounts, setAccounts] = useState<Me[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    api
      .accounts()
      .then((r) => setAccounts(r.accounts))
      .catch(() => setAccounts([]));
  }, []);

  async function pick(displayName: string) {
    setError(null);
    setBusy(true);
    try {
      const me = await api.login(displayName);
      onAuth(me);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function create() {
    setError(null);
    setBusy(true);
    try {
      const me = await api.createUser(name);
      onAuth(me);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="home">
      <h1>coursSQL</h1>
      <p className="subtitle">Apprendre le SQL pas à pas, à ton rythme.</p>

      <h2 className="home-section">Qui es-tu ?</h2>

      <div className="account-grid">
        {(accounts ?? []).map((a) => (
          <button
            key={a.user_id}
            className="account-card"
            disabled={busy}
            onClick={() => pick(a.display_name)}
          >
            <span className="account-avatar" aria-hidden="true">
              {a.display_name.slice(0, 1).toUpperCase()}
            </span>
            <span className="account-name">{a.display_name}</span>
          </button>
        ))}

        {!creating && (
          <button className="account-card account-new" disabled={busy} onClick={() => setCreating(true)}>
            <span className="account-avatar" aria-hidden="true">＋</span>
            <span className="account-name">Nouveau profil</span>
          </button>
        )}
      </div>

      {accounts !== null && accounts.length === 0 && !creating && (
        <p className="muted">Aucun profil pour l'instant — crée le premier ci-dessus.</p>
      )}

      {creating && (
        <div className="create-box">
          <label htmlFor="name">Ton prénom ou pseudo</label>
          <input
            id="name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex. Camille"
            maxLength={40}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) create();
            }}
          />
          <div className="create-actions">
            <button className="run" disabled={busy || !name.trim()} onClick={create}>
              Créer mon profil
            </button>
            <button className="ghost" disabled={busy} onClick={() => { setCreating(false); setName(''); }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {error && <p className="error-text" role="alert">{error}</p>}

      <p className="notice">
        ℹ️ Il n'y a pas de mot de passe : toute personne qui voit un nom peut ouvrir ce profil.
        C'est prévu pour un usage personnel, familial ou scolaire de confiance.
      </p>
    </div>
  );
}
