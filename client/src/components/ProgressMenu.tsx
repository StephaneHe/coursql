import type { ProgressModule } from '../types';
import { STATUS_META } from '../statusMeta';

interface ProgressMenuProps {
  modules: ProgressModule[];
  currentSlug: string | null;
  onSelect: (slug: string) => void;
}

// Right-hand progression menu: Module > Card. Locked cards are not clickable; validated cards
// stay freely navigable.
export function ProgressMenu({ modules, currentSlug, onSelect }: ProgressMenuProps) {
  return (
    <nav className="progress-menu" aria-label="Progression">
      {modules.map((m) => (
        <div key={m.moduleSlug} className="menu-module">
          <h3>{m.moduleTitle}</h3>
          <ul>
            {m.cards.map((c) => {
              const meta = STATUS_META[c.status];
              const locked = c.status === 'locked';
              return (
                <li key={c.slug}>
                  <button
                    className={`menu-card ${meta.cls} ${currentSlug === c.slug ? 'current' : ''}`}
                    disabled={locked}
                    onClick={() => onSelect(c.slug)}
                    aria-current={currentSlug === c.slug ? 'true' : undefined}
                    title={meta.label}
                  >
                    <span className="menu-icon" aria-hidden="true">{meta.icon}</span>
                    <span className="menu-title">{c.title}</span>
                    <span className="menu-status">{meta.label}</span>
                    {c.solution_viewed && <span className="menu-badge" title="Solution consultée">👁</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
