<?php
declare(strict_types=1);

/** Configuration PHP : fichier privé hors webroot, puis variables d'environnement. */
function coursql_config(): array
{
    $privateDir = getenv('COURSQL_PRIVATE_DIR') ?: dirname(__DIR__, 2) . '/private_coursql';
    $localFile = getenv('COURSQL_CONFIG_FILE') ?: $privateDir . '/config.local.php';
    $local = [];
    if (is_file($localFile)) {
        $loaded = require $localFile;
        if (!is_array($loaded)) {
            throw new RuntimeException('Configuration privée invalide.');
        }
        $local = $loaded;
    }

    $read = static function (array $keys, mixed $default = null) use ($local): mixed {
        foreach ($keys as $key) {
            if (array_key_exists($key, $local) && $local[$key] !== '') {
                return $local[$key];
            }
            $value = getenv($key);
            if ($value !== false && $value !== '') {
                return $value;
            }
        }
        return $default;
    };

    // Secure cookies whenever the request is served over HTTPS (Let's Encrypt in prod), while a
    // plain-HTTP local dev keeps them off so the session cookie is still stored. An explicit
    // COOKIE_SECURE env/config value always wins.
    $httpsOn = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443);

    return [
        'version' => '2.3.0',
        'db_host' => (string) $read(['host', 'OVH_SERVER_ADD', 'DB_HOST'], '127.0.0.1'),
        'db_port' => (int) $read(['port', 'DB_PORT'], 3306),
        'db_name' => (string) $read(['name', 'OVH_DB_NAME', 'DB_NAME']),
        'db_user' => (string) $read(['user', 'OVH_DB_USER', 'DB_USER']),
        'db_pass' => (string) $read(['password', 'OVH_DB_PASSWORD', 'DB_PASSWORD']),
        'cards_path' => $privateDir . '/cards.json',
        // Dedicated, private session store so a shared-host global GC cannot reap our 30-day sessions.
        'session_path' => $privateDir . '/sessions',
        'query_timeout_ms' => (int) $read(['QUERY_TIMEOUT_MS'], 3000),
        'max_rows' => (int) $read(['MAX_ROWS_RETURNED'], 1000),
        'max_sql_len' => (int) $read(['MAX_SQL_LENGTH'], 4000),
        'cookie_secure' => filter_var($read(['COOKIE_SECURE'], $httpsOn), FILTER_VALIDATE_BOOL),
    ];
}
