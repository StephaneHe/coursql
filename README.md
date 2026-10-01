# coursSQL

**An interactive SQL trainer that runs your queries for real — safely.**

![version](https://img.shields.io/badge/version-2.3.1-blue)
![license](https://img.shields.io/badge/license-proprietary-lightgrey)
![PHP](https://img.shields.io/badge/PHP-8.1%2B-777bb4)
![MySQL](https://img.shields.io/badge/MySQL-8.4-4479a1)
![platform](https://img.shields.io/badge/platform-web-green)

coursSQL teaches SQL from the very first `SELECT` up to joins, subqueries, CTEs, transactions and DDL,
through **50 bite-sized cards** across 15 modules. Every exercise is validated on the **result your
query produces**, not on its text — so there is no single "expected string" to guess, and any correct
query passes. Learners type real SQL against a real MySQL database; the interesting engineering is in
letting them do that **on shared hosting with a single database account** without ever exposing the
application's own data.

**Live demo:** https://coursql.shoette.com

> **Status: active — version 2.3.1** (see [`CHANGELOG.md`](CHANGELOG.md)). The live app is the PHP port described below. A Node/Express implementation of the
> same API is kept for one-command local development (see [Run it locally](#run-it-locally)).

![coursSQL — a SELECT card with the lesson, the seed table and the progression sidebar](docs/screenshots/home.png)

> The application UI is currently in French (a full English translation is planned); the screenshots
> therefore show French labels in this English README.

---

## What it does

- **Card-based curriculum.** One concept per card, spiral pedagogy (few new ideas per lesson, constant
  reuse of prior ones). 50 cards / 15 modules, from `SELECT ... WHERE` to `GROUP BY`/`HAVING`, all join
  kinds, `EXISTS`, CTEs (`WITH`), set operations (`UNION`/`INTERSECT`/`EXCEPT`), and a final project.
- **Three kinds of gating exercise:**
  - **quiz** — multiple choice, for pure-concept cards;
  - **query** — write a `SELECT`; validated by comparing the *result set* against the expected one
    (order- and column-name-sensitivity are configured per card);
  - **mutation** (cards C42–C49) — `INSERT`/`UPDATE`/`DELETE` and DDL (`CREATE`/`ALTER`/`DROP TABLE`,
    indexes, constraints, transactions) run in an **isolated per-user work database**, then validated on
    the *final table state* via a hidden verification query that never reaches the client.
- **Result-based validation with meaningful data.** Seed rows are chosen so a plausible-but-wrong
  variant yields a *different* result (a row exactly on a `<` vs `<=` boundary, a `NULL` for `IS NULL`,
  duplicates for `DISTINCT`, …), so passing means understanding the concept.
- **Forgiving progression.** Unlimited attempts, per-card hints, and an on-demand solution (viewing it
  does not auto-validate). Progress is tracked per learner; a card unlocks the next one.
- **Pedagogical errors, never raw SQL errors.** A failed query maps to a teaching message; the raw
  MySQL error text, DSN and stack traces are never sent to the browser.

## Screenshots

**Solving a query card** — write SQL in the editor, run it, and get validated on the actual result set:

![A query card: SQL editor with SELECT title, year FROM books and a matching result table](docs/screenshots/exercise.png)

**A mutation card (C42–C49)** — `INSERT`/`UPDATE`/`DELETE`/DDL run in an isolated per-user work table,
validated on the final table state:

![A mutation card: an INSERT statement executed against an isolated todo table, with the resulting rows](docs/screenshots/mutant-card.png)

**Password authentication** — sign up or sign in with a password; profiles are never listed publicly:

![The sign-up screen with name and password fields](docs/screenshots/auth.png)

## Security model — the interesting part

The whole point of coursSQL is executing **untrusted, learner-written SQL** against a live database.
On OVH shared hosting there is exactly **one MySQL account and one database**, so the classic defence
(a locked-down `executor` account with `SELECT`-only grants) is not available. coursSQL replaces it with
an **application-level guard**, [`php/api/lib/SqlGuard.php`](php/api/lib/SqlGuard.php):

1. **Preflight** — length cap, rejection of NUL/control characters, Unicode-space homoglyphs, and MySQL
   executable comments (`/*! ... */`).
2. **Parser-backed** — the SQL is lexed and parsed with a vendored `phpmyadmin/sql-parser`; anything
   that does not parse to exactly one statement is rejected.
3. **Positive allowlists** — keywords, functions and operators are **allow-listed**, not deny-listed.
   Unknown tokens are blocked by default.
4. **Mandatory table resolution** — every table reference must resolve through the card's
   logical→physical name map. Unmapped names, qualified `db.table` names, and reserved physical prefixes
   (`app_`, `seed_`, `wk_`) are refused — so `information_schema`, the app's own tables, and other users'
   work tables are unreachable **by construction**, and each learner only ever sees prefixed table names.
5. **Independent post-rewrite pass** — after rewriting logical names to physical ones, the guard
   **re-lexes and re-validates the exact string that will be executed**, and re-checks that every table
   is a physical name from the map. A rewrite bug therefore cannot smuggle anything through, because the
   final string is verified on its own terms.
6. **Driver backstop** — PDO runs with `MULTI_STATEMENTS` disabled and emulated prepares off, so
   statement stacking cannot work even if the guard were bypassed.

A forbidden statement is rejected cleanly with a teaching message instead of ever reaching the database
— here a `DROP TABLE` on a read-only card:

![A DROP TABLE statement rejected by SqlGuard on a read-only card, with a clear message](docs/screenshots/sqlguard-blocked.png)

Mutating cards get an extra layer: each learner×card pair gets its own set of prefixed work tables,
guarded by a short-lived DB lock, reset (`DROP`+`CREATE`+seed) before each attempt, and validated on a
**separate connection** so an uncommitted transaction rolls back as intended.

Additional hardening: HttpOnly + `SameSite=Lax` session cookies with strict-mode sessions and id
regeneration on login; parameterised queries everywhere on the server side; security headers and
deny-all rules for private files and `vendor/` in `.htaccess`; and **request rate limiting** (new in
2.1.0) on account creation and on the SQL-execution/reset routes, returning HTTP 429 over quota.

## Architecture

```
Browser ──HTTPS──> Apache (.htaccess front controller)
                     ├── static React SPA (built assets)
                     └── /api/*  ─> php/api/index.php  ──PDO──> single MySQL database
                                     ├── SqlGuard (allowlist + rewrite + post-check)
                                     ├── prefixed namespaces: app_* / seed_* / wk_*
                                     └── card content loaded from cards.json (outside the webroot)
```

- **Single origin, no CORS.** The React client is served next to the API and calls `/api/*` relatively.
- **Single database, namespaced by table prefix.** `app_*` = application state (users, progress,
  attempts, locks, rate limits); `seed_*`/`seedref_*` = shared read-only teaching data; `wk_*` =
  isolated per-user work tables for mutating cards.
- **Secrets and answers stay out of the webroot.** DB credentials live in a private `config.local.php`;
  full card content (with solutions and expected results) lives in a `cards.json` served from **outside**
  the web root and denied by `.htaccess` in depth.

## Tech stack

- **Client:** React 18 + TypeScript, built with Vite.
- **API (production):** PHP 8.1+ (8.3 in production), PDO/MySQL, native sessions.
- **API (development):** Node.js + TypeScript (Express, `mysql2`) — same routes and contract.
- **Database:** MySQL 8.4 (≥ 8.0.31 required for `INTERSECT`/`EXCEPT`).
- **SQL parsing:** `phpmyadmin/sql-parser`.

## Run it locally

The quickest way to try coursSQL locally uses the **development stack** (the Node implementation of the
same API) under Docker Compose:

```bash
cp .env.example .env          # dev-only credentials; change them for any real deployment
docker compose up -d --build  # builds the React client + the API and starts MySQL
```

Then open **http://localhost:8080** and create a profile. On a cold start the API waits a few seconds
for MySQL to accept connections; check readiness with `curl http://localhost:8080/api/health`.

Suggested first run: create a profile → C1–C3 (quiz) → **C4** type `SELECT * FROM books;` → **C5**
`SELECT title, year FROM books;`. Try a wrong query (e.g. `SELECT titre FROM books;`) to see a teaching
error, or `UPDATE books SET year = 0;` on a read-only card to see it blocked.

### Prerequisites

- **Dev stack:** Docker with Docker Compose (nothing else; the image builds the client and the Node API).
- **Client/API without Docker:** Node.js 22 (npm workspaces `client/` and `api/`) and a MySQL 8.4 server
  initialised with `db/init/*.sql`.
- **Production port:** PHP ≥ 8.1 with PDO MySQL, Apache with `.htaccess` support, MySQL ≥ 8.0.31.

Useful workspace scripts: `npm run dev|build -w client` (Vite), `npm run build|typecheck -w api` (tsc).

## Configuration

Never commit real values — `.env` and the private config directory are git-ignored.

**Dev stack — [`.env.example`](.env.example)** (copy to `.env`):

| Variable | Role |
|---|---|
| `MYSQL_ROOT_PASSWORD` | MySQL root password used by the container init scripts |
| `APP_DB_PASSWORD`, `EXEC_DB_PASSWORD`, `PROV_DB_PASSWORD` | passwords of the app / executor / provisioner accounts (must match `db/init/02-accounts.sql`) |
| `SESSION_SECRET` | session-cookie signing secret |
| `APP_HOST_PORT` | host port published by Docker (default `8080`) |
| `DB_TARGET` | `local` (Docker MySQL, default) or `ovh` (single managed account) |
| `OVH_SERVER_ADD`, `OVH_SERVER`, `OVH_DB_NAME`, `OVH_DB_USER`, `OVH_DB_PASSWORD` | managed-MySQL target, only when `DB_TARGET=ovh` |

**Production PHP port — [`php/api/config.php`](php/api/config.php)** reads a private
`config.local.php` (outside the webroot, generated by `deploy/ovh/make-config.mjs`), then environment
variables: `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` (or their `OVH_*` equivalents),
`QUERY_TIMEOUT_MS` (default 3000), `MAX_ROWS_RETURNED` (1000), `MAX_SQL_LENGTH` (4000), `COOKIE_SECURE`
(auto-on over HTTPS), plus `COURSQL_PRIVATE_DIR` / `COURSQL_CONFIG_FILE` to relocate the private
directory (card content, sessions, local config).

## Deployment

Building and deploying the **production PHP port** (static client + PHP API + single-database schema for
shared hosting) is documented in [`DEPLOY.md`](DEPLOY.md). The `deploy/ovh/` scripts export the card
content, build the single-database schema and assemble the upload package; schema changes ship as
idempotent SQL files in `deploy/ovh/migrations/`.

## Tests

The test suite targets the production PHP API and lives in [`php/tests/`](php/tests/). There is no
CI; tests are run manually before a release.

```bash
php php/tests/guard_test.php       # SqlGuard: allowed vs. blocked statements, rewrites (no DB needed)
php php/tests/compare_test.php     # result-set comparison rules (no DB needed)

# The following need a MySQL database loaded with the schema and the private config/cards in place:
php php/tests/read_only_replay.php # every read-only card's solution matches its expected result; naive variants fail
php php/tests/full_replay.php      # full replay of all 50 cards, including mutation cards, for a test user
DB_HOST=… DB_NAME=… DB_USER=… DB_PASSWORD=… bash php/tests/auth_progress_smoke.sh
                                   # end-to-end over HTTP (php -S): sign-up, login, cards, hints, progress
```

The Node dev API has a type check only: `npm run typecheck -w api`.

## Project structure

```
php/                 # production PHP API (front controller, SqlGuard, routes) + vendored parser
  api/lib/SqlGuard.php  # the security guard (worth a read)
client/              # React + TypeScript SPA (Vite)
api/                 # Node/TypeScript dev API + versioned card content (src/content/cards.ts)
deploy/ovh/          # build scripts, single-database schema, migrations
db/init/             # local MySQL init (schema, accounts, seed data) for the dev stack
docs/                # DESIGN.md (detailed design & security rationale)
docker-compose.yml   # one-command local dev stack
```

## Documentation

- [`docs/DESIGN.md`](docs/DESIGN.md) — detailed design: pedagogy, exercises, architecture, security,
  and the API contract.
- [`DEPLOY.md`](DEPLOY.md) — production build and shared-hosting deployment (in French).
- [`CHANGELOG.md`](CHANGELOG.md) — version history.

## Versioning & roadmap

The project follows [Semantic Versioning](https://semver.org/); every release is recorded in
[`CHANGELOG.md`](CHANGELOG.md) (Keep a Changelog format, in French). The running version is exposed by
`GET /api/version`.

Planned: an English translation of the UI and course content (currently French only).

## Security

- **Reporting a vulnerability:** please do **not** open a public issue. Report it privately to the
  maintainer through GitHub (the repository's *Security* tab, or the contact on the maintainer's
  profile), with steps to reproduce.
- **Secrets stay out of the repository:** `.env`, `private/` and `private_coursql/` (DB credentials,
  card solutions, sessions) are git-ignored; `.env.example` only contains dev placeholders.
- **Exposure warning:** coursSQL executes user-supplied SQL by design. Deploy it only against a
  **dedicated database** that holds nothing but coursSQL data, keep `SqlGuard` and the rate limits
  enabled, and serve it over HTTPS.

## Contributing

This is a personal portfolio project; issues and suggestions are welcome. For code changes, open an
issue first. Conventions: UI and course content in French, code and comments in English; changes to
`SqlGuard` should add cases to `php/tests/guard_test.php` and keep both replays green.

## License

No open-source license is granted: **Proprietary — all rights reserved** (`UNLICENSED` in
`package.json`). The source is public for reading and evaluation; reuse requires the author's
permission. The vendored `phpmyadmin/sql-parser` keeps its own license (GPL-2.0-or-later).

## Author

[@StephaneHe](https://github.com/StephaneHe)
