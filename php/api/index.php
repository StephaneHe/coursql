<?php
declare(strict_types=1);

require __DIR__ . '/config.php';
require dirname(__DIR__) . '/vendor/autoload.php';
require __DIR__ . '/lib/Db.php';
require __DIR__ . '/lib/Http.php';
require __DIR__ . '/lib/SqlErrors.php';
require __DIR__ . '/lib/RateLimit.php';
require __DIR__ . '/lib/Auth.php';
require __DIR__ . '/lib/Cards.php';
require __DIR__ . '/lib/Compare.php';
require __DIR__ . '/lib/Progress.php';
require __DIR__ . '/lib/SqlGuard.php';
require __DIR__ . '/lib/Runner.php';
require __DIR__ . '/lib/Workspace.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

set_exception_handler(static function (Throwable $error): never {
    error_log('[coursql] erreur interne de type ' . $error::class);
    Http::send(500, ['error' => 'internal', 'messageFr' => 'Une erreur interne est survenue.']);
});

$config = coursql_config();
Db::init($config);
Auth::start($config);
Cards::load($config['cards_path']);
Progress::loadCardIndex(Cards::ordered());

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = preg_replace('#^/api(?=/|$)#', '', $uriPath) ?: '/';
$path = '/' . trim($path, '/');

if ($method === 'GET' && ($path === '/health' || $path === '/version')) {
    require __DIR__ . '/routes/health.php';
}

$routes = [
    'GET /accounts' => 'accounts.php',
    'POST /users' => 'users_create.php',
    'POST /sessions' => 'session_login.php',
    'GET /me' => 'me.php',
    'POST /password' => 'password_change.php',
    'DELETE /sessions/current' => 'session_logout.php',
    'GET /progress' => 'progress.php',
];
$route = $routes[$method . ' ' . $path] ?? null;
if ($route !== null) {
    require __DIR__ . '/routes/' . $route;
}

$routeParams = [];
if (preg_match('#^/cards/([A-Za-z0-9_-]+)(?:/(next|hint|solution|execute|reset))?$#', $path, $matches)) {
    $routeParams['slug'] = strtoupper($matches[1]);
    $suffix = $matches[2] ?? '';
    $cardRoutes = [
        'GET ' => 'card_get.php',
        'GET next' => 'card_next.php',
        'POST hint' => 'card_hint.php',
        'POST solution' => 'card_solution.php',
        'POST execute' => 'card_execute.php',
        'POST reset' => 'card_reset.php',
    ];
    $cardRoute = $cardRoutes[$method . ' ' . $suffix] ?? null;
    if ($cardRoute !== null) {
        require __DIR__ . '/routes/' . $cardRoute;
    }
}

Http::send(404, ['error' => 'not_found', 'messageFr' => 'Route API inconnue.']);
