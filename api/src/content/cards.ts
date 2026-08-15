// Versioned card content (DESIGN §12.6). Learner-facing text in French; technical keywords
// (SELECT, FROM, NULL, INT...) kept in English. Solutions/expected results NEVER leave the
// server before the dedicated routes.
//
// AUTHORING RULES (DESIGN §12.6.a):
//  - A card's gating exercise must NOT have the same query as the on-card EXAMPLE.
//  - The seed data must contain the boundary/edge case that makes the tested concept
//    SIGNIFICANT, so a plausible-but-wrong variant yields a DIFFERENT result
//    (e.g. a row exactly on the limit for < vs <=; decorrelated columns for AND vs OR;
//    duplicates for DISTINCT; NULL for IS NULL; etc.).

export interface TableColumn { name: string; type: string; pk?: boolean; fk?: string; note?: string; }
export interface TableSchema { name: string; columns: TableColumn[]; sampleRows?: (string | number | null)[][]; }

export interface QuizGating {
  kind: 'quiz';
  questionFr: string;
  options: string[];
  correctIndex: number;
  hints: string[];
  explanationFr: string;
}

export interface SqlGating {
  kind: 'sql';
  seedDb: string;
  solutionSql: string;
  expected: { columns: string[]; rows: (string | number | null)[][] };
  compare: { orderSensitive: boolean; compareColumnNames: boolean };
  hints: string[];
  explanationFr: string;
}

export interface Card {
  slug: string;
  moduleSlug: string;
  moduleTitle: string;
  position: number;
  title: string;
  conceptSlug: string;
  prerequisites: string[]; // informational only (never blocking) — shown on the card
  explanationFr: string;
  exampleSql?: string;
  exampleResultFr?: string;
  statementFr: string;
  tables?: TableSchema[];
  gatingExerciseSlug: string;
  gating: QuizGating | SqlGating;
  practice?: string[]; // optional practice exercises, do not affect progression
}

// Shared read-only seed database "library" (seed_books_v1): two tables, books + members.
// Data is crafted so each concept is revealed by an edge case:
//  - NULL author (row 3) for IS NULL / IS NOT NULL.
//  - Duplicate rows (2 == 4) and author "Antoine de Saint-Exupéry" x3 (2,4,6) for DISTINCT.
//  - author NOT equivalent to year 1943 (row 6 is that author but year 1931) so AND != OR.
//  - year 1943 exists (rows 2,4) so "< 1943" excludes it but "<= 1943" includes it.
const BOOKS_TABLE: TableSchema = {
  name: 'books',
  columns: [
    { name: 'id', type: 'INT', pk: true },
    { name: 'title', type: 'VARCHAR(80)' },
    { name: 'author', type: 'VARCHAR(80)', note: 'peut être NULL' },
    { name: 'year', type: 'INT' },
  ],
  sampleRows: [
    [1, 'Les Misérables', 'Victor Hugo', 1862],
    [2, 'Le Petit Prince', 'Antoine de Saint-Exupéry', 1943],
    [3, 'Contes', null, 1875],
    [4, 'Le Petit Prince', 'Antoine de Saint-Exupéry', 1943],
    [5, 'Germinal', 'Émile Zola', 1885],
    [6, 'Vol de Nuit', 'Antoine de Saint-Exupéry', 1931],
  ],
};

const MEMBERS_TABLE: TableSchema = {
  name: 'members',
  columns: [
    { name: 'id', type: 'INT', pk: true },
    { name: 'name', type: 'VARCHAR(60)' },
    { name: 'city', type: 'VARCHAR(60)', note: 'peut être NULL' },
    { name: 'joined', type: 'DATE' },
  ],
  sampleRows: [
    [1, 'Alice', 'Paris', '2021-03-01'],
    [2, 'Bruno', null, '2022-07-15'],
    [3, 'Chloé', 'Lyon', '2021-11-20'],
    [4, 'David', null, '2023-01-05'],
    [5, 'Emma', 'Paris', '2022-05-30'],
  ],
};

const SEED = 'seed_books_v1';

