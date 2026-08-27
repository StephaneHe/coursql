import { useState } from 'react';
import { api } from '../api';

interface ChangePasswordProps {
  onClose: () => void;
}

// Modal to change the current profile's password. Requires the current password.
export function ChangePassword({ onClose }: ChangePasswordProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    if (next !== confirm) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span>Changer le mot de passe</span>
          <button className="drawer-close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        {done ? (
          <div className="create-box">
            <p>Mot de passe mis à jour. ✔</p>
            <div className="create-actions">
              <button className="run" onClick={onClose}>Fermer</button>
            </div>
          </div>
        ) : (
          <div className="create-box">
            <label htmlFor="cur">Mot de passe actuel</label>
            <input
              id="cur"
              type="password"
              autoFocus
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              maxLength={128}
            />
            <label htmlFor="new">Nouveau mot de passe</label>
            <input
              id="new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="au moins 4 caractères"
              autoComplete="new-password"
              maxLength={128}
            />
            <label htmlFor="confirm">Confirme le nouveau mot de passe</label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              maxLength={128}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && current && next && confirm) submit();
              }}
            />
            <div className="create-actions">
              <button
                className="run"
                disabled={busy || !current || !next || !confirm}
                onClick={submit}
              >
                Mettre à jour
              </button>
              <button className="ghost" disabled={busy} onClick={onClose}>Annuler</button>
            </div>
          </div>
        )}

        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </div>
  );
}
