<?php
declare(strict_types=1);

// Anti-bruteforce : les tentatives de connexion sont limitées par IP.
RateLimit::enforce(
    'login',
    RateLimit::clientIp(),
    10,
    300,
    'Trop de tentatives de connexion. Patiente quelques minutes avant de réessayer.',
);

$body = Http::jsonBody();
$displayName = (string) ($body['display_name'] ?? '');
$password = (string) ($body['password'] ?? '');

$user = Auth::verifyLogin($displayName, $password);
if ($user === null) {
    // Message générique : ne distingue pas « profil inconnu » de « mauvais mot de passe ».
    Http::send(401, ['error' => 'invalid_credentials', 'messageFr' => 'Nom ou mot de passe incorrect.']);
}
Auth::login($user['id']);
Http::send(200, ['user_id' => $user['id'], 'display_name' => $user['display_name']]);
