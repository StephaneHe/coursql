<?php
declare(strict_types=1);

require __DIR__ . '/../api/config.php';
require __DIR__ . '/../vendor/autoload.php';
foreach (['Db', 'Cards', 'Compare', 'Runner', 'SqlGuard', 'Progress', 'Workspace'] as $lib) {
    require __DIR__ . '/../api/lib/' . $lib . '.php';
}

putenv('COURSQL_GUARD_LOG=0');
$config = coursql_config();
Db::init($config);
Cards::load($config['cards_path']);
Progress::loadCardIndex(Cards::ordered());

function testUuid(): string
{
    $hex = bin2hex(random_bytes(16));
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-4' . substr($hex, 13, 3)
        . '-a' . substr($hex, 17, 3) . '-' . substr($hex, 20);
}

function insertTestUser(string $id, string $name): void
{
    $stmt = Db::pdo()->prepare(
        'INSERT INTO app_users (id, display_name, name_normalized, created_at) VALUES (?, ?, ?, NOW())',
    );
    $stmt->execute([$id, $name, strtolower($name)]);
}

function cleanupTestUser(string $id): void
{
    Workspace::dropUserWorkspaces($id, Cards::ordered());
    foreach (['app_attempts', 'app_progress'] as $table) {
        $stmt = Db::pdo()->prepare("DELETE FROM $table WHERE user_id = ?");
        $stmt->execute([$id]);
    }
    $stmt = Db::pdo()->prepare('DELETE FROM app_users WHERE id = ?');
    $stmt->execute([$id]);
}

function executeCard(string $userId, array $card, array $config): array
{
    $gating = $card['gating'];
    if ($card['kind'] === 'quiz') return ['pass' => true, 'submitted' => 'choice:' . $gating['correctIndex']];
    $map = $card['kind'] === 'sql' ? Cards::tableMap($card, '') : Workspace::tableMap($userId, $card);
    $guarded = SqlGuard::process(
        $gating['solutionSql'], $card['permissions'], $map, $card['allowMultiStatement'], $config['max_sql_len'],
    );
    if (!$guarded['ok']) throw new RuntimeException($card['slug'] . ' refusée : ' . $guarded['category']);
    $result = $card['kind'] === 'sql'
        ? Runner::readOnly(Db::pdo(), $guarded['statements'][0], $config)
        : Workspace::execute($userId, $card, $guarded['statements'], $config);
    $verdict = Compare::result($result['columns'], $result['rows'], $gating['expected'], $gating['compare']);
    return ['pass' => $verdict['pass'], 'submitted' => $gating['solutionSql'], 'result' => $result];
}

$userA = testUuid();
$userB = testUuid();
insertTestUser($userA, 'Replay-A-' . substr($userA, 0, 6));
insertTestUser($userB, 'Replay-B-' . substr($userB, 0, 6));
$passed = 0;
try {
    foreach (Cards::ordered() as $card) {
        $status = Progress::statusOf($userA, $card['slug']);
        if (!in_array($status, ['available', 'in_progress'], true)) {
            throw new RuntimeException($card['slug'] . " non accessible ($status)");
        }
        $execution = executeCard($userA, $card, $config);
        if (!$execution['pass']) throw new RuntimeException($card['slug'] . ' échoue avec sa solution');
        Progress::recordAttempt(
            $userA, $card['slug'], $card['gatingExerciseSlug'], $execution['submitted'], 'pass', 0, null,
        );
        Progress::validateCard($userA, $card['slug']);
        $passed++;
    }

    $c43 = Cards::get('C43');
    $bad43 = SqlGuard::process('UPDATE todo SET done=1', 'dml', Workspace::tableMap($userA, $c43), false);
    $state43 = Workspace::execute($userA, $c43, $bad43['statements'], $config);
    if (Compare::result($state43['columns'], $state43['rows'], $c43['gating']['expected'], $c43['gating']['compare'])['pass']) {
        throw new RuntimeException('C43 sans WHERE devrait échouer');
    }

    $c45 = Cards::get('C45');
    $withoutCommit = 'START TRANSACTION; INSERT INTO todo (id,label,done) VALUES (3,\'sans commit\',0);';
    $bad45 = SqlGuard::process($withoutCommit, 'dml', Workspace::tableMap($userA, $c45), true);
    $state45 = Workspace::execute($userA, $c45, $bad45['statements'], $config);
    if (Compare::result($state45['columns'], $state45['rows'], $c45['gating']['expected'], $c45['gating']['compare'])['pass']) {
        throw new RuntimeException('C45 sans COMMIT devrait échouer');
    }

    $c42 = Cards::get('C42');
    $runB = executeCard($userB, $c42, $config);
    if (!$runB['pass']) throw new RuntimeException('C42 utilisateur B échoue');
    $tableA = Workspace::tableMap($userA, $c42)['todo'];
    $tableB = Workspace::tableMap($userB, $c42)['todo'];
    if ($tableA === $tableB) throw new RuntimeException('Collision de namespaces utilisateurs');
    foreach ([$tableA, $tableB] as $physical) {
        $stmt = Db::pdo()->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?');
        $stmt->execute([$physical]);
        if ((int) $stmt->fetchColumn() !== 1) throw new RuntimeException('Table physique isolée absente');
    }

    Workspace::reset($userA, $c42);
    $count = Db::pdo()->query('SELECT COUNT(*) FROM `' . $tableA . '`')->fetchColumn();
    if ((int) $count !== 2 || !str_starts_with(Progress::statusOf($userA, 'C42'), 'validated')) {
        throw new RuntimeException('Reset C42 ou progression incorrecte');
    }

    $lockCount = (int) Db::pdo()->query("SELECT COUNT(*) FROM app_locks WHERE lock_key LIKE 'wk:%'")->fetchColumn();
    if ($lockCount !== 0) throw new RuntimeException('Verrou app_locks non libéré');

    echo "Rejeu complet : $passed/50 cartes passées" . PHP_EOL;
    echo "Mutations : C42–C49 pass ; C43 sans WHERE fail ; C45 sans COMMIT fail ; reset/isolation OK" . PHP_EOL;
} finally {
    cleanupTestUser($userA);
    cleanupTestUser($userB);
}
