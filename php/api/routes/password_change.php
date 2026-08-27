<?php
declare(strict_types=1);

$user = Auth::requireUser();

// Anti-bruteforce sur la vérification du mot de passe actuel (par profil + IP).
RateLimit::enforce(
    'pwchange',
    $user['id'] . '|' . RateLimit::clientIp(),
    10,
    300,
    'Trop de tentatives. Patiente quelques minutes avant de réessayer.',
);

$body = Http::jsonBody();
$current = (string) ($body['current_password'] ?? '');
$next = (string) ($body['new_password'] ?? '');

$hash = Auth::getPasswordHash($user['id']);
if ($hash === null || !password_verify($current, $hash)) {
    Http::send(403, ['error' => 'wrong_password', 'messageFr' => 'Mot de passe actuel incorrect.']);
}
if (!Auth::validPassword($next)) {
    Http::send(400, ['error' => 'invalid_password', 'messageFr' => "Choisis un nouveau mot de passe d'au moins 4 caractères."]);
}
Auth::updatePassword($user['id'], Auth::hashPassword($next));
Http::send(200, ['ok' => true, 'messageFr' => 'Mot de passe mis à jour.']);
