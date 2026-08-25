<?php
declare(strict_types=1);

use PhpMyAdmin\SqlParser\Lexer;
use PhpMyAdmin\SqlParser\Parser;
use PhpMyAdmin\SqlParser\Token;

final class SqlGuardBlocked extends RuntimeException
{
    public function __construct(public readonly string $category, public readonly string $publicMessage)
    {
        parent::__construct($category);
    }
}

/**
 * Barrière applicative critique de l'architecture mono-compte.
 * Parser vendored + allowlists positives + résolution obligatoire des tables + contrôle post-réécriture.
 */
final class SqlGuard
{
    private const RESERVED_PREFIXES = ['app_', 'seed_', 'seedref_', 'wk_'];

    private const SAFE_FUNCTIONS = [
        'ABS', 'AVG', 'CHAR_LENGTH', 'CONCAT', 'COUNT', 'DAY', 'LENGTH', 'LOWER',
        'MAX', 'MIN', 'MONTH', 'ROUND', 'SUBSTRING', 'SUM', 'UPPER', 'YEAR',
    ];

    /** Mots-clés nécessaires au cursus et aux DDL bornés, rien d'autre. */
    private const SAFE_KEYWORDS = [
        'ADD', 'ALL', 'ALTER', 'AND', 'AS', 'ASC', 'AUTO_INCREMENT', 'BEGIN', 'BETWEEN',
        'BY', 'CASE', 'CHECK', 'COLUMN', 'COMMIT', 'CONSTRAINT', 'CREATE', 'CROSS JOIN',
        'DECIMAL', 'DEFAULT', 'DELETE', 'DESC', 'DISTINCT', 'DROP', 'ELSE', 'END', 'ENGINE',
        'EXCEPT', 'EXISTS', 'FOREIGN KEY', 'FROM', 'FULL JOIN', 'GROUP BY', 'HAVING', 'IF',
        'IF EXISTS', 'IF NOT EXISTS', 'IN', 'INDEX', 'INNER JOIN', 'INSERT', 'INT', 'INTEGER',
        'INTERSECT', 'INTO', 'IS', 'IS NOT NULL', 'IS NULL', 'JOIN', 'KEY', 'LEFT JOIN',
        'LEFT OUTER JOIN', 'LIKE', 'LIMIT', 'NOT', 'NOT NULL', 'NULL', 'OFFSET', 'ON', 'OR',
        'NAME', 'ORDER BY', 'OUTER JOIN', 'PRIMARY', 'PRIMARY KEY', 'REFERENCES', 'RIGHT JOIN',
        'RIGHT OUTER JOIN', 'ROLLBACK', 'SELECT', 'SET', 'START', 'START TRANSACTION', 'TABLE',
        'THEN', 'TINYINT', 'TRANSACTION', 'UNION', 'UNION ALL', 'UNION DISTINCT', 'UNIQUE',
        'UNSIGNED', 'UPDATE', 'USING', 'VALUES', 'VARCHAR', 'WHEN', 'WHERE', 'WITH',
    ];

    private const SAFE_OPERATORS = [
        '(', ')', ',', '.', '*', '+', '-', '/', '%', '=', '<', '>', '<=', '>=', '<>', '!=',
        '&', '|', '^', '<<', '>>',
    ];

