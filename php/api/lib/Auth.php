<?php
declare(strict_types=1);

final class Auth
{
    public static function start(array $config): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.cookie_samesite', 'Lax');
        ini_set('session.gc_maxlifetime', (string) (30 * 24 * 60 * 60));
        session_name('coursql_sid');
        session_set_cookie_params([
            'lifetime' => 30 * 24 * 60 * 60,
            'path' => '/',
            'secure' => (bool) $config['cookie_secure'],
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }

    public static function validDisplayName(string $name): bool
    {
        $length = function_exists('mb_strlen') ? mb_strlen(trim($name), 'UTF-8') : strlen(trim($name));
        return $length >= 1 && $length <= 40;
    }

    public static function normalizeName(string $name): string
    {
        $trimmed = trim((string) preg_replace('/\s+/u', ' ', $name));
        return function_exists('mb_strtolower') ? mb_strtolower($trimmed, 'UTF-8') : strtolower($trimmed);
    }

    /** @return array{id:string,display_name:string}|null */
    public static function findByName(string $displayName): ?array
    {
        $stmt = Db::pdo()->prepare('SELECT id, display_name FROM app_users WHERE name_normalized = ?');
        $stmt->execute([self::normalizeName($displayName)]);
        $row = $stmt->fetch();
        return $row === false ? null : ['id' => $row['id'], 'display_name' => $row['display_name']];
    }

    /** @return array{id:string,display_name:string} */
    public static function createUser(string $displayName): array
    {
        $id = self::uuidV4();
        $trimmed = trim($displayName);
        $stmt = Db::pdo()->prepare(
            'INSERT INTO app_users (id, display_name, name_normalized, created_at) VALUES (?, ?, ?, NOW())',
        );
        $stmt->execute([$id, $trimmed, self::normalizeName($displayName)]);
        self::login($id);
        return ['id' => $id, 'display_name' => $trimmed];
    }

    /** @return array<int,array{id:string,display_name:string}> */
    public static function accounts(): array
    {
        $stmt = Db::pdo()->query(
            'SELECT id, display_name FROM app_users '
            . 'ORDER BY (last_active_at IS NULL), last_active_at DESC, created_at DESC LIMIT 100',
        );
        return array_map(
            static fn(array $row): array => ['id' => $row['id'], 'display_name' => $row['display_name']],
            $stmt->fetchAll(),
        );
    }

    public static function login(string $userId): void
    {
        session_regenerate_id(true);
        $_SESSION['user_id'] = $userId;
        $stmt = Db::pdo()->prepare('UPDATE app_users SET last_active_at = NOW() WHERE id = ?');
        $stmt->execute([$userId]);
    }

    /** @return array{id:string,display_name:string}|null */
    public static function current(): ?array
    {
        $userId = $_SESSION['user_id'] ?? null;
        if (!is_string($userId) || $userId === '') {
            return null;
        }
        $stmt = Db::pdo()->prepare('SELECT id, display_name FROM app_users WHERE id = ?');
        $stmt->execute([$userId]);
        $row = $stmt->fetch();
        if ($row === false) {
            unset($_SESSION['user_id']);
            return null;
        }
        return ['id' => $row['id'], 'display_name' => $row['display_name']];
    }

    /** @return array{id:string,display_name:string} */
    public static function requireUser(): array
    {
        $user = self::current();
        if ($user === null) {
            Http::send(401, ['error' => 'not_authenticated', 'messageFr' => 'Identifie-toi pour continuer.']);
        }
        return $user;
    }

    public static function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'],
                'domain' => $params['domain'],
                'secure' => $params['secure'],
                'httponly' => $params['httponly'],
                'samesite' => $params['samesite'] ?? 'Lax',
            ]);
        }
        session_destroy();
    }

    private static function uuidV4(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);
        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4)
            . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
    }
}
