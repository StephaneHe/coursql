import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { pingDatabases } from './db';
import {
  SessionUser,
  createSession,
  createUser,
  findUserByName,
  getSessionUser,
  isValidDisplayName,
  listAccounts,
  revokeSession,
} from './session';
import {
  computeStatuses,
  getProgressMap,
  markHintUsed,
  markSolutionViewed,
  recordAttempt,
  statusOf,
  validateCard,
} from './progress';
import { assertAuthoringRules, getCard, nextCardSlug, orderedCards, toPublicCard } from './content/cards';
import { compareResult } from './lib/compare';
import { mapSqlError } from './lib/sqlErrors';
import { preflightSql, runReadOnly } from './lib/execute';
import { resetMutation, runMutation } from './lib/mutate';

const COOKIE = 'coursql_sid';

// Small async wrapper so thrown errors reach the error handler.
const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sid?: string;
    }
  }
}

async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const sid = req.signedCookies?.[COOKIE] as string | undefined;
    if (sid) {
      const user = await getSessionUser(sid);
      if (user) {
        req.user = user;
        req.sid = sid;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'not_authenticated', messageFr: 'Identifie-toi pour continuer.' });
    return;
  }
  next();
}

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser(config.sessionSecret));
  app.use(attachUser);

  app.get('/api/health', wrap(async (_req, res) => {
    res.json({ ok: true, version: '1.8.0' });
  }));

  // --- Identification & sessions ---
  // Public: list existing profiles for the account-picker home page (no secrets).
  app.get('/api/accounts', wrap(async (_req, res) => {
    const accounts = await listAccounts();
    res.json({ accounts: accounts.map((a) => ({ user_id: a.id, display_name: a.display_name })) });
  }));

  app.post('/api/users', wrap(async (req, res) => {
    const displayName = String(req.body?.display_name ?? '');
    if (!isValidDisplayName(displayName)) {
      res.status(400).json({ error: 'invalid_name', messageFr: 'Choisis un nom entre 1 et 40 caractères.' });
      return;
    }
    if (await findUserByName(displayName)) {
      res.status(409).json({ error: 'name_taken', messageFr: 'Ce nom est déjà utilisé. Choisis-en un autre ou reconnecte-toi.' });
      return;
    }
    const user = await createUser(displayName);
    const sid = await createSession(user.id);
    setSessionCookie(res, sid);
    res.status(201).json({ user_id: user.id, display_name: user.display_name });
  }));

  app.post('/api/sessions', wrap(async (req, res) => {
    const displayName = String(req.body?.display_name ?? '');
    const user = await findUserByName(displayName);
    if (!user) {
      res.status(404).json({ error: 'unknown_user', messageFr: "Aucun profil à ce nom. Crée-en un nouveau." });
      return;
    }
    const sid = await createSession(user.id);
    setSessionCookie(res, sid);
    res.json({ user_id: user.id, display_name: user.display_name });
  }));

  app.get('/api/me', wrap(async (req, res) => {
    if (!req.user) {
      res.json({ user: null });
      return;
    }
    res.json({ user: { user_id: req.user.id, display_name: req.user.display_name } });
  }));

  app.delete('/api/sessions/current', wrap(async (req, res) => {
    if (req.sid) await revokeSession(req.sid);
    res.clearCookie(COOKIE);
    res.status(204).end();
  }));

  // --- Progression ---
  app.get('/api/progress', requireUser, wrap(async (req, res) => {
    const map = await getProgressMap(req.user!.id);
    const computed = computeStatuses(map);
    const byModule = new Map<string, { moduleSlug: string; moduleTitle: string; cards: unknown[] }>();
    for (const card of orderedCards()) {
      const st = computed.find((c) => c.slug === card.slug)!;
      if (!byModule.has(card.moduleSlug)) {
        byModule.set(card.moduleSlug, { moduleSlug: card.moduleSlug, moduleTitle: card.moduleTitle, cards: [] });
      }
      byModule.get(card.moduleSlug)!.cards.push({
        slug: card.slug,
        title: card.title,
        status: st.status,
        hint_used: st.hint_used,
        solution_viewed: st.solution_viewed,
      });
    }
    res.json({ modules: [...byModule.values()] });
  }));

  // --- Card content (no solution / expected leaked) ---
  app.get('/api/cards/:slug', requireUser, wrap(async (req, res) => {
    const card = getCard(req.params.slug);
    if (!card) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const status = await statusOf(req.user!.id, card.slug);
    if (status === 'locked') {
      res.status(403).json({ error: 'locked', messageFr: 'Valide la carte précédente pour accéder à celle-ci.' });
      return;
    }
    res.json({ card: toPublicCard(card), status });
  }));

  app.get('/api/cards/:slug/next', requireUser, wrap(async (req, res) => {
    res.json({ next_slug: nextCardSlug(req.params.slug) });
  }));

  // --- Execute (gating): SQL run against the read-only seed DB, or quiz choice ---
  app.post('/api/cards/:slug/execute', requireUser, wrap(async (req, res) => {
    const card = getCard(req.params.slug);
    if (!card) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const status = await statusOf(req.user!.id, card.slug);
    if (status === 'locked') {
      res.status(403).json({ error: 'locked', messageFr: 'Valide la carte précédente pour accéder à celle-ci.' });
      return;
    }

    // Quiz card
    if (card.gating.kind === 'quiz') {
      const choice = Number(req.body?.choice);
      if (!Number.isInteger(choice) || choice < 0 || choice >= card.gating.options.length) {
        res.status(400).json({ error: 'invalid_choice', messageFr: 'Choisis une réponse.' });
        return;
      }
      const pass = choice === card.gating.correctIndex;
      await recordAttempt(req.user!.id, card.slug, card.gatingExerciseSlug, `choice:${choice}`, pass ? 'pass' : 'fail', null, null);
      let nextSlug: string | null = null;
      if (pass) {
        await validateCard(req.user!.id, card.slug);
        nextSlug = nextCardSlug(card.slug);
      }
      res.json({
        status: pass ? 'pass' : 'fail',
        kind: 'quiz',
        messageFr: pass ? 'Bravo, bonne réponse ! 🎉' : "Ce n'est pas la bonne réponse. Réessaie (essais illimités).",
        card_validated: pass,
        next_card_slug: nextSlug,
      });
      return;
    }

    // Mutating card (INSERT/UPDATE/DELETE/DDL): run in the isolated work DB, validate final state.
    if (card.gating.kind === 'mutation') {
      const g = card.gating;
      const rawSql = String(req.body?.sql ?? '');
      const trimmed = rawSql.trim();
      if (!trimmed) {
        res.status(400).json({ status: 'error', kind: 'mutation', messageFr: "Écris une requête avant d'exécuter." });
        return;
      }
      if (rawSql.length > config.maxSqlLength) {
        res.status(400).json({ status: 'error', kind: 'mutation', messageFr: `Requête trop longue (maximum ${config.maxSqlLength} caractères).` });
        return;
      }
      let learnerSql = trimmed;
      if (!g.allowMultiStatement) {
        const noTrailing = trimmed.replace(/;\s*$/, '');
        if (noTrailing.includes(';')) {
          res.status(400).json({ status: 'error', kind: 'mutation', messageFr: 'Une seule instruction SQL à la fois.' });
          return;
        }
        learnerSql = noTrailing;
      }
      const started = Date.now();
      try {
        const run = await runMutation(req.user!.id, card.slug, {
          schemaSql: g.schemaSql,
          seedSql: g.seedSql,
          permissions: g.permissions,
          learnerSql,
          verifySql: g.verifySql,
          allowMultiStatement: g.allowMultiStatement,
        });
        const verdict = compareResult(run.columns, run.rows, g.expected, g.compare);
        const outcome = verdict.pass ? 'pass' : 'fail';
        await recordAttempt(req.user!.id, card.slug, card.gatingExerciseSlug, learnerSql, outcome, Date.now() - started, null);
        let nextSlug: string | null = null;
        if (verdict.pass) {
          await validateCard(req.user!.id, card.slug);
          nextSlug = nextCardSlug(card.slug);
        }
        res.json({
          status: outcome,
          kind: 'mutation',
          columns: run.columns,
          rows: run.rows,
          messageFr: verdict.pass
            ? 'Parfait, la table est dans l\'état attendu ! 🎉'
            : `Pas tout à fait. ${verdict.reasonFr ?? ''} (Voici l\'état obtenu ci-dessous.)`.trim(),
          card_validated: verdict.pass,
          next_card_slug: nextSlug,
        });
      } catch (err) {
        const mapped = mapSqlError(err);
        await recordAttempt(req.user!.id, card.slug, card.gatingExerciseSlug, learnerSql, mapped.outcome, Date.now() - started, mapped.category);
        res.status(200).json({ status: mapped.outcome, kind: 'mutation', messageFr: mapped.messageFr });
      }
      return;
    }

    // SQL card (read-only against the shared seed)
    const rawSql = String(req.body?.sql ?? '');
    const pre = preflightSql(rawSql);
    if (!pre.ok) {
      await recordAttempt(req.user!.id, card.slug, card.gatingExerciseSlug, rawSql, 'blocked', null, 'preflight');
      res.status(400).json({ status: 'error', kind: 'sql', messageFr: pre.messageFr });
      return;
    }

    const started = Date.now();
    try {
      const raw = await runReadOnly(card.gating.seedDb, pre.clean);
      const durationMs = Date.now() - started;
      const verdict = compareResult(raw.columns, raw.rows, card.gating.expected, card.gating.compare);
      const outcome = verdict.pass ? 'pass' : 'fail';
      await recordAttempt(req.user!.id, card.slug, card.gatingExerciseSlug, pre.clean, outcome, durationMs, null);

      let nextSlug: string | null = null;
      if (verdict.pass) {
        await validateCard(req.user!.id, card.slug);
        nextSlug = nextCardSlug(card.slug);
      }
      res.json({
        status: outcome,
        kind: 'sql',
        columns: raw.columns,
        rows: raw.rows,
        truncated: raw.truncated,
        messageFr: verdict.pass
          ? 'Parfait, le résultat est correct ! 🎉'
          : `Pas tout à fait. ${verdict.reasonFr ?? ''}`.trim(),
        card_validated: verdict.pass,
        next_card_slug: nextSlug,
      });
    } catch (err) {
      const durationMs = Date.now() - started;
      const mapped = mapSqlError(err);
      await recordAttempt(req.user!.id, card.slug, card.gatingExerciseSlug, pre.clean, mapped.outcome, durationMs, mapped.category);
      // UX requirement: always SHOW a usable, pedagogical error (never the raw MySQL message).
      res.status(200).json({ status: mapped.outcome, kind: 'sql', messageFr: mapped.messageFr });
    }
  }));

  // --- Reset the isolated work DB (mutating cards); no-op for read-only cards ---
  app.post('/api/cards/:slug/reset', requireUser, wrap(async (req, res) => {
    const card = getCard(req.params.slug);
    if (!card) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const status = await statusOf(req.user!.id, card.slug);
    if (status === 'locked') {
      res.status(403).json({ error: 'locked' });
      return;
    }
    if (card.gating.kind !== 'mutation') {
      res.json({ noop: true });
      return;
    }
    const g = card.gating;
    await resetMutation(req.user!.id, card.slug, { schemaSql: g.schemaSql, seedSql: g.seedSql, permissions: g.permissions });
    res.json({ ok: true, messageFr: 'La table a été réinitialisée à son état de départ.' });
  }));

  // --- Hints (progressive) ---
  app.post('/api/cards/:slug/hint', requireUser, wrap(async (req, res) => {
    const card = getCard(req.params.slug);
    if (!card) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const index = Number(req.body?.index ?? 0);
    const hints = card.gating.hints;
    if (!Number.isInteger(index) || index < 0 || index >= hints.length) {
      res.status(404).json({ error: 'no_more_hints', messageFr: "Il n'y a pas d'autre indice." });
      return;
    }
    await markHintUsed(req.user!.id, card.slug);
    res.json({ hint_fr: hints[index], index, remaining: hints.length - index - 1 });
  }));

  // --- Solution (viewing NEVER validates the card) ---
  app.post('/api/cards/:slug/solution', requireUser, wrap(async (req, res) => {
    const card = getCard(req.params.slug);
    if (!card) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    await markSolutionViewed(req.user!.id, card.slug);
    const solutionSql = card.gating.kind === 'sql' ? card.gating.solutionSql : null;
    res.json({ solution_sql: solutionSql, explanation_fr: card.gating.explanationFr });
  }));

  // --- Static client (SPA) ---
  if (fs.existsSync(config.clientDir)) {
    app.use(express.static(config.clientDir));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(config.clientDir, 'index.html'));
    });
  }

  // Error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // eslint-disable-next-line no-console
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: 'internal', messageFr: "Une erreur interne est survenue." });
  });

  return app;
}

function setSessionCookie(res: Response, sid: string): void {
  res.cookie(COOKIE, sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    signed: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

async function main() {
  // Fail fast if any card violates the authoring rules (e.g. gating == example).
  assertAuthoringRules();

  // Wait for the database to accept connections (compose healthcheck already gates this,
  // but retry a few times to be robust on cold start).
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      await pingDatabases();
      break;
    } catch (err) {
      if (attempt === 30) throw err;
      // eslint-disable-next-line no-console
      console.log(`[api] waiting for MySQL (attempt ${attempt})...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const app = buildApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] coursSQL listening on port ${config.port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[api] fatal:', err);
  process.exit(1);
});
