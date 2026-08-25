<?php
declare(strict_types=1);

$user = Auth::requireUser();
$card = Cards::get($routeParams['slug']);
if ($card === null) {
    Http::send(404, ['error' => 'not_found']);
}
$status = Progress::statusOf($user['id'], $card['slug']);
if ($status === 'locked') {
    Http::send(403, ['error' => 'locked', 'messageFr' => 'Valide la carte précédente pour accéder à celle-ci.']);
}
Http::send(200, ['card' => Cards::publicCard($card), 'status' => $status]);
