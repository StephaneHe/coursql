import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { Me, ProgressModule } from './types';
import { Login } from './components/Login';
import { ProgressMenu } from './components/ProgressMenu';
import { CardView } from './components/CardView';

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [modules, setModules] = useState<ProgressModule[]>([]);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => setMe(r.user))
      .catch(() => setMe(null))
      .finally(() => setReady(true));
  }, []);

  const loadProgress = useCallback(async (): Promise<ProgressModule[]> => {
    const r = await api.progress();
    setModules(r.modules);
    return r.modules;
  }, []);

  useEffect(() => {
    if (!me) return;
    loadProgress().then((mods) => {
      const flat = mods.flatMap((m) => m.cards);
      const firstActive = flat.find((c) => c.status === 'in_progress' || c.status === 'available');
      setCurrentSlug((cur) => cur ?? firstActive?.slug ?? flat[0]?.slug ?? null);
    });
  }, [me, loadProgress]);

  const titleOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of modules) for (const c of m.cards) map.set(c.slug, c.title);
    return (slug: string) => map.get(slug) ?? slug;
  }, [modules]);

  const onNavigate = useCallback((slug: string) => {
    setCurrentSlug(slug);
    setMenuOpen(false);
  }, []);

  async function logout() {
    await api.logout();
    setMe(null);
    setModules([]);
    setCurrentSlug(null);
  }

  if (!ready) return <div className="app-loading">Chargement…</div>;
  if (!me) return <Login onAuth={(u) => setMe(u)} />;

  return (
    <div className="app">
      <header className="app-bar">
        <button className="menu-toggle" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
          ☰
        </button>
        <span className="brand">coursSQL</span>
        <span className="spacer" />
        <span className="who">👤 {me.display_name}</span>
        <button className="ghost" onClick={logout}>Se déconnecter</button>
      </header>

      <div className="app-body">
        <main className="content">
          {currentSlug ? (
            <CardView
              slug={currentSlug}
              titleOf={titleOf}
              onNavigate={onNavigate}
              onProgressChanged={loadProgress}
            />
          ) : (
            <p>Aucune carte disponible.</p>
          )}
        </main>

        <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
          <ProgressMenu modules={modules} currentSlug={currentSlug} onSelect={onNavigate} />
        </aside>
      </div>
    </div>
  );
}
