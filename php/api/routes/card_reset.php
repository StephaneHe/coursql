<?php
declare(strict_types=1);

$user = Auth::requireUser();
$card = Cards::get($routeParams['slug']);
if ($card === null) {
    Http::send(404, ['error' => 'not_found']);
}
if (Progress::statusOf($user['id'], $card['slug']) === 'locked') {
    Http::send(403, ['error' => 'locked']);
}
if ($card['kind'] !== 'mutation') {
    Http::send(200, ['noop' => true]);
}
try {
    Workspace::reset($user['id'], $card);
} catch (WorkspaceBusy) {
    Http::send(409, ['error' => 'workspace_busy', 'messageFr' => 'Cet espace est occupé. Réessaie dans un instant.']);
}
Http::send(200, ['ok' => true, 'messageFr' => "La table a été réinitialisée à son état de départ."]);