const CARDS: Card[] = [
  {
    slug: 'C1',
    moduleSlug: 'M1',
    moduleTitle: 'Découvrir une base',
    position: 1,
    title: 'Base et table',
    conceptSlug: 'database-table',
    prerequisites: [],
    explanationFr:
      "Une base de données range des informations. À l'intérieur, on trouve des tables. " +
      "Une table ressemble à un tableau : elle a un nom et contient des données organisées en colonnes et en lignes.",
    exampleResultFr:
      "Exemple : une table books (« livres ») peut contenir un livre par ligne, avec son titre, son auteur et son année.",
    statementFr: "Comment appelle-t-on l'objet qui range les données sous forme de tableau (colonnes et lignes) ?",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c1-table',
    gating: {
      kind: 'quiz',
      questionFr: "Comment appelle-t-on l'objet en forme de tableau qui contient les données ?",
      options: ['Une base', 'Une table', 'Une colonne', 'Une requête'],
      correctIndex: 1,
      hints: ["Ce n'est pas la base entière, mais un élément à l'intérieur.", "Pense à un tableau avec un nom."],
      explanationFr: "Une table est le tableau nommé qui contient les lignes et les colonnes. La base regroupe plusieurs tables.",
    },
  },
  {
    slug: 'C2',
    moduleSlug: 'M1',
    moduleTitle: 'Découvrir une base',
    position: 2,
    title: 'Colonne, ligne et valeur',
    conceptSlug: 'column-row-value',
    prerequisites: ['C1'],
    explanationFr:
      "Dans une table, une colonne décrit une caractéristique (par exemple author, l'auteur). " +
      "Une ligne représente un élément complet (un livre). À l'intersection d'une ligne et d'une colonne se trouve une valeur.",
    statementFr: "Dans la table books ci-dessous, où se trouve « Victor Hugo » ?",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c2-value',
    gating: {
      kind: 'quiz',
      questionFr: "« Victor Hugo » est…",
      options: [
        'une table',
        "le nom d'une colonne",
        "une valeur, à l'intersection d'une ligne et de la colonne author",
        'le nom de la base',
      ],
      correctIndex: 2,
      hints: ['Regarde la colonne author.', "C'est ce qui est écrit dans une case précise."],
      explanationFr: "« Victor Hugo » est une valeur : elle se trouve dans la ligne du livre 1 et dans la colonne author.",
    },
  },
  {
    slug: 'C3',
    moduleSlug: 'M1',
    moduleTitle: 'Découvrir une base',
    position: 3,
    title: 'Les types de données',
    conceptSlug: 'data-types',
    prerequisites: ['C1', 'C2'],
    explanationFr:
      "Chaque colonne a un type, qui indique la nature des valeurs : INT pour un nombre entier, " +
      "VARCHAR pour du texte, DATE pour une date, DECIMAL pour un nombre à virgule exact. " +
      "Le type aide la base à stocker et comparer correctement les valeurs.",
    statementFr: "Quel type convient le mieux pour stocker une année comme 1943 ?",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c3-types',
    gating: {
      kind: 'quiz',
      questionFr: "Pour une année entière comme 1943, on choisit le type…",
      options: ['VARCHAR', 'DATE', 'INT', 'BOOLEAN'],
      correctIndex: 2,
      hints: ['Une année est un nombre entier.', "Ce n'est pas du texte (VARCHAR) ni une date complète (DATE)."],
      explanationFr: "1943 est un nombre entier : le type INT convient. VARCHAR serait du texte, DATE une date complète.",
    },
  },
  {
    slug: 'C4',
    moduleSlug: 'M2',
    moduleTitle: 'Lire une table',
    position: 4,
    title: 'SELECT * FROM',
    conceptSlug: 'select-star',
    prerequisites: ['C1', 'C2', 'C3'],
    explanationFr:
      "Pour lire des données, on écrit une requête. SELECT choisit les colonnes ; l'étoile * signifie « toutes les colonnes » ; " +
      "FROM indique la table à lire. On termine souvent par un point-virgule.",
    exampleSql: 'SELECT * FROM books;',
    exampleResultFr: "Cet exemple affiche toutes les colonnes de tous les livres (table books).",
    statementFr: "À toi maintenant sur une AUTRE table : affiche toutes les colonnes de tous les membres (table members).",
    tables: [MEMBERS_TABLE],
    gatingExerciseSlug: 'gate-c4-select-star',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT * FROM members;',
      expected: {
        columns: ['id', 'name', 'city', 'joined'],
        rows: [
          [1, 'Alice', 'Paris', '2021-03-01'],
          [2, 'Bruno', null, '2022-07-15'],
          [3, 'Chloé', 'Lyon', '2021-11-20'],
          [4, 'David', null, '2023-01-05'],
          [5, 'Emma', 'Paris', '2022-05-30'],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ["Même idée que l'exemple, mais sur la table members.", "L'étoile * prend toutes les colonnes.", 'Termine par FROM members.'],
      explanationFr: "SELECT * prend toutes les colonnes, FROM members indique la table. On obtient les 5 membres.",
    },
    practice: ['select-all-books'],
  },
  {
    slug: 'C5',
    moduleSlug: 'M2',
    moduleTitle: 'Lire une table',
    position: 5,
    title: 'Choisir des colonnes',
    conceptSlug: 'select-columns',
    prerequisites: ['C4'],
    explanationFr:
      "Plutôt que toutes les colonnes, on peut en choisir précisément en les listant après SELECT, séparées par des virgules. " +
      "L'ordre des colonnes dans le résultat suit l'ordre que tu écris.",
    exampleSql: 'SELECT title, author FROM books;',
    exampleResultFr: "Cet exemple n'affiche que le titre et l'auteur, dans cet ordre.",
    statementFr: "Affiche uniquement les colonnes title et year (dans cet ordre) de la table books.",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c5-columns',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT title, year FROM books;',
      expected: {
        columns: ['title', 'year'],
        rows: [
          ['Les Misérables', 1862],
          ['Le Petit Prince', 1943],
          ['Contes', 1875],
          ['Le Petit Prince', 1943],
          ['Germinal', 1885],
          ['Vol de Nuit', 1931],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: true },
      hints: ['Liste les colonnes après SELECT, séparées par une virgule.', "L'ordre demandé est title puis year.", "N'utilise pas *."],
      explanationFr: "On liste title, year après SELECT. Ici les noms et l'ordre des colonnes comptent (title, year, pas author).",
    },
  },
  {
    slug: 'C6',
    moduleSlug: 'M2',
    moduleTitle: 'Lire une table',
    position: 6,
    title: 'Renommer avec AS',
    conceptSlug: 'column-alias',
    prerequisites: ['C5'],
    explanationFr:
      "On peut renommer une colonne à l'affichage avec AS : SELECT colonne AS nouveau_nom. " +
      "Cela ne change pas la table, seulement l'étiquette affichée dans le résultat (un alias).",
    exampleSql: 'SELECT title AS titre FROM books;',
    exampleResultFr: "La colonne title s'affiche sous l'étiquette titre.",
    statementFr: "Affiche l'année des livres sous l'étiquette annee (renomme year en annee).",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c6-alias',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT year AS annee FROM books;',
      expected: {
        columns: ['annee'],
        rows: [[1862], [1943], [1875], [1943], [1885], [1931]],
      },
      compare: { orderSensitive: false, compareColumnNames: true },
      hints: ['Utilise AS pour donner un nouveau nom.', 'Renomme year, pas title.', "L'étiquette voulue est annee."],
      explanationFr: "SELECT year AS annee affiche la colonne year sous le nom annee. L'alias est le nom vérifié ici.",
    },
  },
  {
    slug: 'C7',
    moduleSlug: 'M3',
    moduleTitle: 'Filtrer les lignes',
    position: 7,
    title: 'WHERE et égalité',
    conceptSlug: 'where-equals',
    prerequisites: ['C4', 'C5'],
    explanationFr:
      "WHERE garde seulement les lignes qui respectent une condition. L'égalité s'écrit avec un seul = : " +
      "WHERE colonne = valeur. Le texte se met entre apostrophes ('...').",
    exampleSql: "SELECT * FROM books WHERE year = 1943;",
    exampleResultFr: "L'exemple garde les livres publiés en 1943.",
    statementFr: "Affiche les livres dont l'auteur (author) est exactement 'Victor Hugo'.",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c7-where',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: "SELECT * FROM books WHERE author = 'Victor Hugo';",
      expected: {
        columns: ['id', 'title', 'author', 'year'],
        rows: [[1, 'Les Misérables', 'Victor Hugo', 1862]],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Filtre avec WHERE.', 'La colonne à tester est author.', "Le texte va entre apostrophes : 'Victor Hugo'."],
      explanationFr: "WHERE author = 'Victor Hugo' ne garde que la ligne dont l'auteur vaut exactement ce texte.",
    },
  },
  {
    slug: 'C8',
    moduleSlug: 'M3',
    moduleTitle: 'Filtrer les lignes',
    position: 8,
    title: 'Comparer (<, >, <=, >=, <>)',
    conceptSlug: 'comparison-operators',
    prerequisites: ['C7'],
    explanationFr:
      "En plus de =, on compare avec < (inférieur), > (supérieur), <= , >= et <> (différent). " +
      "Attention à la borne : < est STRICT (exclut la valeur), <= l'inclut. Ici deux livres sont pile en 1943.",
    exampleSql: 'SELECT * FROM books WHERE year >= 1900;',
    exampleResultFr: "L'exemple garde les livres publiés à partir de 1900 (1900 inclus).",
    statementFr: "Affiche les livres publiés AVANT 1943 (année strictement inférieure à 1943) — les livres de 1943 doivent être EXCLUS.",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c8-comparison',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT * FROM books WHERE year < 1943;',
      expected: {
        columns: ['id', 'title', 'author', 'year'],
        rows: [
          [1, 'Les Misérables', 'Victor Hugo', 1862],
          [3, 'Contes', null, 1875],
          [5, 'Germinal', 'Émile Zola', 1885],
          [6, 'Vol de Nuit', 'Antoine de Saint-Exupéry', 1931],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['« Avant 1943 » = plus petit que 1943.', "L'opérateur est <.", 'Attention : < est strict, il exclut les livres de 1943.'],
      explanationFr: "WHERE year < 1943 est STRICT : il exclut les deux livres de 1943. Avec <= 1943 tu les aurais gardés — c'est toute la différence.",
    },
  },
  {
    slug: 'C9',
    moduleSlug: 'M4',
    moduleTitle: 'Combiner des conditions',
    position: 9,
    title: 'AND',
    conceptSlug: 'and',
    prerequisites: ['C7', 'C8'],
    explanationFr:
      "AND combine deux conditions : une ligne n'est gardée que si les DEUX sont vraies en même temps. " +
      "Ici un livre de Saint-Exupéry date de 1931 : avec AND il sera écarté, alors qu'avec OR il serait gardé.",
    exampleSql: 'SELECT * FROM books WHERE year > 1800 AND year < 1900;',
    exampleResultFr: "L'exemple garde les livres publiés entre 1801 et 1899.",
    statementFr: "Affiche les livres qui sont À LA FOIS de 'Antoine de Saint-Exupéry' ET publiés en 1943.",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c9-and',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: "SELECT * FROM books WHERE author = 'Antoine de Saint-Exupéry' AND year = 1943;",
      expected: {
        columns: ['id', 'title', 'author', 'year'],
        rows: [
          [2, 'Le Petit Prince', 'Antoine de Saint-Exupéry', 1943],
          [4, 'Le Petit Prince', 'Antoine de Saint-Exupéry', 1943],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Deux conditions reliées par AND.', 'Teste author ET year.', "Le livre de 1931 ne doit PAS apparaître (AND exclut, OR l'aurait gardé)."],
      explanationFr: "Les DEUX conditions doivent être vraies : l'auteur ET l'année 1943. Le livre de 1931 du même auteur est écarté (avec OR il serait apparu).",
    },
  },
  {
    slug: 'C10',
    moduleSlug: 'M4',
    moduleTitle: 'Combiner des conditions',
    position: 10,
    title: 'OR',
    conceptSlug: 'or',
    prerequisites: ['C9'],
    explanationFr:
      "OR combine deux conditions : une ligne est gardée si AU MOINS UNE des deux est vraie.",
    exampleSql: 'SELECT * FROM books WHERE year = 1862 OR year = 1875;',
    exampleResultFr: "L'exemple garde les livres publiés en 1862 ou en 1875.",
    statementFr: "Affiche les livres dont l'année est 1862 OU dont l'auteur est 'Antoine de Saint-Exupéry'.",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c10-or',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: "SELECT * FROM books WHERE year = 1862 OR author = 'Antoine de Saint-Exupéry';",
      expected: {
        columns: ['id', 'title', 'author', 'year'],
        rows: [
          [1, 'Les Misérables', 'Victor Hugo', 1862],
          [2, 'Le Petit Prince', 'Antoine de Saint-Exupéry', 1943],
          [4, 'Le Petit Prince', 'Antoine de Saint-Exupéry', 1943],
          [6, 'Vol de Nuit', 'Antoine de Saint-Exupéry', 1931],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ["Une condition OU l'autre : OR.", 'Teste year = 1862 OR author = ...', 'Les trois livres de Saint-Exupéry comptent (même celui de 1931).'],
      explanationFr: "OR garde les lignes qui satisfont au moins une condition : l'année 1862 ou cet auteur (ses 3 livres, y compris celui de 1931).",
    },
  },
  {
    slug: 'C11',
    moduleSlug: 'M4',
    moduleTitle: 'Combiner des conditions',
    position: 11,
    title: 'NOT et parenthèses',
    conceptSlug: 'not-parentheses',
    prerequisites: ['C9', 'C10'],
    explanationFr:
      "NOT inverse une condition (garde ce qui ne la respecte pas). Les parenthèses ( ) regroupent des conditions " +
      "pour contrôler l'ordre d'évaluation, comme en mathématiques.",
    exampleSql: 'SELECT * FROM books WHERE NOT (year = 1862 OR year = 1875);',
    exampleResultFr: "L'exemple garde les livres qui ne sont NI de 1862 NI de 1875.",
    statementFr: "Affiche les livres qui ne datent PAS de 1943 (utilise NOT).",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c11-not',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT * FROM books WHERE NOT year = 1943;',
      expected: {
        columns: ['id', 'title', 'author', 'year'],
        rows: [
          [1, 'Les Misérables', 'Victor Hugo', 1862],
          [3, 'Contes', null, 1875],
          [5, 'Germinal', 'Émile Zola', 1885],
          [6, 'Vol de Nuit', 'Antoine de Saint-Exupéry', 1931],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['« Pas 1943 » = NOT year = 1943.', 'Tu peux aussi écrire year <> 1943.', 'Les deux livres de 1943 doivent disparaître.'],
      explanationFr: "NOT year = 1943 inverse la condition et garde les livres d'une autre année (quatre livres restent).",
    },
  },
  {
    slug: 'C12',
    moduleSlug: 'M5',
    moduleTitle: "L'absence de valeur (NULL)",
    position: 12,
    title: 'NULL et IS NULL',
    conceptSlug: 'is-null',
    prerequisites: ['C7'],
    explanationFr:
      "NULL signifie « pas de valeur » (inconnue), ce qui est différent de 0 ou du texte vide. " +
      "On ne teste pas NULL avec = : on écrit IS NULL pour trouver les lignes sans valeur.",
    exampleSql: 'SELECT * FROM books WHERE author IS NULL;',
    exampleResultFr: "L'exemple trouve les livres dont l'auteur est inconnu.",
    statementFr: "Dans la table members, affiche les membres dont la ville (city) est inconnue (NULL).",
    tables: [MEMBERS_TABLE],
    gatingExerciseSlug: 'gate-c12-is-null',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT * FROM members WHERE city IS NULL;',
      expected: {
        columns: ['id', 'name', 'city', 'joined'],
        rows: [
          [2, 'Bruno', null, '2022-07-15'],
          [4, 'David', null, '2023-01-05'],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['On ne teste pas NULL avec =.', 'Utilise IS NULL.', 'La colonne à tester est city.'],
      explanationFr: "WHERE city IS NULL garde les lignes sans ville renseignée (Bruno et David).",
    },
  },
  {
    slug: 'C13',
    moduleSlug: 'M5',
    moduleTitle: "L'absence de valeur (NULL)",
    position: 13,
    title: 'IS NOT NULL',
    conceptSlug: 'is-not-null',
    prerequisites: ['C12'],
    explanationFr:
      "IS NOT NULL fait l'inverse de IS NULL : il garde les lignes qui ONT une valeur (non vide).",
    exampleSql: 'SELECT * FROM members WHERE city IS NOT NULL;',
    exampleResultFr: "L'exemple garde les membres dont la ville est renseignée.",
    statementFr: "Affiche les livres dont l'auteur (author) est renseigné (non vide).",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c13-is-not-null',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT * FROM books WHERE author IS NOT NULL;',
      expected: {
        columns: ['id', 'title', 'author', 'year'],
        rows: [
          [1, 'Les Misérables', 'Victor Hugo', 1862],
          [2, 'Le Petit Prince', 'Antoine de Saint-Exupéry', 1943],
          [4, 'Le Petit Prince', 'Antoine de Saint-Exupéry', 1943],
          [5, 'Germinal', 'Émile Zola', 1885],
          [6, 'Vol de Nuit', 'Antoine de Saint-Exupéry', 1931],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['« Renseigné » = a une valeur.', 'Utilise IS NOT NULL.', 'La colonne à tester est author.'],
      explanationFr: "WHERE author IS NOT NULL garde les livres qui ont un auteur (on écarte celui dont l'auteur est NULL).",
    },
  },
  {
    slug: 'C14',
    moduleSlug: 'M6',
    moduleTitle: 'Filtres pratiques',
    position: 14,
    title: 'IN (une liste de valeurs)',
    conceptSlug: 'in-list',
    prerequisites: ['C7', 'C10'],
    explanationFr:
      "IN teste si une valeur fait partie d'une liste : colonne IN (v1, v2, v3). " +
      "C'est un raccourci pratique pour plusieurs OR sur la même colonne.",
    exampleSql: "SELECT * FROM members WHERE city IN ('Paris', 'Lyon');",
    exampleResultFr: "L'exemple garde les membres de Paris ou de Lyon.",
    statementFr: "Affiche les livres dont l'année est 1862, 1885 ou 1931 (utilise IN).",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c14-in',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT * FROM books WHERE year IN (1862, 1885, 1931);',
      expected: {
        columns: ['id', 'title', 'author', 'year'],
        rows: [
          [1, 'Les Misérables', 'Victor Hugo', 1862],
          [5, 'Germinal', 'Émile Zola', 1885],
          [6, 'Vol de Nuit', 'Antoine de Saint-Exupéry', 1931],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Utilise IN suivi d une liste entre parenthèses.', 'La colonne est year.', 'Sépare les valeurs par des virgules : (1862, 1885, 1931).'],
      explanationFr: "year IN (1862, 1885, 1931) garde les livres dont l'année est l'une de ces trois valeurs.",
    },
  },
  {
    slug: 'C15',
    moduleSlug: 'M6',
    moduleTitle: 'Filtres pratiques',
    position: 15,
    title: 'BETWEEN (un intervalle)',
    conceptSlug: 'between',
    prerequisites: ['C8'],
    explanationFr:
      "BETWEEN a AND b garde les valeurs comprises dans l'intervalle, BORNES INCLUSES. " +
      "Ici 1875 et 1931 existent pile aux bornes : BETWEEN les inclut (contrairement à un intervalle strict).",
    exampleSql: "SELECT * FROM members WHERE joined BETWEEN '2022-01-01' AND '2022-12-31';",
    exampleResultFr: "L'exemple garde les membres inscrits pendant l'année 2022.",
    statementFr: "Affiche les livres publiés entre 1875 et 1931 INCLUS (utilise BETWEEN).",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c15-between',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT * FROM books WHERE year BETWEEN 1875 AND 1931;',
      expected: {
        columns: ['id', 'title', 'author', 'year'],
        rows: [
          [3, 'Contes', null, 1875],
          [5, 'Germinal', 'Émile Zola', 1885],
          [6, 'Vol de Nuit', 'Antoine de Saint-Exupéry', 1931],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Utilise BETWEEN 1875 AND 1931.', 'Les bornes 1875 et 1931 sont INCLUSES.', 'La colonne est year.'],
      explanationFr: "year BETWEEN 1875 AND 1931 inclut les bornes : les livres de 1875 et de 1931 sont gardés, en plus de 1885.",
    },
  },
  {
    slug: 'C16',
    moduleSlug: 'M6',
    moduleTitle: 'Filtres pratiques',
    position: 16,
    title: 'LIKE (motif de texte)',
    conceptSlug: 'like',
    prerequisites: ['C7'],
    explanationFr:
      "LIKE cherche un motif dans du texte. Le caractère % remplace n'importe quelle suite de caractères " +
      "(y compris vide), et _ remplace exactement un caractère. Exemple : 'Le%' = « commence par Le ».",
    exampleSql: "SELECT * FROM books WHERE title LIKE 'Le%';",
    exampleResultFr: "L'exemple garde les titres qui commencent par « Le ».",
    statementFr: "Affiche les livres dont le titre se TERMINE par la lettre « s » (utilise LIKE).",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c16-like',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: "SELECT * FROM books WHERE title LIKE '%s';",
      expected: {
        columns: ['id', 'title', 'author', 'year'],
        rows: [
          [1, 'Les Misérables', 'Victor Hugo', 1862],
          [3, 'Contes', null, 1875],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Utilise LIKE avec le caractère %.', '« se termine par s » = le motif %s.', 'Le % remplace tout ce qui précède le s final.'],
      explanationFr: "title LIKE '%s' garde les titres finissant par s : « Les Misérables » et « Contes ».",
    },
  },
  {
    slug: 'C17',
    moduleSlug: 'M7',
    moduleTitle: 'Trier et limiter',
    position: 17,
    title: 'ORDER BY',
    conceptSlug: 'order-by',
    prerequisites: ['C4', 'C5'],
    explanationFr:
      "Sans tri, l'ordre des lignes n'est pas garanti. ORDER BY colonne trie le résultat (croissant par défaut). " +
      "Ici l'ordre du résultat compte : il sera vérifié.",
    exampleSql: 'SELECT * FROM members ORDER BY name;',
    exampleResultFr: "L'exemple trie les membres par nom, de A à Z.",
    statementFr: "Affiche tous les membres triés par date d'inscription (joined) croissante, du plus ancien au plus récent.",
    tables: [MEMBERS_TABLE],
    gatingExerciseSlug: 'gate-c17-order-by',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT * FROM members ORDER BY joined;',
      expected: {
        columns: ['id', 'name', 'city', 'joined'],
        rows: [
          [1, 'Alice', 'Paris', '2021-03-01'],
          [3, 'Chloé', 'Lyon', '2021-11-20'],
          [5, 'Emma', 'Paris', '2022-05-30'],
          [2, 'Bruno', null, '2022-07-15'],
          [4, 'David', null, '2023-01-05'],
        ],
      },
      compare: { orderSensitive: true, compareColumnNames: false },
      hints: ['Utilise ORDER BY.', 'Trie sur la colonne joined.', 'Croissant = du plus ancien au plus récent (ordre par défaut).'],
      explanationFr: "ORDER BY joined classe les membres par date d'inscription croissante. L'ordre des lignes est vérifié ici.",
    },
  },
  {
    slug: 'C18',
    moduleSlug: 'M7',
    moduleTitle: 'Trier et limiter',
    position: 18,
    title: 'ORDER BY DESC et deuxième clé',
    conceptSlug: 'order-by-desc',
    prerequisites: ['C17'],
    explanationFr:
      "DESC trie en décroissant. En cas d'égalité, on ajoute une deuxième colonne de tri pour départager " +
      "(ORDER BY colonne1 DESC, colonne2). Ici deux livres ont la même année 1943 : le id les départage.",
    exampleSql: 'SELECT * FROM members ORDER BY city;',
    exampleResultFr: "L'exemple trie les membres par ville (croissant).",
    statementFr: "Affiche les livres triés par année DÉCROISSANTE, puis par id CROISSANT en cas d'égalité (ORDER BY year DESC, id).",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c18-order-desc',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT * FROM books ORDER BY year DESC, id;',
      expected: {
        columns: ['id', 'title', 'author', 'year'],
        rows: [
          [2, 'Le Petit Prince', 'Antoine de Saint-Exupéry', 1943],
          [4, 'Le Petit Prince', 'Antoine de Saint-Exupéry', 1943],
          [6, 'Vol de Nuit', 'Antoine de Saint-Exupéry', 1931],
          [5, 'Germinal', 'Émile Zola', 1885],
          [3, 'Contes', null, 1875],
          [1, 'Les Misérables', 'Victor Hugo', 1862],
        ],
      },
      compare: { orderSensitive: true, compareColumnNames: false },
      hints: ['Décroissant = DESC après la colonne.', 'Trie d abord par year DESC.', 'Ajoute , id pour départager les deux livres de 1943.'],
      explanationFr: "ORDER BY year DESC, id trie par année décroissante ; les deux livres de 1943 sont départagés par id croissant.",
    },
  },
  {
    slug: 'C19',
    moduleSlug: 'M7',
    moduleTitle: 'Trier et limiter',
    position: 19,
    title: 'LIMIT',
    conceptSlug: 'limit',
    prerequisites: ['C17'],
    explanationFr:
      "LIMIT n ne garde que les n premières lignes du résultat. On l'utilise presque toujours avec ORDER BY, " +
      "sinon « les premières » n'a pas de sens précis.",
    exampleSql: 'SELECT * FROM members ORDER BY joined LIMIT 2;',
    exampleResultFr: "L'exemple garde les 2 membres inscrits le plus tôt.",
    statementFr: "Affiche les 3 livres les plus anciens : trie par année croissante (puis id croissant) et limite à 3 résultats.",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c19-limit',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT * FROM books ORDER BY year, id LIMIT 3;',
      expected: {
        columns: ['id', 'title', 'author', 'year'],
        rows: [
          [1, 'Les Misérables', 'Victor Hugo', 1862],
          [3, 'Contes', null, 1875],
          [5, 'Germinal', 'Émile Zola', 1885],
        ],
      },
      compare: { orderSensitive: true, compareColumnNames: false },
      hints: ['Trie par year croissant, puis ajoute LIMIT 3.', 'Ajoute , id pour un ordre stable.', 'LIMIT se place à la fin de la requête.'],
      explanationFr: "ORDER BY year, id LIMIT 3 garde les 3 livres les plus anciens (1862, 1875, 1885).",
    },
  },
  {
    slug: 'C20',
    moduleSlug: 'M7',
    moduleTitle: 'Trier et limiter',
    position: 20,
    title: 'DISTINCT (sans doublon)',
    conceptSlug: 'distinct',
    prerequisites: ['C5'],
    explanationFr:
      "DISTINCT supprime les doublons du résultat. Ici l'auteur « Antoine de Saint-Exupéry » apparaît sur " +
      "trois livres : sans DISTINCT il sortirait trois fois, avec DISTINCT une seule.",
    exampleSql: 'SELECT DISTINCT city FROM members;',
    exampleResultFr: "L'exemple liste les villes des membres, chaque ville une seule fois.",
    statementFr: "Affiche la liste des auteurs (author) SANS DOUBLON (utilise DISTINCT).",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c20-distinct',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT DISTINCT author FROM books;',
      expected: {
        columns: ['author'],
        rows: [['Victor Hugo'], ['Antoine de Saint-Exupéry'], [null], ['Émile Zola']],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Ajoute DISTINCT juste après SELECT.', 'Sélectionne seulement la colonne author.', "Chaque auteur n'apparaît qu'une fois (NULL compris)."],
      explanationFr: "SELECT DISTINCT author supprime les répétitions : Saint-Exupéry n'apparaît qu'une fois, et NULL compte comme une valeur.",
    },
  },
];

const BY_SLUG = new Map(CARDS.map((c) => [c.slug, c]));

// Enforce authoring rule (DESIGN §12.6.a): a card's gating query must differ from its example.
export function assertAuthoringRules(): void {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/;+\s*$/, '').toLowerCase();
  for (const c of CARDS) {
    if (c.gating.kind === 'sql' && c.exampleSql && norm(c.exampleSql) === norm(c.gating.solutionSql)) {
      throw new Error(`Authoring rule violated: card ${c.slug} gating solution equals its on-card example.`);
    }
  }
}

export function orderedCards(): Card[] {
  return [...CARDS].sort((a, b) => a.position - b.position);
}

export function getCard(slug: string): Card | undefined {
  return BY_SLUG.get(slug);
}

export function nextCardSlug(slug: string): string | null {
  const ordered = orderedCards();
  const idx = ordered.findIndex((c) => c.slug === slug);
  if (idx < 0 || idx + 1 >= ordered.length) return null;
  return ordered[idx + 1].slug;
}

// Public projection of a card: everything the client needs to render it, WITHOUT the
// solution, the expected result, or the correct quiz index.
export function toPublicCard(card: Card) {
  const gatingPublic =
    card.gating.kind === 'quiz'
      ? { kind: 'quiz' as const, questionFr: card.gating.questionFr, options: card.gating.options, hintCount: card.gating.hints.length }
      : { kind: 'sql' as const, hintCount: card.gating.hints.length };
  return {
    slug: card.slug,
    moduleSlug: card.moduleSlug,
    moduleTitle: card.moduleTitle,
    position: card.position,
    title: card.title,
    conceptSlug: card.conceptSlug,
    prerequisites: card.prerequisites,
    explanationFr: card.explanationFr,
    exampleSql: card.exampleSql ?? null,
    exampleResultFr: card.exampleResultFr ?? null,
    statementFr: card.statementFr,
    tables: card.tables ?? [],
    gating: gatingPublic,
    practice: card.practice ?? [],
  };
}
