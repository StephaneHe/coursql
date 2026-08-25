<?php
declare(strict_types=1);

final class Runner
{
    /** @return array{columns:array<int,string>,rows:array<int,array<int,mixed>>,truncated:bool} */
    public static function readOnly(PDO $pdo, string $sql, array $config): array
    {
        $timeoutMs = max(100, min(10000, (int) $config['query_timeout_ms']));
        $maxRows = max(1, min(1000, (int) $config['max_rows']));
        set_time_limit((int) ceil($timeoutMs / 1000) + 2);
        $pdo->exec('SET SESSION max_execution_time = ' . $timeoutMs);

        $statement = $pdo->query($sql);
        $columns = [];
        for ($index = 0; $index < $statement->columnCount(); $index++) {
            $meta = $statement->getColumnMeta($index);
            $columns[] = (string) ($meta['name'] ?? $index);
        }

        $rows = [];
        while (count($rows) <= $maxRows && ($row = $statement->fetch(PDO::FETCH_NUM)) !== false) {
            $rows[] = $row;
        }
        $truncated = count($rows) > $maxRows;
        if ($truncated) {
            $rows = array_slice($rows, 0, $maxRows);
        }
        $statement->closeCursor();
        return ['columns' => $columns, 'rows' => $rows, 'truncated' => $truncated];
    }
}
