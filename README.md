# coursSQL

Application web interactive pour **apprendre le SQL progressivement**, destinée à un adulte débutant complet en bases de données. Pédagogie en **spirale** (peu de concepts neufs par leçon, réutilisation constante des acquis), validation **sur le résultat** et non sur le texte de la requête, exécution **sécurisée** de SQL non fiable.

- **Version :** `1.7.3` (voir [`CHANGELOG.md`](./CHANGELOG.md))
- **État :** **curriculum complet** — 50 cartes / 15 modules, du `SELECT` au projet final (jointures, sous-requêtes, transactions, DDL). Démarre automatiquement au boot (voir « Démarrage automatique » ci-dessous).
- **UI en cartes** : une notion = une **carte** ; chaque carte porte un exercice **gating** dont la réussite débloque la carte suivante (15 modules / 50 cartes).

## Lancer la tranche C1→C5

> Toute la pile (MySQL 8.4 + API + front) tourne **dans WSL via Docker Compose** — l'API atteint MySQL par le réseau interne Compose, aucune frontière Windows↔WSL (voir DESIGN §12.4.c).

**Dans un terminal WSL**, à la racine du projet (monté depuis `<project>`) :

```bash
cp .env.example .env         # secrets DEV (à changer pour un vrai déploiement)
docker compose up -d --build # construit le client + l'API, démarre MySQL (détaché)
# Selon l'installation, le binaire est « docker-compose » (standalone) au lieu de « docker compose » :
# docker-compose up -d --build
```

> Démarrage à froid : l'API attend que MySQL accepte les connexions (quelques secondes de « waiting for MySQL » dans les logs), c'est normal. Vérifier : `curl http://localhost:8080/api/health`.

Puis ouvrir **http://localhost:8080** (ou via the private network : **http://localhost:8080**).

## Démarrage automatique (résilience au redémarrage du PC)

coursSQL revient tout seul après un reboot Windows, sans intervention. Deux niveaux :

1. **Démon Docker au boot de WSL** — `the host init config` (distro `linux-host`) contient une section `[boot]` unique qui, entre autres, lance `service docker start`. Dès que la distro WSL démarre, le démon Docker démarre (en **root**, pas de sudo interactif), puis les conteneurs `coursql-*` reviennent seuls grâce à `restart: unless-stopped`.

   ```ini
   [boot]
   command = sysctl -w net.ipv4.ip_unprivileged_port_start=80; modprobe kvm_intel && chmod 666 /dev/kvm; service docker start
   ```

   > ⚠️ `host init config` n'accepte **qu'une seule** section `[boot]` avec **une seule** clé `command` : les commandes multiples sont chaînées par `;`. (Un doublon `[boot]` faisait auparavant que seule la dernière commande s'exécutait.) Ceci profite à **tous** les services WSL du services, pas qu'à coursSQL.

2. **Réveil de WSL au logon Windows** — une **tâche planifiée** `startup-task` (déclencheur *ONLOGON*) exécute [`scripts/startup-script`](./scripts/startup-script), qui réveille la distro WSL (ce qui déclenche le `[boot]` ci-dessus), attend le démon Docker, puis fait un `docker-compose up -d` **idempotent** (filet de sécurité).

   Recréer la tâche si besoin :
   ```bash
   a scheduled task //Create //TN "startup-task" \
     //TR 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "<project>\scripts\startup-script"' \
     //SC ONLOGON //RL LIMITED //F
   ```

**Tester la résilience sans rebooter** : `wsl -e bash -c "sudo service docker stop"` puis `wsl.exe --shutdown` (état à froid), puis `a scheduled task //Run //TN "startup-task"` → Docker redémarre seul et `curl http://127.0.0.1:8080/api/health` répond `200`.

Parcours de test : créer un profil → C1/C2/C3 (quiz) → **C4** taper `SELECT * FROM books;` → **C5** `SELECT title, year FROM books;`. Essaie une requête fausse (ex. `SELECT titre FROM books;`) pour voir le **message d'erreur pédagogique**, ou `UPDATE books SET year=0;` pour voir le **blocage par les privilèges** (executor en lecture seule).

### Développement (hors Docker)

```bash
# terminal 1 — MySQL seul
docker compose up mysql
# terminal 2 — API (port 3000)
cd api && npm install && npm run build && npm start
# terminal 3 — client Vite (port 5173, proxy /api -> 3000)
cd client && npm install && npm run dev
```
- **Conception détaillée :** [`docs/DESIGN.md`](./docs/DESIGN.md) — parcours pédagogique, exercices, architecture, sécurité, API.

## Convention de langue

- **Contenu pédagogique et interface** : français.
- **Code, identifiants techniques, variables, commentaires** : anglais.

## Pile technique cible

React + TypeScript (client) · Node.js + TypeScript (API) · Nginx (reverse proxy) · MySQL 8.4 LTS · Docker Compose (local).

## Isolation & sécurité (résumé)

- Base **applicative** (`coursql_app`) séparée des **bases de travail** d'exercice (`ex_<hash>`, une par couple utilisateur × exercice).
- **Trois comptes MySQL** à privilèges séparés : `coursql_app`, `coursql_provisioner`, `coursql_executor` (moindre privilège).
- Le SQL de l'apprenant ne va **jamais** à un compte admin ; requêtes internes **paramétrées**.

Voir [`docs/DESIGN.md`](./docs/DESIGN.md) pour les décisions, alternatives, conséquences et les sources officielles (MySQL 8.4, OWASP).

## Structure

```
docs/            # DESIGN.md (conception détaillée, §12)
db/init/         # SQL d'initialisation MySQL : schéma app, 3 comptes, base seed lecture seule
api/             # API Node.js + TypeScript (Express, mysql2) — sert aussi le client en prod
  src/content/   # contenu versionné des cartes (C1→C5 pour l'instant)
client/          # client React + TypeScript (Vite) — UI en cartes
Dockerfile       # build multi-étages : client + API -> image runtime
docker-compose.yml
```
