<?php
declare(strict_types=1);

/** Charge le contenu privé et n'en expose qu'une projection explicitement sûre. */
final class Cards
{
    private static array $ordered = [];
    private static array $bySlug = [];

    public static function load(string $path): void
    {
        $raw = file_get_contents($path);
        if ($raw === false) {
            throw new RuntimeException('Contenu des cartes introuvable.');
        }
        try {
            $cards = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new RuntimeException('Contenu des cartes invalide.');
        }
        if (!is_array($cards) || count($cards) !== 50) {
            throw new RuntimeException('Le catalogue doit contenir 50 cartes.');
        }
        usort($cards, static fn(array $a, array $b): int => $a['position'] <=> $b['position']);
        $bySlug = [];
        foreach ($cards as $card) {
            $slug = $card['slug'] ?? null;
            if (!is_string($slug) || isset($bySlug[$slug]) || !isset($card['gating'])) {
                throw new RuntimeException('Catalogue de cartes incohérent.');
            }
            $bySlug[$slug] = $card;
        }
        self::$ordered = $cards;
        self::$bySlug = $bySlug;
    }

    /** @return array<int,array> */
    public static function ordered(): array
    {
        return self::$ordered;
    }

    public static function get(string $slug): ?array
    {
        return self::$bySlug[$slug] ?? null;
    }

    public static function nextSlug(string $slug): ?string
    {
        foreach (self::$ordered as $index => $card) {
            if ($card['slug'] === $slug) {
                return self::$ordered[$index + 1]['slug'] ?? null;
            }
        }
        return null;
    }

    /** Mapping logique -> physique utilisé plus tard par SqlGuard. */
    public static function tableMap(array $card, string $workPrefix): array
    {
        $map = [];
        if ($card['kind'] === 'sql') {
            foreach ($card['logicalTables'] as $name) {
                $map[strtolower($name)] = 'seed_' . strtolower($name);
            }
        } elseif ($card['kind'] === 'mutation') {
            foreach ($card['logicalTables'] as $name) {
                $map[strtolower($name)] = $workPrefix . '_' . strtolower($name);
            }
        }
        return $map;
    }

    /** Projection publique : aucune solution, expected, SQL caché ni correctIndex. */
    public static function publicCard(array $card): array
    {
        $gating = $card['gating'];
        if ($gating['kind'] === 'quiz') {
            $publicGating = [
                'kind' => 'quiz',
                'questionFr' => $gating['questionFr'],
                'options' => $gating['options'],
                'hintCount' => count($gating['hints']),
            ];
        } else {
            $publicGating = [
                'kind' => $gating['kind'] === 'mutation' ? 'mutation' : 'sql',
                'hintCount' => count($gating['hints']),
            ];
        }
        return [
            'slug' => $card['slug'],
            'moduleSlug' => $card['moduleSlug'],
            'moduleTitle' => $card['moduleTitle'],
            'position' => $card['position'],
            'title' => $card['title'],
            'conceptSlug' => $card['conceptSlug'],
            'prerequisites' => $card['prerequisites'] ?? [],
            'explanationFr' => $card['explanationFr'],
            'exampleSql' => $card['exampleSql'] ?? null,
            'exampleResultFr' => $card['exampleResultFr'] ?? null,
            'statementFr' => $card['statementFr'],
            'tables' => $card['tables'] ?? [],
            'gating' => $publicGating,
            'practice' => $card['practice'] ?? [],
        ];
    }
}
