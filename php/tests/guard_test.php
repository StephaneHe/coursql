<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../api/lib/SqlGuard.php';

putenv('COURSQL_GUARD_LOG=0');

$seed = [
    'books' => 'seed_books',
    'members' => 'seed_members',
    'loans' => 'seed_loans',
    'fines' => 'seed_fines',
    'employees' => 'seed_employees',
];
$todo = ['todo' => 'wk_a46e0114_c42_todo'];
$products = ['produits' => 'wk_a46e0114_c46_produits'];
$users = ['utilisateurs' => 'wk_a46e0114_c48_utilisateurs'];
$catalogue = ['catalogue' => 'wk_a46e0114_c49_catalogue'];

$passed = 0;
$failed = 0;
function guardCase(string $label, string $sql, string $permission, array $map, bool $multi, bool $wantOk, ?string $contains = null): void
{
    global $passed, $failed;
    $result = SqlGuard::process($sql, $permission, $map, $multi);
    $ok = ($result['ok'] ?? false) === $wantOk;
    if ($ok && $wantOk && $contains !== null) {
        $ok = str_contains(implode(' ', $result['statements']), $contains);
    }
    if ($ok) {
        $passed++;
        return;
    }
    $failed++;
    fwrite(STDERR, "ÉCHEC $label : " . json_encode($result, JSON_UNESCAPED_UNICODE) . PHP_EOL);
}

$legitimate = [
    ['SELECT * FROM members', 'read_only', $seed, false, 'seed_members'],
    ["SELECT * FROM books WHERE author='Victor Hugo'", 'read_only', $seed, false, 'seed_books'],
    ['SELECT members.name, loans.book_id FROM members INNER JOIN loans ON members.id=loans.member_id', 'read_only', $seed, false, 'seed_loans'],
    ['SELECT e.name, m.name FROM employees e INNER JOIN employees m ON e.manager_id=m.id', 'read_only', $seed, false, 'seed_employees'],
    ['SELECT * FROM members WHERE NOT EXISTS (SELECT 1 FROM loans WHERE loans.member_id=members.id)', 'read_only', $seed, false, 'seed_members.id'],
    ['WITH counts AS (SELECT member_id, COUNT(*) AS nb FROM loans GROUP BY member_id) SELECT member_id, nb FROM counts WHERE nb > 1', 'read_only', $seed, false, 'seed_loans'],
    ['SELECT id FROM books EXCEPT SELECT book_id FROM loans', 'read_only', $seed, false, 'seed_books'],
    ["INSERT INTO todo (id,label,done) VALUES (3,'x',0)", 'dml', $todo, false, 'wk_a46e0114_c42_todo'],
    ['UPDATE todo SET done=1 WHERE id=1', 'dml', $todo, false, 'wk_a46e0114_c42_todo'],
    ['DELETE FROM todo WHERE id=2', 'dml', $todo, false, 'wk_a46e0114_c42_todo'],
    ["START TRANSACTION; INSERT INTO todo (id,label,done) VALUES (3,'x',0); COMMIT;", 'dml', $todo, true, 'wk_a46e0114_c42_todo'],
    ['CREATE TABLE produits (id INT PRIMARY KEY, nom VARCHAR(50))', 'ddl', $products, false, 'wk_a46e0114_c46_produits'],
    ['ALTER TABLE produits ADD COLUMN prix DECIMAL(6,2)', 'ddl', $products, false, 'wk_a46e0114_c46_produits'],
    ['CREATE TABLE utilisateurs (id INT PRIMARY KEY, email VARCHAR(80) NOT NULL)', 'ddl', $users, false, 'wk_a46e0114_c48_utilisateurs'],
    ['CREATE INDEX idx_annee ON catalogue (annee)', 'ddl', $catalogue, false, 'wk_a46e0114_c49_catalogue'],
    ['SELECT /* commentaire ordinaire */ `TITLE` FROM `BOOKS`', 'read_only', $seed, false, 'seed_books'],
];
foreach ($legitimate as $index => [$sql, $permission, $map, $multi, $contains]) {
    guardCase('L' . ($index + 1), $sql, $permission, $map, $multi, true, $contains);
}

