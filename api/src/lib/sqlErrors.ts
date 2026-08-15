// Map raw MySQL errors to pedagogical French messages (DESIGN §12.11).
// The learner MUST see a usable error (UX requirement) but never the raw MySQL message
// nor any internal structure. We key on stable error codes/errnos.

export interface MappedError {
  category: string;
  messageFr: string;
  outcome: 'error' | 'timeout' | 'blocked';
}

export function mapSqlError(err: unknown): MappedError {
  const e = err as { code?: string; errno?: number } | undefined;
  const code = e?.code;
  const errno = e?.errno;

  // Statement timeout (max_execution_time) or client-side inactivity timeout.
  if (code === 'PROTOCOL_SEQUENCE_TIMEOUT' || errno === 3024 || errno === 1317) {
    return {
      category: 'timeout',
      outcome: 'timeout',
      messageFr: "Requête interrompue : elle a mis trop de temps. Simplifie-la et réessaie.",
    };
  }

  switch (code) {
    case 'ER_PARSE_ERROR':
      return { category: 'syntax', outcome: 'error', messageFr: "Erreur de syntaxe : vérifie les mots-clés, les virgules et l'orthographe." };
    case 'ER_BAD_FIELD_ERROR':
      return { category: 'unknown_column', outcome: 'error', messageFr: "Colonne inconnue : vérifie l'orthographe des noms de colonnes." };
    case 'ER_NO_SUCH_TABLE':
      return { category: 'unknown_table', outcome: 'error', messageFr: "Table inconnue : vérifie le nom de la table après FROM." };
    case 'ER_DBACCESS_DENIED_ERROR':
    case 'ER_TABLEACCESS_DENIED_ERROR':
    case 'ER_COLUMNACCESS_DENIED_ERROR':
    case 'ER_SPECIFIC_ACCESS_DENIED_ERROR':
      return { category: 'not_allowed', outcome: 'blocked', messageFr: "Action non autorisée ici : pour cette carte, seule la lecture (SELECT) est permise." };
    default:
      return {
        category: code ? String(code).toLowerCase() : 'unknown',
        outcome: 'error',
        messageFr: "La requête n'a pas pu être exécutée. Vérifie ta syntaxe et réessaie.",
      };
  }
}
