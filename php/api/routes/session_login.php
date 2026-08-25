<?php
declare(strict_types=1);

$displayName = (string) (Http::jsonBody()['display_name'] ?? '');
$user = Auth::findByName($displayName);
if ($user === null) {
    Http::send(404, ['error' => 'unknown_user', 'messageFr' => 'Aucun profil à ce nom. Crée-en un nouveau.']);
}
Auth::login($user['id']);
Http::send(200, ['user_id' => $user['id'], 'display_name' => $user['display_name']]);
