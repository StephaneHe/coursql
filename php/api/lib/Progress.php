<?php
declare(strict_types=1);

final class Progress
{
    /** @var array<int,array{slug:string,title:string,moduleSlug:string,moduleTitle:string}> */
    private static array $cards = [];

    public static function loadCardIndex(array $cards): void
    {
        if (count($cards) !== 50) {
            throw new RuntimeException('Index des cartes indisponible.');
        }
        self::$cards = array_map(static fn(array $card): array => [
            'slug' => $card['slug'],
            'title' => $card['title'],
            'moduleSlug' => $card['moduleSlug'],
            'moduleTitle' => $card['moduleTitle'],
        ], $cards);
    }

    /** @return array<string,array> */
    public static function map(string $userId): array
    {
        $stmt = Db::pdo()->prepare(
            'SELECT card_slug, status, hint_used, solution_viewed, attempts_count '
            . 'FROM app_progress WHERE user_id = ?',
        );
        $stmt->execute([$userId]);
        $map = [];
        foreach ($stmt->fetchAll() as $row) {
            $map[$row['card_slug']] = $row;
        }
        return $map;
    }

    /** @return array<int,array{slug:string,status:string,hint_used:bool,solution_viewed:bool,attempts_count:int}> */
    public static function compute(array $progress): array
    {
        $result = [];
        $previousValidated = true;
        foreach (self::$cards as $card) {
            $row = $progress[$card['slug']] ?? null;
            if ($row !== null && self::isValidated($row['status'])) {
                $status = $row['status'];
            } elseif ($previousValidated) {
                $status = $row !== null && $row['status'] === 'in_progress' ? 'in_progress' : 'available';
            } else {
                $status = 'locked';
            }
            $result[] = [
                'slug' => $card['slug'],
                'status' => $status,
                'hint_used' => (bool) ($row['hint_used'] ?? false),
                'solution_viewed' => (bool) ($row['solution_viewed'] ?? false),
                'attempts_count' => (int) ($row['attempts_count'] ?? 0),
            ];
            $previousValidated = self::isValidated($status);
        }
        return $result;
    }

    public static function statusOf(string $userId, string $slug): string
    {
        foreach (self::compute(self::map($userId)) as $card) {
            if ($card['slug'] === $slug) {
                return $card['status'];
            }
        }
        return 'locked';
    }

    public static function modules(string $userId): array
    {
        $computed = [];
        foreach (self::compute(self::map($userId)) as $card) {
            $computed[$card['slug']] = $card;
        }
        $modules = [];
        foreach (self::$cards as $card) {
            $key = $card['moduleSlug'];
            if (!isset($modules[$key])) {
                $modules[$key] = [
                    'moduleSlug' => $key,
                    'moduleTitle' => $card['moduleTitle'],
                    'cards' => [],
                ];
            }
            $state = $computed[$card['slug']];
            $modules[$key]['cards'][] = [
                'slug' => $card['slug'],
                'title' => $card['title'],
                'status' => $state['status'],
                'hint_used' => $state['hint_used'],
                'solution_viewed' => $state['solution_viewed'],
            ];
        }
        return array_values($modules);
    }

    public static function recordAttempt(
        string $userId,
        string $cardSlug,
        string $exerciseSlug,
        string $submittedSql,
        string $outcome,
        ?int $durationMs,
        ?string $errorCategory,
    ): void {
        $pdo = Db::pdo();
        $stmt = $pdo->prepare(
            'INSERT INTO app_attempts '
            . '(user_id, card_slug, exercise_slug, submitted_sql, outcome, duration_ms, error_category, submitted_at) '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
        );
        $stmt->execute([$userId, $cardSlug, $exerciseSlug, $submittedSql, $outcome, $durationMs, $errorCategory]);
        self::ensureRow($userId, $cardSlug);
        $stmt = $pdo->prepare(
            "UPDATE app_progress SET attempts_count = attempts_count + 1, last_attempt_at = NOW(), "
            . "status = CASE WHEN status IN ('validated','validated_after_hint') THEN status ELSE 'in_progress' END "
            . 'WHERE user_id = ? AND card_slug = ?',
        );
        $stmt->execute([$userId, $cardSlug]);
    }

    public static function markHintUsed(string $userId, string $cardSlug): void
    {
        self::ensureRow($userId, $cardSlug);
        $stmt = Db::pdo()->prepare('UPDATE app_progress SET hint_used = 1 WHERE user_id = ? AND card_slug = ?');
        $stmt->execute([$userId, $cardSlug]);
    }

    public static function markSolutionViewed(string $userId, string $cardSlug): void
    {
        self::ensureRow($userId, $cardSlug);
        $stmt = Db::pdo()->prepare('UPDATE app_progress SET solution_viewed = 1 WHERE user_id = ? AND card_slug = ?');
        $stmt->execute([$userId, $cardSlug]);
    }

    public static function validateCard(string $userId, string $cardSlug): void
    {
        self::ensureRow($userId, $cardSlug);
        $stmt = Db::pdo()->prepare(
            "UPDATE app_progress SET status = CASE WHEN hint_used = 1 THEN 'validated_after_hint' ELSE 'validated' END, "
            . 'first_validated_at = COALESCE(first_validated_at, NOW()) WHERE user_id = ? AND card_slug = ?',
        );
        $stmt->execute([$userId, $cardSlug]);
    }

    private static function isValidated(?string $status): bool
    {
        return $status === 'validated' || $status === 'validated_after_hint';
    }

    private static function ensureRow(string $userId, string $cardSlug): void
    {
        $stmt = Db::pdo()->prepare(
            "INSERT IGNORE INTO app_progress (user_id, card_slug, status) VALUES (?, ?, 'in_progress')",
        );
        $stmt->execute([$userId, $cardSlug]);
    }
}
