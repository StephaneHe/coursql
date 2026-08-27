<?php
declare(strict_types=1);

RateLimit::enforce(
    'users',
    RateLimit::clientIp(),
    5,
    600,
    'Trop de créations de profil coup sur coup. Patiente quelques minutes avant de réessayer.',
);

$displayName = (string) (Http::jsonBody()['display_name'] ?? '');
if (!Auth::validDisplayName($displayName)) {
    Http::send(400, ['error' => 'invalid_name', 'messageFr' => 'Choisis un nom entre 1 et 40 caractères.']);
}
if (Auth::findByName($displayName) !== null) {
    Http::send(409, ['error' => 'name_taken', 'messageFr' => 'Ce nom est déjà utilisé. Choisis-en un autre ou reconnecte-toi.']);
}
try {
    $user = Auth::createUser($displayName);
} catch (PDOException $error) {
    if (($error->errorInfo[0] ?? '') === '23000') {
        Http::send(409, ['error' => 'name_taken', 'messageFr' => 'Ce nom est déjà utilisé. Choisis-en un autre ou reconnecte-toi.']);
    }
    throw $error;
}
Http::send(201, ['user_id' => $user['id'], 'display_name' => $user['display_name']]);
