# Déploiement coursSQL 2.0.0 — PHP sur OVH mutualisé

Le port PHP est construit et validé localement. **Le déploiement OVH (étape 12) n'a pas encore été exécuté.**
La spécification de référence reste [`docs/PLAN_PHP_PORT.md`](docs/PLAN_PHP_PORT.md).

## Construire le paquet local

```powershell
npm.cmd --prefix api run build
node.exe deploy/ovh/export-cards.mjs
node.exe deploy/ovh/build-schema.mjs
npm.cmd --prefix client run build
node.exe deploy/ovh/build-package.mjs
Compress-Archive -Path build/ovh/* -DestinationPath build/coursql-2.0.0-ovh.zip -Force
```

Arborescence générée :

- `build/ovh/coursql/` : webroot (React statique, API PHP, parser vendored, `.htaccess`) ;
- `build/ovh/private_coursql/` : `cards.json` hors webroot ;
- `build/ovh/import/schema.sql` : dump mono-base à importer ;
- `build/ovh/admin_coursql/` : maintenance CLI hors webroot.

`private_coursql/config.local.php` n'est jamais archivé ni committé. Une fois les variables
`OVH_DB_*` renseignées dans `.env`, le générer localement avec `node deploy/ovh/make-config.mjs`,
puis le transférer séparément en mode 600 sans afficher son contenu.

## Étape 12 — opérations manuelles OVH après validation

1. Relever `SELECT VERSION()` sur la base OVH : **MySQL ≥ 8.0.31** est requis pour C41.
2. Dans l'espace client OVH, sélectionner **PHP 8.1 ou supérieur** (8.2/8.3 conseillé).
3. Importer `deploy/ovh/schema.sql` dans l'unique base via phpMyAdmin.
4. Transférer uniquement le contenu de `build/ovh/coursql/` vers la cible exacte `~/coursql/`,
   puis `private_coursql/` et `admin_coursql/` comme dossiers frères hors webroot.
5. Pointer le multisite `coursql.shoette.com` sur `~/coursql/`, activer HTTPS, puis mettre
   `COOKIE_SECURE=true` dans l'environnement PHP.
6. Vérifier `GET /api/health`, le parcours C1→C50, puis :

```text
https://coursql.shoette.com/private/cards.json       -> 403/404
https://coursql.shoette.com/private_coursql/cards.json -> 403/404
https://coursql.shoette.com/vendor/                   -> 403/404
```

Le transfert SFTP doit suivre la procédure du plan : cible bornée `~/coursql/`, mot de passe jamais
placé en argument/log, exclusions `.git`, `.env`, sources TypeScript, tests et dumps non requis.

## Limite de sécurité assumée

Avec un seul compte MySQL, l'isolation est applicative : `SqlGuard` (parser + allowlists positives +
réécriture + contrôle post-réécriture) et les tables préfixées remplacent les trois comptes/bases
jetables de la pile Node. Toute modification du garde impose la suite adversariale complète.
