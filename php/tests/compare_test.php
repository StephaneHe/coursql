<?php
declare(strict_types=1);

require __DIR__ . '/../api/lib/Compare.php';

$passed = 0;
$failed = 0;

function verdict(string $name, array $gotColumns, array $gotRows, array $expected, array $options, bool $want): void
{
    global $passed, $failed;
    $result = Compare::result($gotColumns, $gotRows, $expected, $options);
    if ($result['pass'] === $want) {
        $passed++;
        return;
    }
    $failed++;
    fwrite(STDERR, "ÉCHEC $name : " . json_encode($result, JSON_UNESCAPED_UNICODE) . PHP_EOL);
}

$unordered = ['orderSensitive' => false, 'compareColumnNames' => true];
$ordered = ['orderSensitive' => true, 'compareColumnNames' => true];
$namesIgnored = ['orderSensitive' => false, 'compareColumnNames' => false];

verdict('égalité simple', ['id'], [['1'], ['2']], ['columns' => ['id'], 'rows' => [['1'], ['2']]], $unordered, true);
verdict('ordre ignoré', ['id'], [['2'], ['1']], ['columns' => ['id'], 'rows' => [['1'], ['2']]], $unordered, true);
verdict('ordre imposé', ['id'], [['2'], ['1']], ['columns' => ['id'], 'rows' => [['1'], ['2']]], $ordered, false);
verdict('doublons comptés', ['id'], [['1'], ['1']], ['columns' => ['id'], 'rows' => [['1'], ['2']]], $unordered, false);
verdict('NULL égal NULL', ['v'], [[null]], ['columns' => ['v'], 'rows' => [[null]]], $unordered, true);
verdict('NULL distinct chaîne vide', ['v'], [['']], ['columns' => ['v'], 'rows' => [[null]]], $unordered, false);
verdict('NULL distinct zéro', ['v'], [['0']], ['columns' => ['v'], 'rows' => [[null]]], $unordered, false);
verdict('DECIMAL exact', ['amount'], [['5.50']], ['columns' => ['amount'], 'rows' => [['5.50']]], $unordered, true);
verdict('DECIMAL non arrondi', ['amount'], [['5.5']], ['columns' => ['amount'], 'rows' => [['5.50']]], $unordered, false);
verdict('nom colonne imposé', ['total'], [['1']], ['columns' => ['count'], 'rows' => [['1']]], $unordered, false);
verdict('nom colonne ignoré', ['total'], [['1']], ['columns' => ['count'], 'rows' => [['1']]], $namesIgnored, true);
verdict('nombre colonnes', ['a', 'b'], [['1', '2']], ['columns' => ['a'], 'rows' => [['1']]], $unordered, false);
verdict('nombre lignes', ['a'], [['1']], ['columns' => ['a'], 'rows' => [['1'], ['2']]], $unordered, false);

echo "Compare : $passed/" . ($passed + $failed) . " tests passés" . PHP_EOL;
exit($failed === 0 ? 0 : 1);
