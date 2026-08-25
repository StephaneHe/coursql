import path from 'path';

// Database target: 'local' (Docker MySQL, default) or 'ovh' (managed OVH MySQL).
// Switching to OVH only rewires the "app" account (see limitation below); local dev is unchanged.
const dbTarget = (process.env.DB_TARGET ?? 'local').toLowerCase();
const useOvh = dbTarget === 'ovh';

// OVH managed/shared MySQL exposes a SINGLE account + a SINGLE database:
//   OVH_SERVER_ADD = SQL host to connect to, e.g. "xxxxxxx.mysql.db"
//   OVH_SERVER     = OVH SQL server identifier/label (informational reference, not a secret)
//   OVH_DB_USER / OVH_DB_PASSWORD / OVH_DB_NAME = that one account and its database
//
// ⚠️ LIMITATION (see DEPLOY.md): coursSQL requires THREE MySQL accounts (app / provisioner /
// executor) AND the privilege to CREATE/DROP databases at runtime (isolated ex_* work DBs) plus
// GET_LOCK. A single OVH account CANNOT provide that. So DB_TARGET=ovh wires ONLY the "app"
// account onto OVH; the mutating-card infrastructure (provisioner/executor, cards C42+) will NOT
// work against a single-user OVH DB. TODO: to run on OVH, use a self-managed MySQL (root) able to
// create the 3 accounts and the ex_* databases — i.e. hosting Option A in DEPLOY.md.
const ovhHost = process.env.OVH_SERVER_ADD ?? '';

// Central configuration, read from environment with safe local defaults.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  isProd: process.env.NODE_ENV === 'production',
  dbTarget,
  ovhServerId: process.env.OVH_SERVER ?? null, // informational reference only
  db: {
    host: useOvh ? ovhHost : process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    // The "app" account maps to OVH_* when DB_TARGET=ovh, else to the local Docker account.
    appUser: useOvh ? process.env.OVH_DB_USER ?? '' : process.env.APP_DB_USER ?? 'coursql_app',
    appPassword: useOvh ? process.env.OVH_DB_PASSWORD ?? '' : process.env.APP_DB_PASSWORD ?? 'coursql_app_pw',
    appName: useOvh ? process.env.OVH_DB_NAME ?? '' : process.env.APP_DB_NAME ?? 'coursql_app',
    // Provisioner/executor have NO OVH equivalent (single-user limitation above). They keep their
    // local env; against a single-user OVH DB they will not authenticate — mutating cards need
    // Option A (self-managed MySQL). This is intentional and documented, not a silent failure.
    execUser: process.env.EXEC_DB_USER ?? 'coursql_executor',
    execPassword: process.env.EXEC_DB_PASSWORD ?? 'coursql_exec_pw',
    provUser: process.env.PROV_DB_USER ?? 'coursql_provisioner',
    provPassword: process.env.PROV_DB_PASSWORD ?? 'coursql_prov_pw',
  },
  sessionSecret: process.env.SESSION_SECRET ?? 'dev_session_secret_change_me',
  // The session cookie must NOT be Secure when served over plain HTTP (browsers drop Secure
  // cookies on http://). This deployment is HTTP over a private the private network network, so default
  // false. Set COOKIE_SECURE=true only behind HTTPS/Nginx (DESIGN §12.4.c hardening).
  cookieSecure: (process.env.COOKIE_SECURE ?? 'false') === 'true',
  // Execution safety constants (DESIGN §12.4.b)
  queryTimeoutMs: Number(process.env.QUERY_TIMEOUT_MS ?? 3000),
  maxRowsReturned: Number(process.env.MAX_ROWS_RETURNED ?? 1000),
  maxSqlLength: Number(process.env.MAX_SQL_LENGTH ?? 4000),
  // Where the built client lives (served as static files by the API)
  clientDir: process.env.CLIENT_DIR ?? path.join(__dirname, '..', 'public'),
};
