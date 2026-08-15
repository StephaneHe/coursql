import { appPool } from './db';
import { orderedCards } from './content/cards';

// Progress is carried by the CARD. Gating rule (DESIGN §12.2.b): a card unlocks only when the
// previous card (by position) is validated. Validated cards stay freely navigable. The rule is
// benevolent: unlimited attempts, no lockout, hints/solution free (solution_viewed != validated).

export type CardStatus = 'locked' | 'available' | 'in_progress' | 'validated' | 'validated_after_hint';

export interface ProgressRow {
  card_slug: string;
  status: string;
  hint_used: number;
  solution_viewed: number;
  attempts_count: number;
}

export interface ComputedCard {
  slug: string;
  status: CardStatus;
  hint_used: boolean;
  solution_viewed: boolean;
  attempts_count: number;
}

export function isValidated(status?: string): boolean {
  return status === 'validated' || status === 'validated_after_hint';
}

export async function getProgressMap(userId: string): Promise<Record<string, ProgressRow>> {
  const [rows] = await appPool.execute(
    'SELECT card_slug, status, hint_used, solution_viewed, attempts_count FROM user_progress WHERE user_id = ?',
    [userId],
  );
  const map: Record<string, ProgressRow> = {};
  for (const r of rows as ProgressRow[]) map[r.card_slug] = r;
  return map;
}

export function computeStatuses(progress: Record<string, ProgressRow>): ComputedCard[] {
  const result: ComputedCard[] = [];
  let prevValidated = true; // the first card is always available
  for (const c of orderedCards()) {
    const p = progress[c.slug];
    let status: CardStatus;
    if (p && isValidated(p.status)) {
      status = p.status as CardStatus;
    } else if (prevValidated) {
      status = p && p.status === 'in_progress' ? 'in_progress' : 'available';
    } else {
      status = 'locked';
    }
    result.push({
      slug: c.slug,
      status,
      hint_used: !!(p && p.hint_used),
      solution_viewed: !!(p && p.solution_viewed),
      attempts_count: p ? p.attempts_count : 0,
    });
    prevValidated = isValidated(status);
  }
  return result;
}

export async function statusOf(userId: string, cardSlug: string): Promise<CardStatus> {
  const map = await getProgressMap(userId);
  const found = computeStatuses(map).find((c) => c.slug === cardSlug);
  return found ? found.status : 'locked';
}

async function ensureRow(userId: string, cardSlug: string): Promise<void> {
  await appPool.execute(
    "INSERT IGNORE INTO user_progress (user_id, card_slug, status) VALUES (?, ?, 'in_progress')",
    [userId, cardSlug],
  );
}

export async function recordAttempt(
  userId: string,
  cardSlug: string,
  exerciseSlug: string,
  submittedSql: string,
  outcome: 'pass' | 'fail' | 'error' | 'timeout' | 'blocked',
  durationMs: number | null,
  errorCategory: string | null,
): Promise<void> {
  await appPool.execute(
    `INSERT INTO exercise_attempts
       (user_id, card_slug, exercise_slug, submitted_sql, outcome, duration_ms, error_category, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [userId, cardSlug, exerciseSlug, submittedSql, outcome, durationMs, errorCategory],
  );
  await ensureRow(userId, cardSlug);
  // Attempts are counted for information only; they never limit access.
  await appPool.execute(
    `UPDATE user_progress
        SET attempts_count = attempts_count + 1,
            last_attempt_at = NOW(),
            status = CASE WHEN status IN ('validated','validated_after_hint') THEN status ELSE 'in_progress' END
      WHERE user_id = ? AND card_slug = ?`,
    [userId, cardSlug],
  );
}

export async function markHintUsed(userId: string, cardSlug: string): Promise<void> {
  await ensureRow(userId, cardSlug);
  await appPool.execute(
    'UPDATE user_progress SET hint_used = 1 WHERE user_id = ? AND card_slug = ?',
    [userId, cardSlug],
  );
}

export async function markSolutionViewed(userId: string, cardSlug: string): Promise<void> {
  await ensureRow(userId, cardSlug);
  // Viewing the solution NEVER validates the card.
  await appPool.execute(
    'UPDATE user_progress SET solution_viewed = 1 WHERE user_id = ? AND card_slug = ?',
    [userId, cardSlug],
  );
}

// Mark a card as validated after a successful gating attempt. Reflects whether a hint was used.
export async function validateCard(userId: string, cardSlug: string): Promise<void> {
  await ensureRow(userId, cardSlug);
  await appPool.execute(
    `UPDATE user_progress
        SET status = CASE WHEN hint_used = 1 THEN 'validated_after_hint' ELSE 'validated' END,
            first_validated_at = COALESCE(first_validated_at, NOW())
      WHERE user_id = ? AND card_slug = ?`,
    [userId, cardSlug],
  );
}
