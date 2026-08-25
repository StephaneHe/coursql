<?php
declare(strict_types=1);

/** Comparaison sur le résultat observable : multiensemble par défaut, doublons comptés, NULL distinct. */
final class Compare
{
    private const NULL_SENTINEL = "\x00NULL";

    /**
     * @param array<int,string> $gotColumns
     * @param array<int,array<int,mixed>> $gotRows
     * @param array{columns:array<int,string>,rows:array<int,array<int,mixed>>} $expected
     * @param array{orderSensitive:bool,compareColumnNames:bool} $options
     * @return array{pass:bool,reasonFr?:string}
     */
    public static function result(array $gotColumns, array $gotRows, array $expected, array $options): array
    {
        $expectedColumns = $expected['columns'];
        $expectedRows = $expected['rows'];

        if (count($gotColumns) !== count($expectedColumns)) {
            return [
                'pass' => false,
                'reasonFr' => 'Nombre de colonnes différent : tu en affiches ' . count($gotColumns)
                    . ', il en faut ' . count($expectedColumns) . '.',
            ];
        }

        if ($options['compareColumnNames']) {
            foreach ($expectedColumns as $index => $expectedName) {
                if (($gotColumns[$index] ?? null) !== $expectedName) {
                    return [
                        'pass' => false,
                        'reasonFr' => 'Nom de colonne inattendu en position ' . ($index + 1) . ' : « '
                            . ($gotColumns[$index] ?? '') . ' » (attendu « ' . $expectedName . ' »).',
                    ];
                }
            }
        }

        if (count($gotRows) !== count($expectedRows)) {
            return [
                'pass' => false,
                'reasonFr' => 'Nombre de lignes différent : tu obtiens ' . count($gotRows)
                    . ' ligne(s), il en faut ' . count($expectedRows) . '.',
            ];
        }

        $gotKeys = array_map([self::class, 'rowKey'], $gotRows);
        $expectedKeys = array_map([self::class, 'rowKey'], $expectedRows);
        if ($options['orderSensitive']) {
            foreach ($gotKeys as $index => $key) {
                if ($key !== $expectedKeys[$index]) {
                    return ['pass' => false, 'reasonFr' => 'La ligne ' . ($index + 1) . " ne correspond pas à l'ordre attendu."];
                }
            }
        } else {
            sort($gotKeys, SORT_STRING);
            sort($expectedKeys, SORT_STRING);
            if ($gotKeys !== $expectedKeys) {
                return ['pass' => false, 'reasonFr' => 'Le contenu des lignes ne correspond pas au résultat attendu.'];
            }
        }

        return ['pass' => true];
    }

    private static function cell(mixed $value): string
    {
        return $value === null ? self::NULL_SENTINEL : (string) $value;
    }

    private static function rowKey(array $row): string
    {
        return implode("\x01", array_map([self::class, 'cell'], array_values($row)));
    }
}
