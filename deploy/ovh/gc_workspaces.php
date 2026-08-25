<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI uniquement.\n");
    exit(1);
}
$options = getopt('', ['user:', 'yes']);
$userId = (string) ($options['user'] ?? '');
if (!isset($options['yes']) || !preg_match('/^[a-f0-9-]{36}$/i', $userId)) {
    fwrite(STDERR, "Usage: COURSQL_WEB_ROOT=... COURSQL_PRIVATE_DIR=... php gc_workspaces.php --user=<uuid> --yes\n");
    exit(2);
}
$webRoot = getenv('COURSQL_WEB_ROOT');
$privateDir = getenv('COURSQL_PRIVATE_DIR');
if (!$webRoot || !$privateDir || !is_file($webRoot . '/api/index.php')) {
    fwrite(STDERR, "COURSQL_WEB_ROOT et COURSQL_PRIVATE_DIR valides sont requis.\n");
    exit(2);
}
putenv('COURSQL_PRIVATE_DIR=' . $privateDir);
require $webRoot . '/api/config.php';
require $webRoot . '/vendor/autoload.php';
foreach (['Db', 'Cards', 'SqlGuard', 'Workspace'] as $lib) require $webRoot . '/api/lib/' . $lib . '.php';
$config = coursql_config();
Db::init($config);
Cards::load($config['cards_path']);
Workspace::dropUserWorkspaces($userId, Cards::ordered());
echo "Workspaces ciblés supprimés pour le profil demandé.\n";
