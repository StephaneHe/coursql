<?php
declare(strict_types=1);

final class WorkspaceBusy extends RuntimeException
{
}

final class Workspace
{
    public static function prefix(string $userId, string $cardSlug): string
    {
        if (!preg_match('/^[A-Fa-f0-9-]{36}$/', $userId) || !preg_match('/^C(?:4[2-9])$/', strtoupper($cardSlug))) {
            throw new InvalidArgumentException('Identifiant de workspace invalide.');
        }
        return 'wk_' . substr(hash('sha256', $userId), 0, 8) . '_' . strtolower($cardSlug);
    }

    /** @return array<string,string> */
    public static function tableMap(string $userId, array $card): array
    {
        return Cards::tableMap($card, self::prefix($userId, $card['slug']));
    }

    /** Reset public appelé par la route dédiée. */
    public static function reset(string $userId, array $card): void
    {
        $prefix = self::prefix($userId, $card['slug']);
        [$lockKey, $holder] = self::acquire($prefix);
        try {
            self::resetLocked(Db::pdo(), $userId, $card);
        } finally {
            self::release($lockKey, $holder);
        }
    }

    /**
     * Reset, exécution apprenant sur PDO A, fermeture de A, vérification cachée sur PDO B.
     * @param array<int,string> $learnerStatements SQL déjà contrôlé/réécrit par SqlGuard
     * @return array{columns:array<int,string>,rows:array<int,array<int,mixed>>,truncated:bool}
     */
    public static function execute(
        string $userId,
        array $card,
        array $learnerStatements,
        array $config,
    ): array {
        $prefix = self::prefix($userId, $card['slug']);
        [$lockKey, $holder] = self::acquire($prefix);
        try {
            self::resetLocked(Db::pdo(), $userId, $card);

            $pdoA = Db::fresh();
            $statement = null;
            try {
                set_time_limit((int) ceil(((int) $config['query_timeout_ms']) / 1000) + 3);
                foreach ($learnerStatements as $sql) {
                    $statement = $pdoA->query($sql);
                    $statement->closeCursor();
                    $statement = null;
                }
            } finally {
                $statement = null;
                // Critique pour C45 : une transaction non COMMIT est annulée à la fermeture.
                $pdoA = null;
            }

            $pdoB = Db::fresh();
            try {
                return self::verify($pdoB, $userId, $card, $config);
            } finally {
                $pdoB = null;
            }
        } finally {
            self::release($lockKey, $holder);
        }
    }

    /** Suppression ciblée des workspaces connus d'un utilisateur (CLI de GC/tests uniquement). */
    public static function dropUserWorkspaces(string $userId, array $cards): void
    {
        foreach ($cards as $card) {
            if (($card['kind'] ?? '') !== 'mutation') continue;
            foreach (self::tableMap($userId, $card) as $physical) {
                Db::pdo()->exec('DROP TABLE IF EXISTS ' . self::quoteIdentifier($physical));
            }
        }
    }

    private static function resetLocked(PDO $pdo, string $userId, array $card): void
    {
        $map = self::tableMap($userId, $card);
        foreach ($map as $physical) {
            $pdo->exec('DROP TABLE IF EXISTS ' . self::quoteIdentifier($physical));
        }

        $gating = $card['gating'];
        foreach ([['schemaSql', 'ddl'], ['seedSql', 'dml']] as [$field, $permission]) {
            $sql = trim((string) ($gating[$field] ?? ''));
            if ($sql === '') continue;
            $guarded = SqlGuard::process($sql, $permission, $map, true, 20000);
            if (!$guarded['ok']) {
                throw new LogicException('SQL interne de workspace refusé : ' . $field . '/' . $guarded['category']);
            }
            foreach ($guarded['statements'] as $statement) {
                $pdo->query($statement)->closeCursor();
            }
        }
    }

    /** @return array{columns:array<int,string>,rows:array<int,array<int,mixed>>,truncated:bool} */
    private static function verify(PDO $pdo, string $userId, array $card, array $config): array
    {
        $map = self::tableMap($userId, $card);
        $slug = strtoupper($card['slug']);
        if (in_array($slug, ['C46', 'C47', 'C48', 'C49'], true)) {
            $logical = match ($slug) {
                'C46', 'C47' => 'produits',
                'C48' => 'utilisateurs',
                'C49' => 'catalogue',
            };
            $physical = $map[$logical];
            $sql = match ($slug) {
                'C46', 'C47' => 'SELECT column_name, data_type FROM information_schema.columns '
                    . 'WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position',
                'C48' => 'SELECT column_name, is_nullable FROM information_schema.columns '
                    . 'WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position',
                'C49' => "SELECT index_name, column_name FROM information_schema.statistics "
                    . "WHERE table_schema = DATABASE() AND table_name = ? AND index_name = 'idx_annee'",
            };
            $statement = $pdo->prepare($sql);
            $statement->execute([$physical]);
            return Runner::collect($statement, (int) $config['max_rows']);
        }

        $guarded = SqlGuard::process($card['gating']['verifySql'], 'dml', $map, false, 20000);
        if (!$guarded['ok']) {
            throw new LogicException('SQL interne de vérification refusé.');
        }
        return Runner::readOnly($pdo, $guarded['statements'][0], $config);
    }

    /** @return array{0:string,1:string} */
    private static function acquire(string $prefix): array
    {
        if (!preg_match('/^wk_([a-f0-9]{8})_(c4[2-9])$/', $prefix, $parts)) {
            throw new LogicException('Clé de verrou interne invalide.');
        }
        $lockKey = 'wk:' . $parts[1] . ':' . $parts[2];
        $holder = bin2hex(random_bytes(32));
        $upsert = Db::pdo()->prepare(
            'INSERT INTO app_locks (lock_key, holder, acquired_at) VALUES (?, ?, NOW()) '
            . 'ON DUPLICATE KEY UPDATE '
            . 'holder = IF(acquired_at < NOW() - INTERVAL 30 SECOND, VALUES(holder), holder), '
            . 'acquired_at = IF(acquired_at < NOW() - INTERVAL 30 SECOND, VALUES(acquired_at), acquired_at)',
        );
        $read = Db::pdo()->prepare('SELECT holder FROM app_locks WHERE lock_key = ?');
        for ($attempt = 0; $attempt < 20; $attempt++) {
            $upsert->execute([$lockKey, $holder]);
            $read->execute([$lockKey]);
            if ($read->fetchColumn() === $holder) {
                return [$lockKey, $holder];
            }
            usleep(50_000);
        }
        throw new WorkspaceBusy('Workspace occupé.');
    }

    private static function release(string $lockKey, string $holder): void
    {
        $stmt = Db::pdo()->prepare('DELETE FROM app_locks WHERE lock_key = ? AND holder = ?');
        $stmt->execute([$lockKey, $holder]);
    }

    private static function quoteIdentifier(string $identifier): string
    {
        if (!preg_match('/^wk_[a-f0-9]{8}_c4[2-9]_[a-z][a-z0-9_]*$/', $identifier) || strlen($identifier) > 64) {
            throw new LogicException('Nom physique interne invalide.');
        }
        return '`' . $identifier . '`';
    }
}
