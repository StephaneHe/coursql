<?php
declare(strict_types=1);

final class Auth
{
    // Hash bcrypt valide, utilisé pour égaliser le temps de réponse quand le nom est inconnu
    // (on exécute quand même une vérification, pour ne pas révéler l'existence d'un profil).
    private const DUMMY_HASH = '$2y$10$WH5N5VcN/khv81n9HiD1UucZ.BhtmMDUs3bIDRzGHRHZX4cAHGdqe';

    public static function start(array $config): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        // Keep session files in a private, app-owned directory (outside the webroot) so the shared
        // host's global session GC — often a 24-minute gc_maxlifetime — cannot delete our long-lived
        // sessions. Falls back to the default save path if the directory cannot be created.
        $sessionPath = (string) ($config['session_path'] ?? '');
        if ($sessionPath !== '') {
            if (!is_dir($sessionPath)) {
                @mkdir($sessionPath, 0700, true);
            }
            if (is_dir($sessionPath) && is_writable($sessionPath)) {
                session_save_path($sessionPath);
                ini_set('session.save_path', $sessionPath);
            }
        }
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.cookie_samesite', 'Lax');
        // 30-day sessions: GC lifetime and cookie lifetime kept coherent so a logged-in learner
        // stays connected for ~a month without re-authenticating.
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

    /** Politique de mot de passe : au moins 4 caractères, borné pour éviter les abus. */
    public static function validPassword(string $password): bool
    {
        $length = function_exists('mb_strlen') ? mb_strlen($password, 'UTF-8') : strlen($password);
        return $length >= 4 && $length <= 128;
    }

    /** Hash de mot de passe (bcrypt par défaut ; argon2id si la plateforme le fournit). */
    public static function hashPassword(string $password): string
    {
        return password_hash($password, PASSWORD_DEFAULT);
    }

    /** @return array{id:string,display_name:string}|null */
    public static function findByName(string $displayName): ?array
    {
        $stmt = Db::pdo()->prepare('SELECT id, display_name FROM app_users WHERE name_normalized = ?');
        $stmt->execute([self::normalizeName($displayName)]);
        $row = $stmt->fetch();
        return $row === false ? null : ['id' => $row['id'], 'display_name' => $row['display_name']];
    }

    /**
     * Vérifie identifiants + mot de passe. Renvoie le profil si et seulement si le mot de passe est
     * correct ; sinon null. Message d'erreur volontairement générique côté appelant (pas d'énumération).
     * @return array{id:string,display_name:string}|null
     */
    public static function verifyLogin(string $displayName, string $password): ?array
    {
        $stmt = Db::pdo()->prepare(
            'SELECT id, display_name, password_hash FROM app_users WHERE name_normalized = ?',
        );
        $stmt->execute([self::normalizeName($displayName)]);
        $row = $stmt->fetch();

        if ($row === false || !is_string($row['password_hash'] ?? null) || $row['password_hash'] === '') {
            // Vérification factice : même coût qu'un vrai verify, ne révèle pas l'absence de profil.
            password_verify($password, self::DUMMY_HASH);
            return null;
        }
        if (!password_verify($password, $row['password_hash'])) {
            return null;
        }
        return ['id' => $row['id'], 'display_name' => $row['display_name']];
    }

    public static function getPasswordHash(string $userId): ?string
    {
        $stmt = Db::pdo()->prepare('SELECT password_hash FROM app_users WHERE id = ?');
        $stmt->execute([$userId]);
        $hash = $stmt->fetchColumn();
        return is_string($hash) && $hash !== '' ? $hash : null;
    }

    public static function updatePassword(string $userId, string $passwordHash): void
    {
        $stmt = Db::pdo()->prepare('UPDATE app_users SET password_hash = ? WHERE id = ?');
        $stmt->execute([$passwordHash, $userId]);
    }

    /** @return array{id:string,display_name:string} */
    public static function createUser(string $displayName, string $passwordHash): array
    {
        $id = self::uuidV4();
        $trimmed = trim($displayName);
        $stmt = Db::pdo()->prepare(
            'INSERT INTO app_users (id, display_name, name_normalized, password_hash, created_at) '
            . 'VALUES (?, ?, ?, ?, NOW())',
        );
        $stmt->execute([$id, $trimmed, self::normalizeName($displayName), $passwordHash]);
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
