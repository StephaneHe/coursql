<?php
declare(strict_types=1);

$user = Auth::requireUser();
RateLimit::enforce(
    'exec',
    $user['id'] . '|' . RateLimit::clientIp(),
    45,
    60,
    "Trop d'exécutions d'affilée. Patiente quelques secondes avant de réessayer.",
);
$card = Cards::get($routeParams['slug']);
if ($card === null) {
    Http::send(404, ['error' => 'not_found']);
}
if (Progress::statusOf($user['id'], $card['slug']) === 'locked') {
    Http::send(403, ['error' => 'locked', 'messageFr' => 'Valide la carte précédente pour accéder à celle-ci.']);
}
$body = Http::jsonBody();
$gating = $card['gating'];

if ($gating['kind'] === 'quiz') {
    $choice = filter_var($body['choice'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
    if ($choice === false || $choice >= count($gating['options'])) {
        Http::send(400, ['error' => 'invalid_choice', 'messageFr' => 'Choisis une réponse.']);
    }
    $pass = $choice === $gating['correctIndex'];
    Progress::recordAttempt(
        $user['id'],
        $card['slug'],
        $card['gatingExerciseSlug'],
        'choice:' . $choice,
        $pass ? 'pass' : 'fail',
        null,
        null,
    );
    $next = null;
    if ($pass) {
        Progress::validateCard($user['id'], $card['slug']);
        $next = Cards::nextSlug($card['slug']);
    }
    Http::send(200, [
        'status' => $pass ? 'pass' : 'fail',
        'kind' => 'quiz',
        'messageFr' => $pass ? 'Bravo, bonne réponse ! 🎉' : "Ce n'est pas la bonne réponse. Réessaie (essais illimités).",
        'card_validated' => $pass,
        'next_card_slug' => $next,
    ]);
}

if ($gating['kind'] === 'mutation') {
    $rawSql = (string) ($body['sql'] ?? '');
    $map = Workspace::tableMap($user['id'], $card);
    $guarded = SqlGuard::process(
        $rawSql,
        $card['permissions'],
        $map,
        $card['allowMultiStatement'],
        (int) $config['max_sql_len'],
    );
    if (!$guarded['ok']) {
        Progress::recordAttempt(
            $user['id'], $card['slug'], $card['gatingExerciseSlug'], $rawSql,
            'blocked', null, $guarded['category'],
        );
        Http::send(400, ['status' => 'error', 'kind' => 'mutation', 'messageFr' => $guarded['messageFr']]);
    }
    $started = hrtime(true);
    try {
        $result = Workspace::execute($user['id'], $card, $guarded['statements'], $config);
        $durationMs = (int) round((hrtime(true) - $started) / 1_000_000);
        $verdict = Compare::result($result['columns'], $result['rows'], $gating['expected'], $gating['compare']);
        $outcome = $verdict['pass'] ? 'pass' : 'fail';
        Progress::recordAttempt(
            $user['id'], $card['slug'], $card['gatingExerciseSlug'], $rawSql, $outcome, $durationMs, null,
        );
        $next = null;
        if ($verdict['pass']) {
            Progress::validateCard($user['id'], $card['slug']);
            $next = Cards::nextSlug($card['slug']);
        }
        Http::send(200, [
            'status' => $outcome,
            'kind' => 'mutation',
            'columns' => $result['columns'],
            'rows' => $result['rows'],
            'messageFr' => $verdict['pass']
                ? "Parfait, la table est dans l'état attendu ! 🎉"
                : trim("Pas tout à fait. " . ($verdict['reasonFr'] ?? '') . " (Voici l'état obtenu ci-dessous.)"),
            'card_validated' => $verdict['pass'],
            'next_card_slug' => $next,
        ]);
    } catch (WorkspaceBusy) {
        Http::send(409, ['error' => 'workspace_busy', 'messageFr' => 'Cet espace est occupé. Réessaie dans un instant.']);
    } catch (PDOException $error) {
        $durationMs = (int) round((hrtime(true) - $started) / 1_000_000);
        $mapped = SqlErrors::map($error);
        Progress::recordAttempt(
            $user['id'], $card['slug'], $card['gatingExerciseSlug'], $rawSql,
            $mapped['outcome'], $durationMs, $mapped['category'],
        );
        Http::send(200, ['status' => $mapped['outcome'], 'kind' => 'mutation', 'messageFr' => $mapped['messageFr']]);
    }
}

$rawSql = (string) ($body['sql'] ?? '');
$guarded = SqlGuard::process(
    $rawSql,
    'read_only',
    Cards::tableMap($card, ''),
    false,
    (int) $config['max_sql_len'],
);
if (!$guarded['ok']) {
    Progress::recordAttempt(
        $user['id'],
        $card['slug'],
        $card['gatingExerciseSlug'],
        $rawSql,
        'blocked',
        null,
        $guarded['category'],
    );
    Http::send(400, ['status' => 'error', 'kind' => 'sql', 'messageFr' => $guarded['messageFr']]);
}

$started = hrtime(true);
try {
    $result = Runner::readOnly(Db::pdo(), $guarded['statements'][0], $config);
    $durationMs = (int) round((hrtime(true) - $started) / 1_000_000);
    $verdict = Compare::result($result['columns'], $result['rows'], $gating['expected'], $gating['compare']);
    $outcome = $verdict['pass'] ? 'pass' : 'fail';
    Progress::recordAttempt(
        $user['id'], $card['slug'], $card['gatingExerciseSlug'], $rawSql, $outcome, $durationMs, null,
    );
    $next = null;
    if ($verdict['pass']) {
        Progress::validateCard($user['id'], $card['slug']);
        $next = Cards::nextSlug($card['slug']);
    }
    Http::send(200, [
        'status' => $outcome,
        'kind' => 'sql',
        'columns' => $result['columns'],
        'rows' => $result['rows'],
        'truncated' => $result['truncated'],
        'messageFr' => $verdict['pass']
            ? 'Parfait, le résultat est correct ! 🎉'
            : trim('Pas tout à fait. ' . ($verdict['reasonFr'] ?? '')),
        'card_validated' => $verdict['pass'],
        'next_card_slug' => $next,
    ]);
} catch (PDOException $error) {
    $durationMs = (int) round((hrtime(true) - $started) / 1_000_000);
    $mapped = SqlErrors::map($error);
    Progress::recordAttempt(
        $user['id'], $card['slug'], $card['gatingExerciseSlug'], $rawSql,
        $mapped['outcome'], $durationMs, $mapped['category'],
    );
    Http::send(200, ['status' => $mapped['outcome'], 'kind' => 'sql', 'messageFr' => $mapped['messageFr']]);
}
