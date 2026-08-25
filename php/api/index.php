<?php
declare(strict_types=1);

require __DIR__ . '/config.php';
require __DIR__ . '/lib/Db.php';
require __DIR__ . '/lib/Http.php';
require __DIR__ . '/lib/SqlErrors.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

set_exception_handler(static function (Throwable $error): never {
    error_log('[coursql] erreur interne de type ' . $error::class);
    Http::send(500, ['error' => 'internal', 'messageFr' => 'Une erreur interne est survenue.']);
});

$config = coursql_config();
Db::init($config);

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$uriPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = preg_replace('#^/api(?=/|$)#', '', $uriPath) ?: '/';
$path = '/' . trim($path, '/');

if ($method === 'GET' && ($path === '/health' || $path === '/version')) {
    require __DIR__ . '/routes/health.php';
}

Http::send(404, ['error' => 'not_found', 'messageFr' => 'Route API inconnue.']);