    /**
     * @param array<string,string> $logicalMap nom logique normalisé -> nom physique
     * @return array{ok:true,statements:array<int,string>}|array{ok:false,messageFr:string,category:string}
     */
    public static function process(
        string $sql,
        string $permissions,
        array $logicalMap,
        bool $allowMultiStatement = false,
        int $maxLength = 4000,
    ): array {
        try {
            self::preflight($sql, $maxLength);
            $map = self::normalizeMap($logicalMap);
            $parts = self::lexAndSplit($sql);
            if (count($parts) === 0) {
                self::block('empty', "Écris une requête avant d'exécuter.");
            }
            if (!$allowMultiStatement && count($parts) !== 1) {
                self::block('multi_statement', 'Une seule instruction SQL à la fois.');
            }

            $rewritten = [];
            foreach ($parts as $tokens) {
                self::validateParser($tokens);
                self::validateTokens($tokens, false);
                $type = self::statementType($tokens);
                self::validateStatementType($type, $permissions, $allowMultiStatement);
                self::rewriteTableReferences($tokens, $map, $type, false);
                self::removeComments($tokens);
                $final = trim(self::render($tokens));

                // Belt & braces : nouvelle passe indépendante sur le SQL réellement exécuté.
                $postTokens = self::lexOne($final);
                self::validateParser($postTokens);
                self::validateTokens($postTokens, true);
                if (self::statementType($postTokens) !== $type) {
                    self::block('post_type', "Cette instruction n'est pas autorisée dans l'exercice.");
                }
                self::rewriteTableReferences($postTokens, $map, $type, true);
                $rewritten[] = $final;
            }
            return ['ok' => true, 'statements' => $rewritten];
        } catch (SqlGuardBlocked $blocked) {
            if (getenv('COURSQL_GUARD_LOG') !== '0') {
                error_log('[coursql][sqlguard] requête bloquée (' . $blocked->category . ')');
            }
            return ['ok' => false, 'messageFr' => $blocked->publicMessage, 'category' => $blocked->category];
        } catch (Throwable) {
            if (getenv('COURSQL_GUARD_LOG') !== '0') {
                error_log('[coursql][sqlguard] requête bloquée (parser)');
            }
            return [
                'ok' => false,
                'messageFr' => "Erreur de syntaxe : vérifie les mots-clés, les virgules et l'orthographe.",
                'category' => 'parser',
            ];
        }
    }

