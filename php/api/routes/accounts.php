<?php
declare(strict_types=1);

// Protégé : la liste des profils n'est plus exposée avant authentification (anti-énumération).
Auth::requireUser();

$accounts = array_map(static fn(array $user): array => [
    'user_id' => $user['id'],
    'display_name' => $user['display_name'],
], Auth::accounts());
Http::send(200, ['accounts' => $accounts]);
