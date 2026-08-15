import crypto from 'crypto';
import { appPool } from './db';

// Lightweight identification WITHOUT a password (DESIGN §7): this is NOT secure authentication.
// Anyone who knows the display name can access the profile. Suitable for a trusted
// personal/family/school/demo environment; PIN/login-link is a post-MVP evolution.

export interface SessionUser {
  id: string;
  display_name: string;
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isValidDisplayName(name: string): boolean {
  const n = name.trim();
  return n.length >= 1 && n.length <= 40;
}

export async function createUser(displayName: string): Promise<SessionUser> {
  const id = crypto.randomUUID();
  const trimmed = displayName.trim();
  await appPool.execute(
    'INSERT INTO users (id, display_name, name_normalized, created_at) VALUES (?, ?, ?, NOW())',
    [id, trimmed, normalizeName(displayName)],
  );
  return { id, display_name: trimmed };
}

export async function findUserByName(displayName: string): Promise<SessionUser | null> {
  const [rows] = await appPool.execute(
    'SELECT id, display_name FROM users WHERE name_normalized = ?',
    [normalizeName(displayName)],
  );
  const list = rows as Array<{ id: string; display_name: string }>;
  return list.length ? { id: list[0].id, display_name: list[0].display_name } : null;
}

export async function createSession(userId: string): Promise<string> {
  const sid = crypto.randomBytes(32).toString('hex');
  await appPool.execute(
    'INSERT INTO user_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY))',
    [sid, userId],
  );
  await appPool.execute('UPDATE users SET last_active_at = NOW() WHERE id = ?', [userId]);
  return sid;
}

export async function getSessionUser(sid: string): Promise<SessionUser | null> {
  const [rows] = await appPool.execute(
    `SELECT u.id, u.display_name
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [sid],
  );
  const list = rows as Array<{ id: string; display_name: string }>;
  return list.length ? { id: list[0].id, display_name: list[0].display_name } : null;
}

export async function revokeSession(sid: string): Promise<void> {
  await appPool.execute('UPDATE user_sessions SET revoked_at = NOW() WHERE id = ?', [sid]);
}
