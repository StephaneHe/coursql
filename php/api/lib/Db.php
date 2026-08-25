<?php
declare(strict_types=1);

/** Connexions PDO vers l'unique base. Les multi-instructions et connexions persistantes sont coupées. */
final class Db
{
    private static array $config = [];
    private static ?PDO $shared = null;

    public static function init(array $config): void
    {
        self::$config = $config;
        self::$shared = null;
    }

    public static function pdo(): PDO
    {
        return self::$shared ??= self::fresh();
    }

    /** Connexion neuve, notamment pour séparer exécution et vérification de C45. */
    public static function fresh(): PDO
    {
        foreach (['db_host', 'db_name', 'db_user', 'db_pass'] as $required) {
            if (!array_key_exists($required, self::$config) || self::$config[$required] === '') {
                throw new RuntimeException('Configuration de base de données incomplète.');
            }
        }
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            self::$config['db_host'],
            self::$config['db_port'],
            self::$config['db_name'],
        );
        return new PDO($dsn, self::$config['db_user'], self::$config['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_PERSISTENT => false,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_STRINGIFY_FETCHES => true,
            PDO::MYSQL_ATTR_MULTI_STATEMENTS => false,
        ]);
    }
}
