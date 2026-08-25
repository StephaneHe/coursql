<?php
declare(strict_types=1);

require __DIR__ . '/../api/config.php';
require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../api/lib/Db.php';
require __DIR__ . '/../api/lib/Cards.php';
require __DIR__ . '/../api/lib/Compare.php';
require __DIR__ . '/../api/lib/Runner.php';
require __DIR__ . '/../api/lib/SqlErrors.php';
require __DIR__ . '/../api/lib/SqlGuard.php';

putenv('COURSQL_GUARD_LOG=0');
$config = coursql_config();
Db::init($config);
Cards::load($config['cards_path']);

$passed = 0;
foreach (Cards::ordered() as $card) {
    if ($card['kind'] !== 'sql') continue;
    $guarded = SqlGuard::process(
        $card['gating']['solutionSql'], 'read_only', Cards::tableMap($card, ''), false, $config['max_sql_len'],
    );
    if (!$guarded['ok']) throw new RuntimeException($card['slug'] . ' refusée par SqlGuard');
    $result = Runner::readOnly(Db::pdo(), $guarded['statements'][0], $config);
    $verdict = Compare::result($result['columns'], $result['rows'], $card['gating']['expected'], $card['gating']['compare']);
    if (!$verdict['pass']) throw new RuntimeException($card['slug'] . ' échoue : ' . ($verdict['reasonFr'] ?? ''));
    $passed++;
}

foreach ([
    ['C8', 'SELECT * FROM books WHERE year <= 1943'],
    ['C18', 'SELECT * FROM books ORDER BY year DESC'],
] as [$slug, $naiveSql]) {
    $card = Cards::get($slug);
    $guarded = SqlGuard::process($naiveSql, 'read_only', Cards::tableMap($card, ''), false);
    if (!$guarded['ok']) throw new RuntimeException("Variante $slug refusée au lieu d'être comparée");
    $result = Runner::readOnly(Db::pdo(), $guarded['statements'][0], $config);
    if (Compare::result($result['columns'], $result['rows'], $card['gating']['expected'], $card['gating']['compare'])['pass']) {
        throw new RuntimeException("La variante naïve $slug devrait échouer");
    }
}

try {
    Runner::readOnly(Db::pdo(), 'SELECT titre FROM seed_books', $config);
    throw new RuntimeException('Une colonne inconnue aurait dû échouer');
} catch (PDOException $error) {
    $mapped = SqlErrors::map($error);
    if ($mapped['category'] !== 'unknown_column' || !str_contains($mapped['messageFr'], 'Colonne inconnue')) {
        throw new RuntimeException('Mapping pédagogique de colonne inconnue invalide');
    }
}

foreach (['books', 'members', 'loans', 'fines', 'employees'] as $table) {
    $seed = Db::pdo()->query("SELECT * FROM seed_$table ORDER BY 1")->fetchAll(PDO::FETCH_NUM);
    $reference = Db::pdo()->query("SELECT * FROM seedref_$table ORDER BY 1")->fetchAll(PDO::FETCH_NUM);
    if ($seed !== $reference) throw new RuntimeException("Intégrité seed_$table compromise");
}

echo "Rejeu lecture seule : $passed/38 solutions passées" . PHP_EOL;
echo "Variantes naïves C8/C18 : échec attendu ; seeds intacts ; erreurs FR validées" . PHP_EOL;
