/** Génère private_coursql/config.local.php depuis le .env local, sans afficher les valeurs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const envPath = path.join(root, '.env');
const values = {};
for (const rawLine of fs.readFileSync(envPath, 'utf8').replaceAll('\r', '').split('\n')) {
  const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!match) continue;
  let value = match[2];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  values[match[1]] = value;
}
const required = ['OVH_SERVER_ADD', 'OVH_DB_NAME', 'OVH_DB_USER', 'OVH_DB_PASSWORD'];
const missing = required.filter((key) => !values[key]);
if (missing.length) throw new Error(`Variables OVH manquantes : ${missing.join(', ')}`);
const phpString = (value) => `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const outputDir = path.join(root, 'private_coursql');
const output = path.join(outputDir, 'config.local.php');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(output, `<?php\ndeclare(strict_types=1);\nreturn [\n  'host' => ${phpString(values.OVH_SERVER_ADD)},\n  'name' => ${phpString(values.OVH_DB_NAME)},\n  'user' => ${phpString(values.OVH_DB_USER)},\n  'password' => ${phpString(values.OVH_DB_PASSWORD)},\n];\n`, { mode: 0o600 });
fs.chmodSync(output, 0o600);
console.log(`Configuration privée générée : ${output} (mode 600). Aucune valeur affichée.`);
