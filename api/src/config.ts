import path from 'path';

// Central configuration, read from environment with safe local defaults.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  isProd: process.env.NODE_ENV === 'production',
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    appUser: process.env.APP_DB_USER ?? 'coursql_app',
    appPassword: process.env.APP_DB_PASSWORD ?? 'coursql_app_pw',
    appName: process.env.APP_DB_NAME ?? 'coursql_app',
    execUser: process.env.EXEC_DB_USER ?? 'coursql_executor',
    execPassword: process.env.EXEC_DB_PASSWORD ?? 'coursql_exec_pw',
  },
  sessionSecret: process.env.SESSION_SECRET ?? 'dev_session_secret_change_me',
  // Execution safety constants (DESIGN §12.4.b)
  queryTimeoutMs: Number(process.env.QUERY_TIMEOUT_MS ?? 3000),
  maxRowsReturned: Number(process.env.MAX_ROWS_RETURNED ?? 1000),
  maxSqlLength: Number(process.env.MAX_SQL_LENGTH ?? 4000),
  // Where the built client lives (served as static files by the API)
  clientDir: process.env.CLIENT_DIR ?? path.join(__dirname, '..', 'public'),
};
