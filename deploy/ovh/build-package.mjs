/** Assemble l'arborescence OVH sans effectuer aucun upload. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const output = path.join(root, 'build', 'ovh');
const web = path.join(output, 'coursql');
const privateDir = path.join(output, 'private_coursql');
const importDir = path.join(output, 'import');
const adminDir = path.join(output, 'admin_coursql');

for (const required of [
  path.join(root, 'client', 'dist', 'index.html'),
  path.join(root, 'private_coursql', 'cards.json'),
  path.join(root, 'deploy', 'ovh', 'schema.sql'),
]) {
  if (!fs.existsSync(required)) throw new Error(`Livrable préalable absent : ${required}`);
}

fs.rmSync(output, { recursive: true, force: true });
for (const dir of [web, privateDir, importDir, adminDir]) fs.mkdirSync(dir, { recursive: true });

fs.cpSync(path.join(root, 'client', 'dist'), web, { recursive: true });
fs.cpSync(path.join(root, 'php', 'api'), path.join(web, 'api'), { recursive: true });
fs.cpSync(path.join(root, 'php', 'vendor'), path.join(web, 'vendor'), {
  recursive: true,
  filter: (source) => !source.replaceAll('\\', '/').includes('/vendor/bin'),
});
fs.copyFileSync(path.join(root, 'php', '.htaccess'), path.join(web, '.htaccess'));
// Per-folder OVH runtime override: forces PHP 8.x for this subdomain (account default is 7.4).
fs.copyFileSync(path.join(root, 'php', '.ovhconfig'), path.join(web, '.ovhconfig'));
fs.copyFileSync(path.join(root, 'private_coursql', 'cards.json'), path.join(privateDir, 'cards.json'));
fs.chmodSync(path.join(privateDir, 'cards.json'), 0o600);
for (const sql of ['schema.sql', 'repair_seed.sql']) {
  fs.copyFileSync(path.join(here, sql), path.join(importDir, sql));
}
fs.copyFileSync(path.join(here, 'gc_workspaces.php'), path.join(adminDir, 'gc_workspaces.php'));

function fileCount(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(
    (count, entry) => count + (entry.isDirectory() ? fileCount(path.join(directory, entry.name)) : 1),
    0,
  );
}
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
const manifest = {
  version: packageJson.version,
  webroot: 'coursql/',
  private: 'private_coursql/',
  webFiles: fileCount(web),
  cardsSha256: sha256(path.join(privateDir, 'cards.json')),
  schemaSha256: sha256(path.join(importDir, 'schema.sql')),
};
fs.writeFileSync(path.join(output, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Paquet OVH local ${packageJson.version} : ${output}`);
console.log(`${manifest.webFiles} fichiers web ; contenu privé séparé.`);
