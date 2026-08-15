import type { CardStatus } from './types';

// Accessibility (DESIGN §12.2.b): never color alone — always color + icon + label.
export const STATUS_META: Record<CardStatus, { label: string; icon: string; cls: string }> = {
  locked: { label: 'Verrouillé', icon: '🔒', cls: 'st-locked' },
  available: { label: 'À faire', icon: '▶', cls: 'st-available' },
  in_progress: { label: 'Commencé', icon: '✎', cls: 'st-progress' },
  validated: { label: 'Validé', icon: '✔', cls: 'st-validated' },
  validated_after_hint: { label: 'Validé (avec indice)', icon: '✔', cls: 'st-validated' },
};
