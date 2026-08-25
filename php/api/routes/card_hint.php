<?php
declare(strict_types=1);

$user = Auth::requireUser();
$card = Cards::get($routeParams['slug']);
if ($card === null) {
    Http::send(404, ['error' => 'not_found']);
}
$index = (int) (Http::jsonBody()['index'] ?? 0);
$hints = $card['gating']['hints'];
if ($index < 0 || $index >= count($hints)) {
    Http::send(404, ['error' => 'no_more_hints', 'messageFr' => "Il n'y a pas d'autre indice."]);
}
Progress::markHintUsed($user['id'], $card['slug']);
Http::send(200, ['hint_fr' => $hints[$index], 'index' => $index, 'remaining' => count($hints) - $index - 1]);
