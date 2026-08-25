# Déploiement de coursSQL

## Verdict : NON déployable sur l'hébergement **mutualisé** OVH

coursSQL n'est **pas** un site PHP/statique : c'est une application **Node.js/Express + MySQL**
dont le cœur (exécution de SQL non fiable en toute sécurité) impose des opérations que le
mutualisé OVH ne permet pas.

**Pourquoi le mutualisé ne convient pas :**

1. **Backend Node persistant** — l'API (`api/`, Express + mysql2, servie sur un port) doit tourner
   en continu. Le mutualisé OVH n'exécute que **PHP + fichiers statiques**, pas de process Node.
2. **Front inutilisable seul** — le client React appelle `/api/accounts|cards|me|progress|sessions|users`.
   Sans l'API, la page statique ne permet ni de se connecter ni d'ouvrir une carte.
3. **Isolation de sécurité = privilèges MySQL avancés** — pour exécuter le SQL de l'apprenant sans
   risque, l'app :
   - crée/détruit des **bases de travail isolées `ex_<hash>` par (utilisateur × exercice)** à la volée
     (`CREATE DATABASE` / `DROP DATABASE`) ;
   - utilise **3 comptes MySQL** distincts à privilèges séparés : `app` (données de l'app),
     `provisioner` (création/suppression des bases de travail), `executor` (exécute le SQL non fiable,
     droits minimaux) ;
   - emploie `GET_LOCK`, `SET SESSION max_execution_time`, etc.

   Une base OVH mutualisée/managée fournit **un seul compte** et **une seule base**, sans droit de
   créer/supprimer des bases ni des comptes → **incompatible** avec ce modèle.

## Ce qui EST câblé malgré tout (`DB_TARGET=ovh`)

La config (`api/src/config.ts`) lit désormais les variables `OVH_*` du `.env` quand
`DB_TARGET=ovh` :

| Variable `.env` | Rôle |
|---|---|
| `OVH_SERVER_ADD` | hôte SQL (ex. `xxxxxxx.mysql.db`) → `db.host` |
| `OVH_SERVER` | identifiant du serveur SQL OVH (référence, non secret) |
| `OVH_DB_NAME` | base → compte **app** |
| `OVH_DB_USER` / `OVH_DB_PASSWORD` | identifiants du compte **app** |

> **TODO / LIMITE explicite** : ce câblage ne branche que le compte **app**. Les comptes
> **provisioner** et **executor** et le droit `CREATE/DROP DATABASE` **n'ont pas d'équivalent** sur
> un compte OVH unique. Les cartes **mutantes (C42→C49)** et l'exécution SQL isolée **ne
> fonctionneront pas** contre une base OVH à user unique. Pour un vrai déploiement, il faut un
> **MySQL auto-géré (accès root)** — voir Option A. Le dev **local reste inchangé** (`DB_TARGET`
> absent ou `local`).

## Options d'hébergement

### Option A — recommandée (zéro réécriture) : hôte **Node-capable** + MySQL auto-géré
Héberger le stack **tel quel** (il est déjà dockerisé : `docker-compose.yml` = MySQL 8.4 + API+front).

- **Ressources OVH nécessaires** : un **VPS OVH** *(gamme VPS)* ou **Public Cloud Instance** — **pas**
  du mutualisé. Linux + Docker.
- **MySQL** : celui du `docker-compose` (MySQL 8.4 auto-géré, accès **root**) — indispensable pour
  créer les **3 comptes** (`db/init/02-accounts.sql`) et les **bases `ex_*`** à la volée. (La base
  MySQL managée OVH n'est **pas** utilisable pour ça.)
- **Réseau / HTTPS** : reverse proxy **nginx** ou **Caddy** devant le conteneur `app` (port 3000),
  avec certificat TLS (Let's Encrypt). Mettre `COOKIE_SECURE=true` derrière HTTPS.
- **DNS** : faire pointer `coursql.shoette.com` (enregistrement **A/AAAA**, zone DNS OVH du domaine
  `shoette.com`) vers l'**IP publique du VPS**.
- **Démarrage** : `docker compose up -d` (auto-restart déjà en place ; cf. README « Démarrage
  automatique »).

### Option B — hybride : front statique sur mutualisé + API Node ailleurs
- Build du client (`client/ → dist/`) uploadé sur le mutualisé (`coursql.shoette.com`).
- API Node hébergée sur un hôte Node-capable (Option A) exposée publiquement.
- Nécessite **CORS** (le front et l'API sont sur des origines différentes) + une URL d'API publique
  configurable côté client. Plus de pièces mobiles ; intéressant surtout si on tient à servir le
  front depuis OVH mutualisé.

### Option C — déconseillée : réécriture en PHP
- Réécrire tout le backend en PHP pour le mutualisé.
- **Gros chantier** et surtout **dégrade la sécurité** : impossible d'isoler chaque apprenant dans sa
  propre base (un seul user/une seule base) → le SQL non fiable s'exécuterait sur la base applicative.
  Non retenu.

## Résumé

| | Mutualisé OVH | VPS/Cloud Node (Option A) |
|---|---|---|
| Process Node persistant | ❌ | ✅ |
| `CREATE/DROP DATABASE` runtime | ❌ | ✅ (MySQL root) |
| 3 comptes MySQL | ❌ | ✅ |
| Effort | réécriture PHP (C) | **zéro** (déjà dockerisé) |

**Recommandation : Option A** — VPS/Cloud OVH Node-capable + MySQL auto-géré, reverse proxy HTTPS,
DNS `coursql.shoette.com` → IP du VPS.
