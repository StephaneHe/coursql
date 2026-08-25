import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ExecuteResponse, PublicCard, CardStatus } from '../types';
import { DataTable } from './DataTable';

interface CardViewProps {
  slug: string;
  titleOf: (slug: string) => string;
  onNavigate: (slug: string) => void;
  onProgressChanged: () => void;
}

export function CardView({ slug, titleOf, onNavigate, onProgressChanged }: CardViewProps) {
  const [card, setCard] = useState<PublicCard | null>(null);
  const [status, setStatus] = useState<CardStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sql, setSql] = useState('');
  const [choice, setChoice] = useState<number | null>(null);
  const [result, setResult] = useState<ExecuteResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const [hints, setHints] = useState<string[]>([]);
  const [solution, setSolution] = useState<{ sql: string | null; explanation: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setCard(null);
    setLoadError(null);
    setSql('');
    setChoice(null);
    setResult(null);
    setHints([]);
    setSolution(null);
    api
      .card(slug)
      .then((r) => {
        if (!alive) return;
        setCard(r.card);
        setStatus(r.status);
      })
      .catch((e) => alive && setLoadError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [slug]);

  if (loadError) return <div className="card-view"><p className="error-text">{loadError}</p></div>;
  if (!card) return <div className="card-view"><p>Chargement…</p></div>;

  const isQuiz = card.gating.kind === 'quiz';

  async function run() {
    if (!card) return;
    setBusy(true);
    setResult(null);
    try {
      const res = isQuiz
        ? await api.executeQuiz(card.slug, choice ?? -1)
        : await api.executeSql(card.slug, sql);
      setResult(res);
      if (res.card_validated) onProgressChanged();
    } catch (e) {
      setResult({ status: 'error', kind: isQuiz ? 'quiz' : card.gating.kind, messageFr: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function revealHint() {
    if (!card) return;
    try {
      const r = await api.hint(card.slug, hints.length);
      setHints((h) => [...h, r.hint_fr]);
      onProgressChanged();
    } catch {
      /* no more hints */
    }
  }

  async function showSolution() {
    if (!card) return;
    const r = await api.solution(card.slug);
    setSolution({ sql: r.solution_sql, explanation: r.explanation_fr });
    onProgressChanged();
  }

  async function reset() {
    if (!card) return;
    setBusy(true);
    try {
      await api.reset(card.slug);
      setSql('');
      setChoice(null);
      setResult(null);
    } catch (e) {
      setResult({ status: 'error', kind: card.gating.kind, messageFr: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-view">
      {/* 0. Prerequisites (informational, non-blocking) */}
      {card.prerequisites.length > 0 && (
        <div className="prereq" aria-label="Prérequis">
          <span className="prereq-label">Prérequis :</span>
          {card.prerequisites.map((p) => (
            <button key={p} className="prereq-link" onClick={() => onNavigate(p)}>
              {p} · {titleOf(p)}
            </button>
          ))}
          <span className="prereq-note">(pour information — non bloquant)</span>
        </div>
      )}

      {/* 1. Title + notion */}
      <header className="card-head">
        <span className="card-module">{card.moduleTitle}</span>
        <h2>{card.title}</h2>
        {status && <span className="card-status-pill">{status.replace('_', ' ')}</span>}
      </header>

      {/* 2. Explanation */}
      <p className="explanation">{card.explanationFr}</p>

      {/* 3. Example + result note */}
      {card.exampleSql && (
        <div className="example">
          <div className="example-label">Exemple</div>
          <pre className="code">{card.exampleSql}</pre>
          {card.exampleResultFr && <p className="example-note">{card.exampleResultFr}</p>}
        </div>
      )}

      {/* Schema + initial data */}
      {card.tables.map((t) => (
        <div key={t.name} className="schema">
          <div className="schema-title">
            Table <code>{t.name}</code>
          </div>
          <div className="schema-cols">
            {t.columns.map((c) => (
              <span key={c.name} className="col-chip">
                <b>{c.name}</b> <em>{c.type}</em>
                {c.pk ? ' 🔑' : ''}
                {c.note ? ` — ${c.note}` : ''}
              </span>
            ))}
          </div>
          {t.sampleRows && <DataTable columns={t.columns.map((c) => c.name)} rows={t.sampleRows} />}
        </div>
      ))}

      {/* 4. Exercise (gating) */}
      <section className="exercise">
        <div className="statement">
          <b>À toi de jouer :</b> {card.statementFr}
        </div>

        {isQuiz ? (
          <div className="quiz">
            <p className="quiz-question">{card.gating.questionFr}</p>
            {card.gating.options?.map((opt, i) => (
              <label key={i} className={`quiz-option ${choice === i ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="quiz"
                  checked={choice === i}
                  onChange={() => setChoice(i)}
                />
                {opt}
              </label>
            ))}
          </div>
        ) : (
          <textarea
            className="sql-editor"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder="Écris ta requête SQL ici, puis clique sur Exécuter."
            spellCheck={false}
            rows={4}
          />
        )}

        <div className="actions">
          <button className="run" disabled={busy || (isQuiz && choice === null)} onClick={run}>
            {isQuiz ? 'Valider ma réponse' : 'Exécuter'}
          </button>
          <button className="secondary" onClick={revealHint} disabled={hints.length >= card.gating.hintCount}>
            Indice {card.gating.hintCount > 0 ? `(${hints.length}/${card.gating.hintCount})` : ''}
          </button>
          <button className="secondary" onClick={showSolution}>Voir la solution</button>
          <button className="ghost" disabled={busy} onClick={() => void reset()}>Réinitialiser</button>
        </div>

        {/* Hints */}
        {hints.length > 0 && (
          <ul className="hints">
            {hints.map((h, i) => (
              <li key={i}>💡 {h}</li>
            ))}
          </ul>
        )}

        {/* 5. Result OR error (never both) */}
        {result && (
          <div className={`result result-${result.status}`} role="status">
            <div className="result-msg">
              {result.status === 'pass' && '✅ '}
              {result.status === 'fail' && '❌ '}
              {(result.status === 'error' || result.status === 'timeout') && '⚠️ '}
              {result.messageFr}
            </div>
            {result.status !== 'error' && result.status !== 'timeout' && result.columns && (
              <DataTable columns={result.columns} rows={result.rows ?? []} />
            )}
            {result.truncated && <p className="truncated">Résultat tronqué (trop de lignes).</p>}
            {result.card_validated && result.next_card_slug && (
              <button className="run next" onClick={() => onNavigate(result.next_card_slug!)}>
                Carte suivante →
              </button>
            )}
          </div>
        )}

        {/* 6. Solution (revealed on demand — viewing it does NOT validate) */}
        {solution && (
          <div className="solution">
            <div className="solution-label">Solution</div>
            {solution.sql && <pre className="code">{solution.sql}</pre>}
            <p>{solution.explanation}</p>
            <p className="solution-note">Consulter la solution ne valide pas la carte : réussis l'exercice pour continuer.</p>
          </div>
        )}
      </section>
    </div>
  );
}
