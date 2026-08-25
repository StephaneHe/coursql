/**
 * Export one-shot des cartes TypeScript vers le contenu privé consommé par l'API PHP.
 *
 * Source unique : api/src/content/cards.ts, compilée dans api/dist avant cet export.
 * La sortie contient les solutions et les résultats attendus : elle reste hors webroot
 * et hors Git dans private_coursql/cards.json.
 *
 * Usage : npm --prefix api run build && node deploy/ovh/export-cards.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const compiledCards = path.join(root, 'api', 'dist', 'content', 'cards.js');

if (!fs.existsSync(compiledCards)) {
  throw new Error(`Module compilé absent : ${compiledCards}. Lance d'abord npm --prefix api run build.`);
}

const { orderedCards } = require(compiledCards);
const cards = orderedCards();
const seedTables = ['books', 'members', 'loans', 'fines', 'employees'];

if (!Array.isArray(cards) || cards.length !== 50) {
  throw new Error(`Export refusé : 50 cartes attendues, ${cards?.length ?? 0} trouvées.`);
}

function mutationTables(card) {
  const names = new Set((card.tables ?? []).map((table) => table.name.toLowerCase()));
  const sql = [
    card.gating.schemaSql,
    card.gating.seedSql,
    card.gating.verifySql,
    card.gating.solutionSql,
  ].filter(Boolean).join('\n');

  for (const match of sql.matchAll(/\b(?:from|into|update|table|join|on)\s+`?([a-z_][a-z0-9_]*)`?/gi)) {
    names.add(match[1].toLowerCase());
  }
  names.delete('information_schema');
  return [...names].sort();
}

const exported = cards.map((card) => {
  const kind = card.gating.kind;
  const logicalTables = kind === 'sql' ? [...seedTables] : kind === 'mutation' ? mutationTables(card) : [];
  return {
    ...card,
    kind,
    permissions: kind === 'sql' ? 'read_only' : kind === 'mutation' ? card.gating.permissions : 'quiz',
    allowMultiStatement: Boolean(card.gating.allowMultiStatement),
    logicalTables,
  };
});

const slugs = new Set(exported.map((card) => card.slug));
if (slugs.size !== 50) throw new Error('Export refusé : slugs dupliqués.');
for (const card of exported) {
  if (card.kind !== 'quiz' && card.logicalTables.length === 0) {
    throw new Error(`Export refusé : aucune table logique pour ${card.slug}.`);
  }
}

const targetDir = path.join(root, 'private_coursql');
const target = path.join(targetDir, 'cards.json');
fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(exported, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

const roundTrip = JSON.parse(fs.readFileSync(target, 'utf8'));
if (roundTrip.length !== 50 || roundTrip.some((card) => !card.gating || !card.slug)) {
  throw new Error('Validation de la sortie JSON échouée.');
}

const counts = Object.groupBy
  ? Object.fromEntries(Object.entries(Object.groupBy(exported, (card) => card.kind)).map(([k, v]) => [k, v.length]))
  : exported.reduce((acc, card) => ({ ...acc, [card.kind]: (acc[card.kind] ?? 0) + 1 }), {});
console.log(`Export validé : ${exported.length} cartes -> ${target}`);
console.log(`Répartition : ${JSON.stringify(counts)}`);