    private static function preflight(string $sql, int $maxLength): void
    {
        if (trim($sql) === '') {
            self::block('empty', "Écris une requête avant d'exécuter.");
        }
        if (strlen($sql) > $maxLength) {
            self::block('length', "Requête trop longue (maximum $maxLength caractères).");
        }
        if (str_contains($sql, "\0") || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $sql)) {
            self::block('control_character', "Cette instruction n'est pas autorisée dans l'exercice.");
        }
        if (preg_match('/[\x{00A0}\x{1680}\x{2000}-\x{200B}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]/u', $sql)) {
            self::block('unicode_space', "Cette instruction n'est pas autorisée dans l'exercice.");
        }
        if (preg_match('#/\*!#', $sql)) {
            self::block('executable_comment', "Les commentaires exécutables ne sont pas autorisés.");
        }
    }

    /** @param array<string,string> $logicalMap */
    private static function normalizeMap(array $logicalMap): array
    {
        $normalized = [];
        foreach ($logicalMap as $logical => $physical) {
            $logical = self::normalizeIdentifier((string) $logical);
            $physical = strtolower((string) $physical);
            if (!preg_match('/^[a-z_][a-z0-9_]*$/', $logical)
                || !preg_match('/^(?:seed_[a-z][a-z0-9_]*|wk_[a-f0-9]{8}_c[0-9]{1,2}_[a-z][a-z0-9_]*)$/', $physical)
                || strlen($physical) > 64) {
                throw new LogicException('Mapping de table interne invalide.');
            }
            $normalized[$logical] = $physical;
        }
        return $normalized;
    }

    /** @return array<int,array<int,Token>> */
    private static function lexAndSplit(string $sql): array
    {
        $lexer = new Lexer($sql, false);
        if ($lexer->errors !== []) {
            self::block('lexer', "Erreur de syntaxe : vérifie les mots-clés, les virgules et l'orthographe.");
        }
        $parts = [];
        $current = [];
        foreach ($lexer->list->tokens as $token) {
            if ($token->type === Token::TYPE_COMMENT && ($token->flags & Token::FLAG_COMMENT_MYSQL_CMD)) {
                self::block('executable_comment', 'Les commentaires exécutables ne sont pas autorisés.');
            }
            if ($token->type === Token::TYPE_DELIMITER && $token->token === ';') {
                if (self::hasSignificantToken($current)) {
                    $parts[] = $current;
                }
                $current = [];
                continue;
            }
            if ($token->token !== null) {
                $current[] = $token;
            }
        }
        if (self::hasSignificantToken($current)) {
            $parts[] = $current;
        }
        return $parts;
    }

    /** @return array<int,Token> */
    private static function lexOne(string $sql): array
    {
        $parts = self::lexAndSplit($sql);
        if (count($parts) !== 1) {
            self::block('post_split', "Cette instruction n'est pas autorisée dans l'exercice.");
        }
        return $parts[0];
    }

    /** @param array<int,Token> $tokens */
    private static function validateParser(array $tokens): void
    {
        $parser = new Parser(self::render($tokens), false);
        if ($parser->errors === [] && count($parser->statements) === 1) {
            return;
        }
        $significant = self::significantIndexes($tokens);
        if (count($significant) === 1 && in_array(self::statementType($tokens), ['COMMIT', 'ROLLBACK'], true)) {
            // Parsée isolément, la bibliothèque signale « aucune transaction commencée ».
            // C45 est pourtant exécutée comme une séquence sur la même connexion.
            return;
        }
        $branches = self::topLevelSetBranches($tokens);
        if (count($branches) >= 2) {
            foreach ($branches as $branch) {
                $branchParser = new Parser(self::render($branch), false);
                if ($branchParser->errors !== [] || count($branchParser->statements) !== 1
                    || self::statementType($branch) !== 'SELECT') {
                    self::block('parser', 'Syntaxe invalide dans une branche de requête ensembliste.');
                }
            }
            return;
        }
        {
            self::block('parser', "Erreur de syntaxe : vérifie les mots-clés, les virgules et l'orthographe.");
        }
    }

    /**
     * Compatibilité phpmyadmin/sql-parser 5.11 : INTERSECT/EXCEPT sont lexicalisés, mais le parser
     * signale à tort le second SELECT. Toutes les branches restent parsées séparément.
     * @param array<int,Token> $tokens @return array<int,array<int,Token>>
     */
    private static function topLevelSetBranches(array $tokens): array
    {
        $branches = [];
        $current = [];
        $depth = 0;
        $found = false;
        foreach ($tokens as $token) {
            $raw = (string) ($token->token ?? '');
            if ($raw === '(') $depth++;
            if ($raw === ')') $depth--;
            $word = ($token->type === Token::TYPE_KEYWORD || self::isIdentifier($token)) ? self::word($token) : '';
            if ($depth === 0 && in_array($word, ['UNION', 'UNION ALL', 'UNION DISTINCT', 'EXCEPT', 'INTERSECT'], true)) {
                if (!self::hasSignificantToken($current)) return [];
                $branches[] = $current;
                $current = [];
                $found = true;
                continue;
            }
            $current[] = $token;
        }
        if ($found && self::hasSignificantToken($current)) $branches[] = $current;
        return $found ? $branches : [];
    }

    /** @param array<int,Token> $tokens */
    private static function validateTokens(array $tokens, bool $postRewrite): void
    {
        foreach ($tokens as $token) {
            $raw = (string) ($token->token ?? '');
            switch ($token->type) {
                case Token::TYPE_WHITESPACE:
                    if (!preg_match('/^[ \t\r\n]+$/', $raw)) {
                        self::block('whitespace', "Cette instruction n'est pas autorisée dans l'exercice.");
                    }
                    break;
                case Token::TYPE_COMMENT:
                    if ($token->flags & Token::FLAG_COMMENT_MYSQL_CMD) {
                        self::block('executable_comment', 'Les commentaires exécutables ne sont pas autorisés.');
                    }
                    break;
                case Token::TYPE_KEYWORD:
                    $keyword = strtoupper(trim((string) ($token->keyword ?: $token->value ?: $raw)));
                    if ($token->flags & Token::FLAG_KEYWORD_FUNCTION) {
                        if (!in_array($keyword, self::SAFE_FUNCTIONS, true)
                            && !in_array($keyword, self::SAFE_KEYWORDS, true)) {
                            self::block('function_' . strtolower($keyword), "Cette fonction n'est pas autorisée dans l'exercice.");
                        }
                    } elseif (!in_array($keyword, self::SAFE_KEYWORDS, true)) {
                        self::block('keyword_' . strtolower(str_replace(' ', '_', $keyword)), "Cette instruction n'est pas autorisée dans l'exercice.");
                    }
                    break;
                case Token::TYPE_OPERATOR:
                    if (!in_array(strtoupper($raw), self::SAFE_OPERATORS, true)) {
                        self::block('operator', "Cet opérateur n'est pas autorisé dans l'exercice.");
                    }
                    break;
                case Token::TYPE_NONE:
                case Token::TYPE_SYMBOL:
                    if ($token->type === Token::TYPE_SYMBOL
                        && ($token->flags & (Token::FLAG_SYMBOL_VARIABLE | Token::FLAG_SYMBOL_USER | Token::FLAG_SYMBOL_SYSTEM))) {
                        self::block('variable', "Cette instruction n'est pas autorisée dans l'exercice.");
                    }
                    $identifier = self::normalizeIdentifier($raw);
                    if (!preg_match('/^[a-z_][a-z0-9_]*$/', $identifier)) {
                        self::block('identifier', "Cet identifiant n'est pas autorisé dans l'exercice.");
                    }
                    if (!$postRewrite && self::hasReservedPrefix($identifier)) {
                        self::block('reserved_table', 'Table inconnue pour cet exercice.');
                    }
                    break;
                case Token::TYPE_BOOL:
                case Token::TYPE_NUMBER:
                case Token::TYPE_STRING:
                    break;
                case Token::TYPE_DELIMITER:
                    if ($raw !== '' && $raw !== ';') {
                        self::block('delimiter', "Cette instruction n'est pas autorisée dans l'exercice.");
                    }
                    break;
                default:
                    self::block('token', "Cette instruction n'est pas autorisée dans l'exercice.");
            }
        }
    }

    /** @param array<int,Token> $tokens */
    private static function statementType(array $tokens): string
    {
        $words = [];
        foreach (self::significantIndexes($tokens) as $index) {
            $token = $tokens[$index];
            if ($token->type === Token::TYPE_KEYWORD || self::isIdentifier($token)) {
                $words[] = strtoupper(trim((string) ($token->keyword ?: $token->value ?: $token->token)));
                if (count($words) === 3) break;
            }
        }
        $first = $words[0] ?? '';
        $second = $words[1] ?? '';
        $third = $words[2] ?? '';
        if ($first === 'WITH') {
            return self::withMainType($tokens);
        }
        return match ($first) {
            'SELECT' => 'SELECT',
            'INSERT' => 'INSERT',
            'UPDATE' => 'UPDATE',
            'DELETE' => 'DELETE',
            'BEGIN', 'START TRANSACTION', 'START' => 'START_TRANSACTION',
            'COMMIT' => 'COMMIT',
            'ROLLBACK' => 'ROLLBACK',
            'ALTER' => $second === 'TABLE' ? 'ALTER_TABLE' : 'OTHER',
            'CREATE' => match (true) {
                $second === 'TABLE' => 'CREATE_TABLE',
                $second === 'INDEX', $second === 'UNIQUE' && $third === 'INDEX' => 'CREATE_INDEX',
                default => 'OTHER',
            },
            'DROP' => match ($second) {
                'TABLE' => 'DROP_TABLE',
                'INDEX' => 'DROP_INDEX',
                default => 'OTHER',
            },
            default => 'OTHER',
        };
    }

    /** @param array<int,Token> $tokens */
    private static function withMainType(array $tokens): string
    {
        $depth = 0;
        $closedCte = false;
        foreach (self::significantIndexes($tokens) as $index) {
            $raw = (string) $tokens[$index]->token;
            if ($raw === '(') {
                $depth++;
                continue;
            }
            if ($raw === ')') {
                $depth--;
                if ($depth === 0) $closedCte = true;
                continue;
            }
            if ($closedCte && $depth === 0 && $tokens[$index]->type === Token::TYPE_KEYWORD) {
                $word = strtoupper(trim((string) ($tokens[$index]->keyword ?: $tokens[$index]->value ?: $raw)));
                if (in_array($word, ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], true)) {
                    return $word === 'SELECT' ? 'SELECT' : 'OTHER';
                }
            }
        }
        return 'OTHER';
    }

    private static function validateStatementType(string $type, string $permissions, bool $allowMulti): void
    {
        $allowed = match ($permissions) {
            'read_only' => ['SELECT'],
            'dml' => $allowMulti
                ? ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'START_TRANSACTION', 'COMMIT', 'ROLLBACK']
                : ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
            'ddl' => ['SELECT', 'CREATE_TABLE', 'ALTER_TABLE', 'DROP_TABLE', 'CREATE_INDEX', 'DROP_INDEX'],
            default => [],
        };
        if (!in_array($type, $allowed, true)) {
            $message = $permissions === 'read_only'
                ? 'Pour cette carte, seule la lecture (SELECT) est permise.'
                : "Cette instruction n'est pas autorisée dans l'exercice.";
            self::block('statement_type', $message);
        }
    }

    /**
     * @param array<int,Token> $tokens
     * @param array<string,string> $map
     */
    private static function rewriteTableReferences(array &$tokens, array $map, string $type, bool $postRewrite): void
    {
        $significant = self::significantIndexes($tokens);
        $ctes = self::collectCtes($tokens, $significant);
        $aliases = [];
        $fromAtDepth = [];
        $depth = 0;
        $expectTable = false;

        foreach ($significant as $position => $index) {
            $token = $tokens[$index];
            $raw = (string) $token->token;
            $word = self::word($token);

            if ($raw === '(') {
                if ($expectTable) $expectTable = false;
                $depth++;
                continue;
            }
            if ($raw === ')') {
                unset($fromAtDepth[$depth]);
                $depth = max(0, $depth - 1);
                continue;
            }

            if ($expectTable) {
                if (!self::isIdentifier($token)) {
                    self::block('table_token', 'Table inconnue pour cet exercice : utilise ' . self::logicalTableList($map) . '.');
                }
                $nextIndex = $significant[$position + 1] ?? null;
                if ($nextIndex !== null && (string) $tokens[$nextIndex]->token === '.') {
                    self::block('qualified_table', 'Les noms qualifiés (base.table) ne sont pas autorisés.');
                }
                $name = self::normalizeIdentifier($raw);
                if (isset($ctes[$name])) {
                    // Une CTE est locale à la requête, pas une table de base.
                } elseif ($postRewrite) {
                    if (!in_array($name, array_values($map), true)) {
                        self::block('post_table', "Cette instruction n'est pas autorisée dans l'exercice.");
                    }
                } elseif (isset($map[$name])) {
                    self::replaceIdentifier($token, $map[$name]);
                    $name = $map[$name];
                } else {
                    self::block('unknown_table', 'Table inconnue pour cet exercice : utilise ' . self::logicalTableList($map) . '.');
                }
                $expectTable = false;

                $aliasPosition = $position + 1;
                $aliasIndex = $significant[$aliasPosition] ?? null;
                if ($aliasIndex !== null && self::word($tokens[$aliasIndex]) === 'AS') {
                    $aliasIndex = $significant[$aliasPosition + 1] ?? null;
                }
                if ($aliasIndex !== null && self::isIdentifier($tokens[$aliasIndex])) {
                    $aliases[self::normalizeIdentifier((string) $tokens[$aliasIndex]->token)] = true;
                }
                continue;
            }

            if ($raw === ',' && ($fromAtDepth[$depth] ?? false)) {
                $expectTable = true;
                continue;
            }

            if ($token->type === Token::TYPE_KEYWORD) {
                if ($word === 'FROM' || str_ends_with($word, 'JOIN') || in_array($word, ['INTO', 'UPDATE', 'TABLE', 'REFERENCES'], true)) {
                    $expectTable = true;
                    if ($word === 'FROM' || str_ends_with($word, 'JOIN') || $word === 'UPDATE') {
                        $fromAtDepth[$depth] = true;
                    }
                    continue;
                }
                if (($type === 'CREATE_INDEX' || $type === 'DROP_INDEX') && $word === 'ON') {
                    $expectTable = true;
                    continue;
                }
                if ($type === 'CREATE_TABLE' && $word === 'LIKE') {
                    $expectTable = true;
                    continue;
                }
                if (in_array($word, ['WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'ON', 'SET', 'VALUES', 'UNION', 'UNION ALL', 'UNION DISTINCT', 'EXCEPT', 'INTERSECT'], true)) {
                    $fromAtDepth[$depth] = false;
                }
            }
        }
        if ($expectTable) {
            self::block('missing_table', 'Table inconnue pour cet exercice : utilise ' . self::logicalTableList($map) . '.');
        }

        // Deuxième passe : qualificateurs table.colonne. Seuls tables, alias et CTE connus passent.
        foreach ($significant as $position => $index) {
            $token = $tokens[$index];
            if (!self::isIdentifier($token)) continue;
            $dotIndex = $significant[$position + 1] ?? null;
            if ($dotIndex === null || (string) $tokens[$dotIndex]->token !== '.') continue;
            $name = self::normalizeIdentifier((string) $token->token);
            if (isset($aliases[$name]) || isset($ctes[$name])) continue;
            if ($postRewrite) {
                if (!in_array($name, array_values($map), true)) {
                    self::block('post_qualifier', "Cette instruction n'est pas autorisée dans l'exercice.");
                }
            } elseif (isset($map[$name])) {
                self::replaceIdentifier($token, $map[$name]);
            } else {
                self::block('qualifier', 'Les noms qualifiés (base.table) ne sont pas autorisés.');
            }
        }
    }

    /** @param array<int,Token> $tokens @param array<int,int> $significant */
    private static function collectCtes(array $tokens, array $significant): array
    {
        $ctes = [];
        foreach ($significant as $position => $index) {
            if (!self::isIdentifier($tokens[$index])) continue;
            $asIndex = $significant[$position + 1] ?? null;
            $parenIndex = $significant[$position + 2] ?? null;
            if ($asIndex !== null && $parenIndex !== null
                && self::word($tokens[$asIndex]) === 'AS'
                && (string) $tokens[$parenIndex]->token === '(') {
                $ctes[self::normalizeIdentifier((string) $tokens[$index]->token)] = true;
            }
        }
        return $ctes;
    }

    /** @param array<int,Token> $tokens @return array<int,int> */
    private static function significantIndexes(array $tokens): array
    {
        $indexes = [];
        foreach ($tokens as $index => $token) {
            if (!in_array($token->type, [Token::TYPE_WHITESPACE, Token::TYPE_COMMENT, Token::TYPE_DELIMITER], true)) {
                $indexes[] = $index;
            }
        }
        return $indexes;
    }

    private static function word(Token $token): string
    {
        return strtoupper(trim((string) ($token->keyword ?: $token->value ?: $token->token)));
    }

    private static function isIdentifier(Token $token): bool
    {
        return $token->type === Token::TYPE_NONE || $token->type === Token::TYPE_SYMBOL;
    }

    private static function normalizeIdentifier(string $identifier): string
    {
        $identifier = trim($identifier);
        if (strlen($identifier) >= 2 && $identifier[0] === '`' && substr($identifier, -1) === '`') {
            $identifier = str_replace('``', '`', substr($identifier, 1, -1));
        }
        return strtolower($identifier);
    }

    private static function replaceIdentifier(Token $token, string $physical): void
    {
        $token->token = $physical;
        $token->value = $physical;
    }

    private static function hasReservedPrefix(string $identifier): bool
    {
        foreach (self::RESERVED_PREFIXES as $prefix) {
            if (str_starts_with($identifier, $prefix)) return true;
        }
        return false;
    }

    /** @param array<string,string> $map */
    private static function logicalTableList(array $map): string
    {
        return $map === [] ? 'les tables indiquées sur la carte' : implode(', ', array_keys($map));
    }

    /** @param array<int,Token> $tokens */
    private static function removeComments(array &$tokens): void
    {
        foreach ($tokens as $token) {
            if ($token->type === Token::TYPE_COMMENT) {
                $token->token = ' ';
                $token->value = ' ';
            }
        }
    }

    /** @param array<int,Token> $tokens */
    private static function render(array $tokens): string
    {
        return implode('', array_map(static fn(Token $token): string => (string) ($token->token ?? ''), $tokens));
    }

    /** @param array<int,Token> $tokens */
    private static function hasSignificantToken(array $tokens): bool
    {
        foreach ($tokens as $token) {
            if (!in_array($token->type, [Token::TYPE_WHITESPACE, Token::TYPE_COMMENT, Token::TYPE_DELIMITER], true)) {
                return true;
            }
        }
        return false;
    }

    private static function block(string $category, string $message): never
    {
        throw new SqlGuardBlocked($category, $message);
    }
}
