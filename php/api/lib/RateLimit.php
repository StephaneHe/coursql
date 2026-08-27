<?php
declare(strict_types=1);

/**
 * Limiteur de débit à fenêtre fixe, adossé à l'unique base MySQL (table app_rate_limit).
 *
 * Contrainte OVH mutualisé : pas de processus PHP persistant, ni APCu/Redis garanti. Le compteur
 * vit donc dans la seule base que l'application possède déjà. Une ligne par « bucket »
 * (portée + client), remise à zéro atomiquement au basculement de fenêtre via un UPSERT unique.
 *
 * Le limiteur échoue en mode « ouvert » : une panne du compteur ne doit jamais empêcher l'usage
 * normal de l'application.
 */
final class RateLimit
{
    /**
     * Comptabilise ce hit dans le bucket et renvoie HTTP 429 si le quota est dépassé.
     * Au plus $limit requêtes par $windowSeconds pour une même clé (portée + identité).
     */
    public static function enforce(
        string $scope,
        string $identity,
        int $limit,
        int $windowSeconds,
        string $messageFr,
    ): void {
        $now = time();
        $windowSeconds = max(1, $windowSeconds);
        $windowStart = $now - ($now % $windowSeconds);
        // Identité hachée : borne la longueur de clé et évite de stocker l'IP en clair.
        $key = substr($scope . ':' . hash('sha256', $identity), 0, 160);

        try {
            $pdo = Db::pdo();
            // UPSERT atomique. VALUES(window_start) vaut toujours la fenêtre courante :
            //  - même fenêtre  -> hits + 1 ;
            //  - fenêtre échue -> hits remis à 1 et window_start avancé.
            $upsert = $pdo->prepare(
                'INSERT INTO app_rate_limit (bucket_key, window_start, hits) '
                . 'VALUES (:k, FROM_UNIXTIME(:w), 1) '
                . 'ON DUPLICATE KEY UPDATE '
                . 'hits = IF(window_start = VALUES(window_start), hits + 1, 1), '
                . 'window_start = VALUES(window_start)',
            );
            $upsert->execute([':k' => $key, ':w' => $windowStart]);
            $read = $pdo->prepare('SELECT hits FROM app_rate_limit WHERE bucket_key = ?');
            $read->execute([$key]);
            $hits = (int) $read->fetchColumn();
        } catch (Throwable $error) {
            error_log('[coursql][ratelimit] compteur indisponible (' . $error::class . ')');
            return; // fail-open
        }

        self::maybeSweep();

        if ($hits > $limit) {
            $retryAfter = max(1, ($windowStart + $windowSeconds) - $now);
            header('Retry-After: ' . $retryAfter);
            Http::send(429, [
                'error' => 'rate_limited',
                'messageFr' => $messageFr,
                'retry_after' => $retryAfter,
            ]);
        }
    }

    /**
     * IP du client. On s'appuie sur REMOTE_ADDR, fixé par le serveur web et non falsifiable par le
     * client (contrairement à X-Forwarded-For) ; sur le mutualisé OVH il porte déjà l'IP réelle.
     */
    public static function clientIp(): string
    {
        $remote = $_SERVER['REMOTE_ADDR'] ?? '';
        return is_string($remote) && $remote !== '' ? $remote : '0.0.0.0';
    }

    /**
     * Purge opportuniste des lignes périmées (appelée rarement, en dehors du chemin critique).
     * Probabiliste pour ne pas ajouter de coût à chaque requête.
     */
    public static function maybeSweep(int $olderThanSeconds = 3600): void
    {
        if (random_int(1, 200) !== 1) {
            return;
        }
        try {
            $stmt = Db::pdo()->prepare(
                'DELETE FROM app_rate_limit WHERE window_start < (NOW() - INTERVAL ? SECOND)',
            );
            $stmt->execute([max(60, $olderThanSeconds)]);
        } catch (Throwable) {
            // sans conséquence
        }
    }
}