$officialCards = json_decode(
    file_get_contents(__DIR__ . '/../../private_coursql/cards.json'),
    true,
    64,
    JSON_THROW_ON_ERROR,
);
$officialCount = 0;
foreach ($officialCards as $card) {
    if ($card['kind'] === 'quiz') continue;
    $prefix = 'wk_a46e0114_' . strtolower($card['slug']);
    $cardMap = $card['kind'] === 'sql'
        ? $seed
        : array_combine(
            $card['logicalTables'],
            array_map(static fn(string $name): string => $prefix . '_' . $name, $card['logicalTables']),
        );
    guardCase(
        'solution officielle ' . $card['slug'],
        $card['gating']['solutionSql'],
        $card['permissions'],
        $cardMap,
        $card['allowMultiStatement'],
        true,
    );
    $officialCount++;
}

// Les 20 familles d'évasion documentées dans PLAN_PHP_PORT.md §3.4.
$attacks = [
    ['A01 app_users', 'SELECT * FROM app_users', 'read_only', $seed, false],
    ['A02 progression', "UPDATE app_progress SET status='validated'", 'dml', $todo, false],
    ['A03 drop app', 'DROP TABLE app_users', 'ddl', $products, false],
    ['A04 autre apprenant', 'SELECT * FROM wk_ffff1111_c42_todo', 'dml', $todo, false],
    ['A05 multi-instructions', 'SELECT 1; DROP TABLE app_users', 'read_only', $seed, false],
    ['A06 commentaire exécutable', '/*!50000 DROP */ TABLE produits', 'ddl', $products, false],
    ['A07 SQL dynamique', "PREPARE s FROM 'DROP TABLE app_users'; EXECUTE s", 'dml', $todo, true],
    ['A08 vue', 'CREATE VIEW v AS SELECT * FROM app_users', 'ddl', $products, false],
    ['A09 routine', 'CREATE TRIGGER t BEFORE INSERT ON produits FOR EACH ROW SET @x=1', 'ddl', $products, false],
    ['A10 fichier', "SELECT * FROM books INTO OUTFILE '/tmp/x'", 'read_only', $seed, false],
    ['A11 information_schema', 'SELECT * FROM information_schema.tables', 'read_only', $seed, false],
    ['A12 cross-schema', 'SELECT * FROM autrebase.books', 'read_only', $seed, false],
    ['A13 union interdite', "SELECT * FROM books UNION SELECT id,display_name,'','' FROM app_users", 'read_only', $seed, false],
    ['A14 sommeil', 'SELECT SLEEP(10)', 'read_only', $seed, false],
    ['A15 variables système', 'SELECT @@datadir', 'read_only', $seed, false],
    ['A16 rename', 'RENAME TABLE produits TO app_users', 'ddl', $products, false],
    ['A17 corruption seed', 'UPDATE books SET year=0', 'read_only', $seed, false],
    ['A18 collision physique', 'CREATE TABLE wk_a46e0114_c46_produits (id INT)', 'ddl', $products, false],
    ['A19 backquotes/casse', 'SELECT * FROM `App_Users`', 'read_only', $seed, false],
    ['A20 unicode', "SELECT\u{00A0}* FROM books", 'read_only', $seed, false],
];
foreach ($attacks as [$label, $sql, $permission, $map, $multi]) {
    guardCase($label, $sql, $permission, $map, $multi, false);
}

$extras = [
    ['LOAD_FILE', "SELECT LOAD_FILE('/etc/passwd')", 'read_only', $seed, false],
    ['mysql.user', 'SELECT * FROM mysql.user', 'read_only', $seed, false],
    ['GET_LOCK', "SELECT GET_LOCK('x',10)", 'read_only', $seed, false],
    ['BENCHMARK', 'SELECT BENCHMARK(1000000,1+1)', 'read_only', $seed, false],
    ['DROP DATABASE', 'DROP DATABASE coursql_php_test', 'ddl', $products, false],
    ['WITH UPDATE', 'WITH x AS (SELECT id FROM todo) UPDATE todo SET done=1', 'dml', $todo, false],
    ['derived escape', 'SELECT * FROM (SELECT 1) x, app_users', 'read_only', $seed, false],
    ['transaction hors C45', 'COMMIT', 'dml', $todo, false],
];
foreach ($extras as [$label, $sql, $permission, $map, $multi]) {
    guardCase('X ' . $label, $sql, $permission, $map, $multi, false);
}

echo 'SqlGuard requêtes légitimes ciblées : ' . count($legitimate) . PHP_EOL;
echo "SqlGuard solutions officielles : $officialCount" . PHP_EOL;
echo 'SqlGuard attaques documentées testées : ' . count($attacks) . PHP_EOL;
echo 'SqlGuard attaques supplémentaires testées : ' . count($extras) . PHP_EOL;
echo "Total assertions : $passed/" . ($passed + $failed) . PHP_EOL;
exit($failed === 0 ? 0 : 1);
