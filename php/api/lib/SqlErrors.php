<?php
declare(strict_types=1);

/** Port of sqlErrors.ts: map a PDOException to a pedagogical FR message, never the raw MySQL text
 * nor any internal structure. Keyed on the MySQL driver error code (PDOException::errorInfo[1]). */
final class SqlErrors
{
    /** @return array{category:string,messageFr:string,outcome:string} */
    public static function map(PDOException $e): array
    {
        $info = $e->errorInfo ?? [];
        $driverCode = isset($info[1]) ? (int) $info[1] : 0;

        // statement timeout (max_execution_time exceeded / interrupted)
        if ($driverCode === 3024 || $driverCode === 1317) {
            return ['category' => 'timeout', 'outcome' => 'timeout',
                'messageFr' => "Requête interrompue : elle a mis trop de temps. Simplifie-la et réessaie."];
        }
        switch ($driverCode) {
            case 1064: // ER_PARSE_ERROR
                return ['category' => 'syntax', 'outcome' => 'error',
                    'messageFr' => "Erreur de syntaxe : vérifie les mots-clés, les virgules et l'orthographe."];
            case 1054: // ER_BAD_FIELD_ERROR
                return ['category' => 'unknown_column', 'outcome' => 'error',
                    'messageFr' => "Colonne inconnue : vérifie l'orthographe des noms de colonnes."];
            case 1146: // ER_NO_SUCH_TABLE
                return ['category' => 'unknown_table', 'outcome' => 'error',
                    'messageFr' => "Table inconnue : vérifie le nom de la table après FROM."];
            case 1044: case 1142: case 1143: case 1227: // access denied variants
                return ['category' => 'not_allowed', 'outcome' => 'blocked',
                    'messageFr' => "Action non autorisée ici : pour cette carte, seule la lecture (SELECT) est permise."];
            default:
                return ['category' => $driverCode ? ('mysql_' . $driverCode) : 'unknown', 'outcome' => 'error',
                    'messageFr' => "La requête n'a pas pu être exécutée. Vérifie ta syntaxe et réessaie."];
        }
    }
}
