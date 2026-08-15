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

// Mutating cards (INSERT/UPDATE/DELETE/DDL): run in an isolated per-user work DB, validated on
// the FINAL STATE via a hidden verification query (never sent to the client).
export interface MutationGating {
  kind: 'mutation';
  permissions: 'dml' | 'ddl';
  schemaSql: string; // CREATE TABLE(s) for the work DB
  seedSql: string; // initial rows
  solutionSql: string; // reference statement (never sent early)
  verifySql: string; // hidden SELECT run after the learner's statement
  expected: { columns: string[]; rows: (string | number | null)[][] };
  compare: { orderSensitive: boolean; compareColumnNames: boolean };
  allowMultiStatement?: boolean; // transactions need several statements
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
  gating: QuizGating | SqlGating | MutationGating;
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
    [4, 'Courrier Sud', 'Antoine de Saint-Exupéry', 1943],
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

const LOANS_TABLE: TableSchema = {
  name: 'loans',
  columns: [
    { name: 'id', type: 'INT', pk: true },
    { name: 'member_id', type: 'INT', fk: 'members.id' },
    { name: 'book_id', type: 'INT', fk: 'books.id' },
    { name: 'loan_date', type: 'DATE' },
    { name: 'returned', type: 'TINYINT(1)', note: '0 = non rendu, 1 = rendu' },
  ],
  sampleRows: [
    [1, 1, 1, '2023-01-10', 1],
    [2, 1, 2, '2023-02-15', 0],
    [3, 2, 2, '2023-03-01', 1],
    [4, 3, 5, '2023-03-20', 0],
    [5, 5, 1, '2023-04-05', 1],
  ],
};

const FINES_TABLE: TableSchema = {
  name: 'fines',
  columns: [
    { name: 'id', type: 'INT', pk: true },
    { name: 'member_id', type: 'INT', fk: 'members.id' },
    { name: 'amount', type: 'DECIMAL(6,2)' },
    { name: 'paid', type: 'TINYINT(1)' },
  ],
  sampleRows: [
    [1, 1, '5.50', 1],
    [2, 1, '2.00', 0],
    [3, 3, '10.00', 0],
    [4, 2, '3.25', 1],
  ],
};

const EMPLOYEES_TABLE: TableSchema = {
  name: 'employees',
  columns: [
    { name: 'id', type: 'INT', pk: true },
    { name: 'name', type: 'VARCHAR(60)' },
    { name: 'manager_id', type: 'INT', fk: 'employees.id', note: 'NULL si pas de chef' },
  ],
  sampleRows: [
    [1, 'Diane', null],
    [2, 'Karim', 1],
    [3, 'Léa', 1],
    [4, 'Tom', 2],
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
          ['Courrier Sud', 1943],
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
          [4, 'Courrier Sud', 'Antoine de Saint-Exupéry', 1943],
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
          [4, 'Courrier Sud', 'Antoine de Saint-Exupéry', 1943],
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
          [4, 'Courrier Sud', 'Antoine de Saint-Exupéry', 1943],
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
      "(ORDER BY colonne1 DESC, colonne2). Ici deux livres partagent l'année 1943 : c'est le titre qui les départage, " +
      "dans un ordre différent de celui du tableau.",
    exampleSql: 'SELECT * FROM members ORDER BY city ASC, name ASC;',
    exampleResultFr: "L'exemple trie les membres par ville, puis par nom quand la ville est identique.",
    statementFr: "Affiche les livres triés par année DÉCROISSANTE, puis par titre (title) CROISSANT en cas d'égalité (ORDER BY year DESC, title ASC).",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c18-order-desc',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT * FROM books ORDER BY year DESC, title ASC;',
      expected: {
        columns: ['id', 'title', 'author', 'year'],
        rows: [
          [4, 'Courrier Sud', 'Antoine de Saint-Exupéry', 1943],
          [2, 'Le Petit Prince', 'Antoine de Saint-Exupéry', 1943],
          [6, 'Vol de Nuit', 'Antoine de Saint-Exupéry', 1931],
          [5, 'Germinal', 'Émile Zola', 1885],
          [3, 'Contes', null, 1875],
          [1, 'Les Misérables', 'Victor Hugo', 1862],
        ],
      },
      compare: { orderSensitive: true, compareColumnNames: false },
      hints: ['Décroissant = DESC après la colonne.', 'Trie d abord par year DESC.', 'Ajoute , title ASC : pour 1943, « Courrier Sud » passe avant « Le Petit Prince ».'],
      explanationFr:
        "ORDER BY year DESC, title ASC trie par année décroissante, puis départage les deux livres de 1943 par titre : « Courrier Sud » avant « Le Petit Prince ». Avec seulement year DESC, l'ordre des ex-æquo serait différent.",
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
  {
    slug: 'C21',
    moduleSlug: 'M8',
    moduleTitle: 'Transformer les valeurs',
    position: 21,
    title: 'Fonctions texte',
    conceptSlug: 'text-functions',
    prerequisites: ['C5', 'C6'],
    explanationFr:
      "Des fonctions transforment le texte à l'affichage : UPPER(x) met en majuscules, LOWER(x) en minuscules, " +
      "LENGTH(x) donne le nombre de caractères, CONCAT(a, b) colle deux textes. Elles ne changent pas la table.",
    exampleSql: 'SELECT UPPER(title) FROM books;',
    exampleResultFr: "L'exemple affiche les titres des livres en majuscules.",
    statementFr: "Affiche le nom de chaque membre en MAJUSCULES, sous l'étiquette nom_maj (utilise UPPER).",
    tables: [MEMBERS_TABLE],
    gatingExerciseSlug: 'gate-c21-text',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT UPPER(name) AS nom_maj FROM members;',
      expected: {
        columns: ['nom_maj'],
        rows: [['ALICE'], ['BRUNO'], ['CHLOÉ'], ['DAVID'], ['EMMA']],
      },
      compare: { orderSensitive: false, compareColumnNames: true },
      hints: ['La fonction pour les majuscules est UPPER.', 'Applique-la sur la colonne name.', "N'oublie pas l'étiquette AS nom_maj."],
      explanationFr: "UPPER(name) met chaque nom en majuscules ; AS nom_maj nomme la colonne affichée.",
    },
  },
  {
    slug: 'C22',
    moduleSlug: 'M8',
    moduleTitle: 'Transformer les valeurs',
    position: 22,
    title: 'Calculs sur les nombres',
    conceptSlug: 'number-functions',
    prerequisites: ['C6'],
    explanationFr:
      "On peut calculer une colonne dérivée avec les opérateurs + - * / , et des fonctions comme ROUND(x) " +
      "(arrondi) ou ABS(x) (valeur absolue). Le résultat est une nouvelle colonne calculée.",
    exampleSql: 'SELECT id, year + 100 AS annee_plus_100 FROM books;',
    exampleResultFr: "L'exemple ajoute 100 à chaque année.",
    statementFr: "Affiche le titre et l'ancienneté de chaque livre en 2025 (2025 - year), sous l'étiquette anciennete.",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c22-number',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT title, 2025 - year AS anciennete FROM books;',
      expected: {
        columns: ['title', 'anciennete'],
        rows: [
          ['Les Misérables', 163],
          ['Le Petit Prince', 82],
          ['Contes', 150],
          ['Courrier Sud', 82],
          ['Germinal', 140],
          ['Vol de Nuit', 94],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ["L'ancienneté = 2025 moins l'année.", 'Écris le calcul directement : 2025 - year.', 'Nomme la colonne AS anciennete.'],
      explanationFr: "2025 - year calcule l'ancienneté du livre ; c'est une colonne calculée à partir de year.",
    },
  },
  {
    slug: 'C23',
    moduleSlug: 'M8',
    moduleTitle: 'Transformer les valeurs',
    position: 23,
    title: 'Fonctions de date',
    conceptSlug: 'date-functions',
    prerequisites: ['C6'],
    explanationFr:
      "Des fonctions extraient une partie d'une date : YEAR(d) donne l'année, MONTH(d) le mois, DAY(d) le jour. " +
      "DATEDIFF(d1, d2) donne le nombre de jours entre deux dates.",
    exampleSql: 'SELECT name, MONTH(joined) AS mois FROM members;',
    exampleResultFr: "L'exemple extrait le mois d'inscription de chaque membre.",
    statementFr: "Affiche le nom et l'année d'inscription de chaque membre (YEAR de joined), sous l'étiquette annee_inscription.",
    tables: [MEMBERS_TABLE],
    gatingExerciseSlug: 'gate-c23-date',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT name, YEAR(joined) AS annee_inscription FROM members;',
      expected: {
        columns: ['name', 'annee_inscription'],
        rows: [
          ['Alice', 2021],
          ['Bruno', 2022],
          ['Chloé', 2021],
          ['David', 2023],
          ['Emma', 2022],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: true },
      hints: ["La fonction pour l'année est YEAR.", 'Applique-la sur la colonne joined.', "Nomme la colonne AS annee_inscription."],
      explanationFr: "YEAR(joined) extrait l'année de la date d'inscription.",
    },
  },
  {
    slug: 'C24',
    moduleSlug: 'M8',
    moduleTitle: 'Transformer les valeurs',
    position: 24,
    title: 'CASE — catégoriser',
    conceptSlug: 'case',
    prerequisites: ['C8'],
    explanationFr:
      "CASE crée une colonne selon des conditions : CASE WHEN condition THEN valeur ... ELSE valeur END. " +
      "C'est comme un « si… alors… sinon… » pour classer chaque ligne.",
    exampleSql: "SELECT title, CASE WHEN year < 1900 THEN 'ancien' ELSE 'récent' END AS periode FROM books;",
    exampleResultFr: "L'exemple étiquette chaque livre « ancien » ou « récent ».",
    statementFr: "Affiche le titre et le siècle : 'XIXe' si l'année est inférieure à 1900, sinon 'XXe' (colonne siecle).",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c24-case',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: "SELECT title, CASE WHEN year < 1900 THEN 'XIXe' ELSE 'XXe' END AS siecle FROM books;",
      expected: {
        columns: ['title', 'siecle'],
        rows: [
          ['Les Misérables', 'XIXe'],
          ['Le Petit Prince', 'XXe'],
          ['Contes', 'XIXe'],
          ['Courrier Sud', 'XXe'],
          ['Germinal', 'XIXe'],
          ['Vol de Nuit', 'XXe'],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Structure : CASE WHEN year < 1900 THEN ... ELSE ... END.', "Les étiquettes sont 'XIXe' et 'XXe'.", "N'oublie pas END (et l'alias AS siecle)."],
      explanationFr: "CASE teste year < 1900 : si vrai « XIXe », sinon « XXe ». Chaque ligne reçoit son siècle.",
    },
  },
  {
    slug: 'C25',
    moduleSlug: 'M9',
    moduleTitle: 'Agréger',
    position: 25,
    title: 'COUNT (compter)',
    conceptSlug: 'count',
    prerequisites: ['C7'],
    explanationFr:
      "COUNT compte des lignes. COUNT(*) compte toutes les lignes ; COUNT(colonne) ne compte que les lignes " +
      "où la colonne n'est PAS NULL. La différence se voit dès qu'il y a des valeurs manquantes.",
    exampleSql: 'SELECT COUNT(*) FROM members;',
    exampleResultFr: "L'exemple compte le nombre total de membres.",
    statementFr: "Combien de livres ont un auteur RENSEIGNÉ ? Compte les auteurs non NULL (COUNT(author)).",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c25-count',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT COUNT(author) FROM books;',
      expected: { columns: ['COUNT(author)'], rows: [[5]] },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Utilise COUNT.', 'COUNT(author) ignore les valeurs NULL.', 'COUNT(*) donnerait 6 ; ici on veut 5.'],
      explanationFr: "COUNT(author) = 5 car le livre sans auteur (NULL) n'est pas compté ; COUNT(*) aurait donné 6.",
    },
  },
  {
    slug: 'C26',
    moduleSlug: 'M9',
    moduleTitle: 'Agréger',
    position: 26,
    title: 'SUM et AVG',
    conceptSlug: 'sum-avg',
    prerequisites: ['C25'],
    explanationFr:
      "SUM(colonne) additionne des nombres ; AVG(colonne) en donne la moyenne. On les utilise sur des colonnes " +
      "numériques (ici des montants DECIMAL, calculés de façon exacte).",
    exampleSql: 'SELECT AVG(amount) FROM fines;',
    exampleResultFr: "L'exemple donne le montant moyen des amendes.",
    statementFr: "Calcule le montant TOTAL des amendes (SUM de amount) de la table fines.",
    tables: [FINES_TABLE],
    gatingExerciseSlug: 'gate-c26-sum',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT SUM(amount) FROM fines;',
      expected: { columns: ['SUM(amount)'], rows: [['20.75']] },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Utilise SUM sur la colonne amount.', 'SUM additionne toutes les valeurs.', 'Le total attendu est 20.75.'],
      explanationFr: "SUM(amount) additionne 5.50 + 2.00 + 10.00 + 3.25 = 20.75 (calcul exact en DECIMAL).",
    },
  },
  {
    slug: 'C27',
    moduleSlug: 'M9',
    moduleTitle: 'Agréger',
    position: 27,
    title: 'MIN et MAX',
    conceptSlug: 'min-max',
    prerequisites: ['C25'],
    explanationFr:
      "MIN(colonne) donne la plus petite valeur, MAX(colonne) la plus grande. Utile pour trouver un extrême " +
      "(la plus vieille année, le plus gros montant…).",
    exampleSql: 'SELECT MAX(year) FROM books;',
    exampleResultFr: "L'exemple donne l'année du livre le plus récent.",
    statementFr: "Quelle est l'année du livre le PLUS ANCIEN ? (MIN de year)",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c27-min',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT MIN(year) FROM books;',
      expected: { columns: ['MIN(year)'], rows: [[1862]] },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['« Le plus ancien » = la plus petite année.', 'Utilise MIN sur la colonne year.', 'La réponse attendue est 1862.'],
      explanationFr: "MIN(year) renvoie la plus petite année, ici 1862 (Les Misérables).",
    },
  },
  {
    slug: 'C28',
    moduleSlug: 'M10',
    moduleTitle: 'Regrouper',
    position: 28,
    title: 'GROUP BY',
    conceptSlug: 'group-by',
    prerequisites: ['C25'],
    explanationFr:
      "GROUP BY regroupe les lignes qui partagent une même valeur, puis applique une agrégation (COUNT, SUM…) " +
      "à chaque groupe. On obtient une ligne par groupe.",
    exampleSql: 'SELECT city, COUNT(*) FROM members GROUP BY city;',
    exampleResultFr: "L'exemple compte les membres par ville.",
    statementFr: "Pour chaque auteur, affiche l'auteur et le NOMBRE de ses livres (GROUP BY author).",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c28-group-by',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT author, COUNT(*) FROM books GROUP BY author;',
      expected: {
        columns: ['author', 'COUNT(*)'],
        rows: [
          ['Victor Hugo', 1],
          ['Antoine de Saint-Exupéry', 3],
          [null, 1],
          ['Émile Zola', 1],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Regroupe avec GROUP BY author.', 'Compte chaque groupe avec COUNT(*).', 'Saint-Exupéry a 3 livres, les autres 1.'],
      explanationFr: "GROUP BY author fait un groupe par auteur ; COUNT(*) compte les livres de chacun (Saint-Exupéry = 3).",
    },
  },
  {
    slug: 'C29',
    moduleSlug: 'M10',
    moduleTitle: 'Regrouper',
    position: 29,
    title: 'HAVING (filtrer les groupes)',
    conceptSlug: 'having',
    prerequisites: ['C28'],
    explanationFr:
      "HAVING filtre les GROUPES après un GROUP BY (alors que WHERE filtre les lignes avant le regroupement). " +
      "On l'utilise pour ne garder que les groupes qui respectent une condition sur l'agrégat.",
    exampleSql: 'SELECT city, COUNT(*) FROM members GROUP BY city HAVING COUNT(*) >= 2;',
    exampleResultFr: "L'exemple ne garde que les villes ayant au moins 2 membres.",
    statementFr: "Affiche les auteurs qui ont PLUS D'UN livre : l'auteur et son nombre de livres (GROUP BY + HAVING COUNT(*) > 1).",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c29-having',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT author, COUNT(*) FROM books GROUP BY author HAVING COUNT(*) > 1;',
      expected: {
        columns: ['author', 'COUNT(*)'],
        rows: [['Antoine de Saint-Exupéry', 3]],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Commence par GROUP BY author.', 'Filtre les groupes avec HAVING COUNT(*) > 1.', "WHERE ne marche pas sur un agrégat : il faut HAVING."],
      explanationFr: "HAVING COUNT(*) > 1 ne garde que les groupes de plus d'un livre : seul Saint-Exupéry (3).",
    },
  },
  {
    slug: 'C30',
    moduleSlug: 'M11',
    moduleTitle: 'Relier les tables',
    position: 30,
    title: 'Clés primaire et étrangère',
    conceptSlug: 'primary-foreign-key',
    prerequisites: ['C1', 'C2'],
    explanationFr:
      "Une clé primaire (PRIMARY KEY) identifie chaque ligne de façon unique (souvent la colonne id). " +
      "Une clé étrangère (FOREIGN KEY) est une colonne qui référence la clé primaire d'une autre table, " +
      "pour relier les données. Dans loans, member_id pointe vers members.id et book_id vers books.id.",
    statementFr: "Dans la table loans, member_id référence un membre de la table members. Comment appelle-t-on ce type de colonne ?",
    tables: [LOANS_TABLE],
    gatingExerciseSlug: 'gate-c30-keys',
    gating: {
      kind: 'quiz',
      questionFr: "member_id (qui référence members.id) est…",
      options: [
        'une clé primaire (PRIMARY KEY)',
        'une clé étrangère (FOREIGN KEY)',
        'un simple alias',
        'une valeur NULL',
      ],
      correctIndex: 1,
      hints: ['La clé primaire identifie la ligne (id).', 'Ici la colonne pointe vers une AUTRE table.'],
      explanationFr: "member_id est une clé étrangère : elle référence la clé primaire (id) de la table members.",
    },
  },
  {
    slug: 'C31',
    moduleSlug: 'M11',
    moduleTitle: 'Relier les tables',
    position: 31,
    title: 'INNER JOIN',
    conceptSlug: 'inner-join',
    prerequisites: ['C30', 'C5'],
    explanationFr:
      "INNER JOIN relie deux tables sur une condition (souvent clé étrangère = clé primaire) et ne garde que " +
      "les lignes qui ont une correspondance dans les deux tables. On écrit table1 INNER JOIN table2 ON ...",
    exampleSql: 'SELECT * FROM loans INNER JOIN members ON loans.member_id = members.id;',
    exampleResultFr: "L'exemple relie chaque emprunt à son membre (toutes les colonnes).",
    statementFr: "Pour chaque emprunt, affiche le nom du membre (members.name) et l'identifiant du livre (loans.book_id).",
    tables: [MEMBERS_TABLE, LOANS_TABLE],
    gatingExerciseSlug: 'gate-c31-inner-join',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT members.name, loans.book_id FROM members INNER JOIN loans ON members.id = loans.member_id;',
      expected: {
        columns: ['name', 'book_id'],
        rows: [
          ['Alice', 1],
          ['Alice', 2],
          ['Bruno', 2],
          ['Chloé', 5],
          ['Emma', 1],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Relie members et loans avec INNER JOIN ... ON.', 'La condition est members.id = loans.member_id.', 'David (sans emprunt) ne doit PAS apparaître.'],
      explanationFr: "INNER JOIN ne garde que les correspondances : les 5 emprunts avec leur membre. David, sans emprunt, est absent.",
    },
  },
  {
    slug: 'C32',
    moduleSlug: 'M11',
    moduleTitle: 'Relier les tables',
    position: 32,
    title: 'LEFT JOIN',
    conceptSlug: 'left-join',
    prerequisites: ['C31'],
    explanationFr:
      "LEFT JOIN garde TOUTES les lignes de la table de gauche, même sans correspondance à droite : les colonnes " +
      "manquantes valent alors NULL. Idéal pour repérer ce qui n'a pas de lien (un membre sans emprunt).",
    exampleSql: 'SELECT books.title, loans.id FROM books LEFT JOIN loans ON books.id = loans.book_id;',
    exampleResultFr: "L'exemple liste tous les livres, même ceux jamais empruntés (loans.id = NULL).",
    statementFr: "Affiche le nom de TOUS les membres et l'id du livre emprunté (loans.book_id), y compris les membres sans emprunt (LEFT JOIN).",
    tables: [MEMBERS_TABLE, LOANS_TABLE],
    gatingExerciseSlug: 'gate-c32-left-join',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT members.name, loans.book_id FROM members LEFT JOIN loans ON members.id = loans.member_id;',
      expected: {
        columns: ['name', 'book_id'],
        rows: [
          ['Alice', 1],
          ['Alice', 2],
          ['Bruno', 2],
          ['Chloé', 5],
          ['David', null],
          ['Emma', 1],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Utilise LEFT JOIN pour garder tous les membres.', 'members est la table de gauche.', 'David doit apparaître avec book_id = NULL.'],
      explanationFr: "LEFT JOIN garde tous les membres ; David, sans emprunt, apparaît avec book_id NULL (un INNER JOIN l'aurait exclu).",
    },
  },
  {
    slug: 'C33',
    moduleSlug: 'M11',
    moduleTitle: 'Relier les tables',
    position: 33,
    title: 'Jointures multiples',
    conceptSlug: 'multi-join',
    prerequisites: ['C31'],
    explanationFr:
      "On peut enchaîner plusieurs JOIN pour relier trois tables ou plus : ici members → loans → books, " +
      "afin d'afficher côte à côte des informations venant des trois tables.",
    exampleSql: 'SELECT loans.id, members.name FROM loans INNER JOIN members ON members.id = loans.member_id;',
    exampleResultFr: "L'exemple relie emprunts et membres (deux tables).",
    statementFr: "Pour chaque emprunt, affiche le nom du membre (members.name) et le TITRE du livre (books.title) — relie members, loans et books.",
    tables: [MEMBERS_TABLE, LOANS_TABLE, BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c33-multi-join',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql:
        'SELECT members.name, books.title FROM members INNER JOIN loans ON members.id = loans.member_id INNER JOIN books ON books.id = loans.book_id;',
      expected: {
        columns: ['name', 'title'],
        rows: [
          ['Alice', 'Les Misérables'],
          ['Alice', 'Le Petit Prince'],
          ['Bruno', 'Le Petit Prince'],
          ['Chloé', 'Germinal'],
          ['Emma', 'Les Misérables'],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Enchaîne deux INNER JOIN : members→loans puis loans→books.', 'loans relie members.id et books.id.', 'Affiche members.name et books.title.'],
      explanationFr: "Deux jointures relient les trois tables : chaque emprunt montre le membre et le titre du livre.",
    },
  },
  {
    slug: 'C34',
    moduleSlug: 'M11',
    moduleTitle: 'Relier les tables',
    position: 34,
    title: 'Autojointure',
    conceptSlug: 'self-join',
    prerequisites: ['C31'],
    explanationFr:
      "Une autojointure relie une table à ELLE-MÊME, avec deux alias différents. Utile quand une colonne " +
      "référence la même table : ici employees.manager_id pointe vers un autre employee.",
    exampleSql: 'SELECT e.name, m.name FROM employees e LEFT JOIN employees m ON e.manager_id = m.id;',
    exampleResultFr: "L'exemple (LEFT JOIN) montre aussi Diane, qui n'a pas de chef (NULL).",
    statementFr: "Affiche le nom de chaque employé et le nom de son chef. Emploie une autojointure (INNER) sur employees — les employés sans chef sont exclus.",
    tables: [EMPLOYEES_TABLE],
    gatingExerciseSlug: 'gate-c34-self-join',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT e.name, m.name FROM employees e INNER JOIN employees m ON e.manager_id = m.id;',
      expected: {
        columns: ['name', 'name'],
        rows: [
          ['Karim', 'Diane'],
          ['Léa', 'Diane'],
          ['Tom', 'Karim'],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Utilise deux alias de la même table : employees e et employees m.', 'Relie e.manager_id = m.id.', 'Diane (sans chef) est exclue par le INNER JOIN.'],
      explanationFr: "L'autojointure relie chaque employé (e) à son chef (m) via manager_id. Diane, sans chef, est absente (INNER).",
    },
  },
  {
    slug: 'C35',
    moduleSlug: 'M12',
    moduleTitle: 'Requêtes imbriquées',
    position: 35,
    title: 'Sous-requête (une valeur)',
    conceptSlug: 'scalar-subquery',
    prerequisites: ['C8', 'C26'],
    explanationFr:
      "Une sous-requête est une requête à l'intérieur d'une autre, entre parenthèses. Quand elle renvoie UNE " +
      "seule valeur, on peut la comparer : WHERE colonne > (SELECT ... ). Ici on compare à la moyenne des années.",
    exampleSql: 'SELECT * FROM books WHERE year = (SELECT MAX(year) FROM books);',
    exampleResultFr: "L'exemple garde le(s) livre(s) de l'année la plus récente.",
    statementFr: "Affiche les livres dont l'année est SUPÉRIEURE à la moyenne des années (utilise une sous-requête avec AVG).",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c35-scalar-subquery',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT * FROM books WHERE year > (SELECT AVG(year) FROM books);',
      expected: {
        columns: ['id', 'title', 'author', 'year'],
        rows: [
          [2, 'Le Petit Prince', 'Antoine de Saint-Exupéry', 1943],
          [4, 'Courrier Sud', 'Antoine de Saint-Exupéry', 1943],
          [6, 'Vol de Nuit', 'Antoine de Saint-Exupéry', 1931],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Mets la moyenne dans une sous-requête : (SELECT AVG(year) FROM books).', 'Compare year à cette valeur avec >.', 'La moyenne vaut 1906,5.'],
      explanationFr: "La sous-requête calcule la moyenne (1906,5) ; on garde les livres dont year est au-dessus : 1931 et 1943.",
    },
  },
  {
    slug: 'C36',
    moduleSlug: 'M12',
    moduleTitle: 'Requêtes imbriquées',
    position: 36,
    title: 'Sous-requête avec IN',
    conceptSlug: 'in-subquery',
    prerequisites: ['C14', 'C35'],
    explanationFr:
      "Une sous-requête peut renvoyer une LISTE de valeurs, utilisée avec IN : garder les lignes dont une " +
      "colonne fait partie du résultat d'une autre requête.",
    exampleSql: 'SELECT * FROM books WHERE id IN (SELECT book_id FROM loans);',
    exampleResultFr: "L'exemple garde les livres qui ont été empruntés au moins une fois.",
    statementFr: "Affiche les membres qui ont AU MOINS UN emprunt (id IN une sous-requête sur loans).",
    tables: [MEMBERS_TABLE, LOANS_TABLE],
    gatingExerciseSlug: 'gate-c36-in-subquery',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT * FROM members WHERE id IN (SELECT member_id FROM loans);',
      expected: {
        columns: ['id', 'name', 'city', 'joined'],
        rows: [
          [1, 'Alice', 'Paris', '2021-03-01'],
          [2, 'Bruno', null, '2022-07-15'],
          [3, 'Chloé', 'Lyon', '2021-11-20'],
          [5, 'Emma', 'Paris', '2022-05-30'],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['La sous-requête donne les member_id présents dans loans.', 'Utilise WHERE id IN (SELECT member_id FROM loans).', 'David (aucun emprunt) est exclu.'],
      explanationFr: "id IN (SELECT member_id FROM loans) garde les membres qui apparaissent dans loans. David, absent de loans, est exclu.",
    },
  },
  {
    slug: 'C37',
    moduleSlug: 'M12',
    moduleTitle: 'Requêtes imbriquées',
    position: 37,
    title: 'Sous-requête corrélée',
    conceptSlug: 'correlated-subquery',
    prerequisites: ['C36', 'C25'],
    explanationFr:
      "Une sous-requête corrélée dépend de la ligne courante de la requête externe : elle est ré-évaluée pour " +
      "chaque ligne. Ici, pour chaque membre, on compte SES emprunts.",
    exampleSql: 'SELECT title, (SELECT COUNT(*) FROM loans WHERE loans.book_id = books.id) AS nb FROM books;',
    exampleResultFr: "L'exemple compte, pour chaque livre, combien de fois il a été emprunté.",
    statementFr: "Affiche chaque membre (name) et son NOMBRE d'emprunts (nb), avec une sous-requête corrélée sur loans.",
    tables: [MEMBERS_TABLE, LOANS_TABLE],
    gatingExerciseSlug: 'gate-c37-correlated',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT name, (SELECT COUNT(*) FROM loans WHERE loans.member_id = members.id) AS nb FROM members;',
      expected: {
        columns: ['name', 'nb'],
        rows: [
          ['Alice', 2],
          ['Bruno', 1],
          ['Chloé', 1],
          ['David', 0],
          ['Emma', 1],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['La sous-requête compte les loans du membre courant.', 'Corrèle avec WHERE loans.member_id = members.id.', 'David obtient 0 (aucun emprunt).'],
      explanationFr: "Pour chaque membre, la sous-requête corrélée compte ses emprunts ; David obtient 0.",
    },
  },
  {
    slug: 'C38',
    moduleSlug: 'M12',
    moduleTitle: 'Requêtes imbriquées',
    position: 38,
    title: 'EXISTS et NOT EXISTS',
    conceptSlug: 'exists',
    prerequisites: ['C37'],
    explanationFr:
      "EXISTS teste s'il existe AU MOINS une ligne correspondant à une sous-requête ; NOT EXISTS l'inverse. " +
      "Très utile pour trouver « ceux qui ont » ou « ceux qui n'ont pas » de lien.",
    exampleSql: 'SELECT * FROM members WHERE EXISTS (SELECT 1 FROM loans WHERE loans.member_id = members.id);',
    exampleResultFr: "L'exemple garde les membres qui ont au moins un emprunt.",
    statementFr: "Affiche les membres qui n'ont AUCUN emprunt (utilise NOT EXISTS sur loans).",
    tables: [MEMBERS_TABLE, LOANS_TABLE],
    gatingExerciseSlug: 'gate-c38-not-exists',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT * FROM members WHERE NOT EXISTS (SELECT 1 FROM loans WHERE loans.member_id = members.id);',
      expected: {
        columns: ['id', 'name', 'city', 'joined'],
        rows: [[4, 'David', null, '2023-01-05']],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['« Aucun emprunt » = NOT EXISTS.', 'La sous-requête cherche un loan du membre courant.', 'Seul David correspond.'],
      explanationFr: "NOT EXISTS garde les membres pour qui aucune ligne de loans ne correspond : seulement David.",
    },
  },
  {
    slug: 'C39',
    moduleSlug: 'M12',
    moduleTitle: 'Requêtes imbriquées',
    position: 39,
    title: 'CTE avec WITH',
    conceptSlug: 'cte',
    prerequisites: ['C28', 'C29'],
    explanationFr:
      "Une CTE (Common Table Expression) est une requête nommée définie avec WITH nom AS ( ... ), réutilisable " +
      "ensuite comme une table temporaire. Elle rend les requêtes complexes plus lisibles.",
    exampleSql: 'WITH recent AS (SELECT * FROM books WHERE year >= 1900) SELECT title FROM recent;',
    exampleResultFr: "L'exemple définit une CTE « recent » puis en lit les titres.",
    statementFr: "Avec une CTE qui compte les emprunts par membre (member_id, nb), affiche les membres ayant emprunté PLUS D'UN livre (member_id et nb).",
    tables: [LOANS_TABLE],
    gatingExerciseSlug: 'gate-c39-cte',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql:
        'WITH counts AS (SELECT member_id, COUNT(*) AS nb FROM loans GROUP BY member_id) SELECT member_id, nb FROM counts WHERE nb > 1;',
      expected: { columns: ['member_id', 'nb'], rows: [[1, 2]] },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Définis la CTE : WITH counts AS (SELECT member_id, COUNT(*) AS nb FROM loans GROUP BY member_id).', 'Puis SELECT ... FROM counts WHERE nb > 1.', 'Seul le membre 1 (Alice) a 2 emprunts.'],
      explanationFr: "La CTE « counts » calcule le nombre d'emprunts par membre ; on ne garde que ceux dont nb > 1 : le membre 1.",
    },
  },
  {
    slug: 'C40',
    moduleSlug: 'M12',
    moduleTitle: 'Requêtes imbriquées',
    position: 40,
    title: 'UNION',
    conceptSlug: 'union',
    prerequisites: ['C5'],
    explanationFr:
      "UNION empile les résultats de deux SELECT (mêmes colonnes) en un seul, et supprime les doublons " +
      "(UNION ALL les garde). Les deux SELECT doivent avoir le même nombre de colonnes, de types compatibles.",
    exampleSql: 'SELECT year FROM books WHERE year < 1900 UNION SELECT year FROM books WHERE year > 1940;',
    exampleResultFr: "L'exemple combine deux ensembles d'années en une seule liste.",
    statementFr: "Affiche en une seule colonne tous les prénoms : ceux des membres (name) ET ceux des employés (name), avec UNION.",
    tables: [MEMBERS_TABLE, EMPLOYEES_TABLE],
    gatingExerciseSlug: 'gate-c40-union',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT name FROM members UNION SELECT name FROM employees;',
      expected: {
        columns: ['name'],
        rows: [['Alice'], ['Bruno'], ['Chloé'], ['David'], ['Emma'], ['Diane'], ['Karim'], ['Léa'], ['Tom']],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Écris deux SELECT reliés par UNION.', 'SELECT name FROM members UNION SELECT name FROM employees.', 'Les deux SELECT ont une seule colonne de même type.'],
      explanationFr: "UNION empile les noms des deux tables en une liste unique (9 prénoms, sans doublon).",
    },
  },
  {
    slug: 'C41',
    moduleSlug: 'M12',
    moduleTitle: 'Requêtes imbriquées',
    position: 41,
    title: 'INTERSECT et EXCEPT',
    conceptSlug: 'intersect-except',
    prerequisites: ['C40'],
    explanationFr:
      "INTERSECT garde les lignes présentes dans les DEUX SELECT ; EXCEPT garde celles du premier qui ne sont " +
      "PAS dans le second. Disponibles depuis MySQL 8.0.31 (donc en 8.4).",
    exampleSql: 'SELECT id FROM books INTERSECT SELECT book_id FROM loans;',
    exampleResultFr: "L'exemple (INTERSECT) donne les livres qui ont été empruntés.",
    statementFr: "Affiche les id de livres qui n'ont JAMAIS été empruntés : les id de books SAUF ceux présents dans loans (utilise EXCEPT).",
    tables: [BOOKS_TABLE, LOANS_TABLE],
    gatingExerciseSlug: 'gate-c41-except',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql: 'SELECT id FROM books EXCEPT SELECT book_id FROM loans;',
      expected: { columns: ['id'], rows: [[3], [4], [6]] },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['EXCEPT = « ce qui est à gauche mais pas à droite ».', 'SELECT id FROM books EXCEPT SELECT book_id FROM loans.', 'Les livres 3, 4 et 6 n ont jamais été empruntés.'],
      explanationFr: "EXCEPT retire de la liste des id de books ceux qui apparaissent dans loans : restent 3, 4 et 6 (jamais empruntés).",
    },
  },
  {
    slug: 'C42',
    moduleSlug: 'M13',
    moduleTitle: 'Modifier les données',
    position: 42,
    title: 'INSERT (ajouter une ligne)',
    conceptSlug: 'insert',
    prerequisites: ['C3'],
    explanationFr:
      "INSERT ajoute une ligne dans une table : INSERT INTO table (colonnes) VALUES (valeurs). " +
      "Tu travailles ici sur TA copie isolée de la table todo : tu peux la modifier sans risque, et la réinitialiser.",
    exampleSql: "INSERT INTO todo (id, label, done) VALUES (9, 'Ranger le bureau', 0);",
    exampleResultFr: "L'exemple ajoute une tâche d'identifiant 9.",
    statementFr: "Ajoute une nouvelle tâche : id = 3, label = 'Faire les courses', done = 0 (INSERT dans todo).",
    tables: [
      {
        name: 'todo',
        columns: [
          { name: 'id', type: 'INT', pk: true },
          { name: 'label', type: 'VARCHAR(60)' },
          { name: 'done', type: 'TINYINT(1)', note: '0 = à faire, 1 = fait' },
        ],
        sampleRows: [
          [1, 'Acheter du pain', 0],
          [2, 'Lire un livre', 1],
        ],
      },
    ],
    gatingExerciseSlug: 'gate-c42-insert',
    gating: {
      kind: 'mutation',
      permissions: 'dml',
      schemaSql: 'CREATE TABLE todo (id INT PRIMARY KEY, label VARCHAR(60) NOT NULL, done TINYINT NOT NULL DEFAULT 0) ENGINE=InnoDB;',
      seedSql: "INSERT INTO todo (id, label, done) VALUES (1, 'Acheter du pain', 0), (2, 'Lire un livre', 1);",
      solutionSql: "INSERT INTO todo (id, label, done) VALUES (3, 'Faire les courses', 0);",
      verifySql: 'SELECT id, label, done FROM todo ORDER BY id;',
      expected: {
        columns: ['id', 'label', 'done'],
        rows: [
          [1, 'Acheter du pain', 0],
          [2, 'Lire un livre', 1],
          [3, 'Faire les courses', 0],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Utilise INSERT INTO todo (id, label, done) VALUES (...).', "Les valeurs : 3, 'Faire les courses', 0.", "Le texte va entre apostrophes."],
      explanationFr: "INSERT ajoute la ligne (3, 'Faire les courses', 0). La table contient alors 3 tâches.",
    },
  },
  {
    slug: 'C43',
    moduleSlug: 'M13',
    moduleTitle: 'Modifier les données',
    position: 43,
    title: 'UPDATE (modifier des lignes)',
    conceptSlug: 'update',
    prerequisites: ['C7', 'C42'],
    explanationFr:
      "UPDATE modifie des lignes existantes : UPDATE table SET colonne = valeur WHERE condition. " +
      "⚠️ Sans WHERE, TOUTES les lignes sont modifiées ! Le WHERE cible les bonnes lignes.",
    exampleSql: 'UPDATE todo SET done = 1 WHERE id = 3;',
    exampleResultFr: "L'exemple marque la tâche 3 comme faite.",
    statementFr: "Marque la tâche numéro 1 comme faite : mets done = 1 UNIQUEMENT pour id = 1 (UPDATE ... WHERE).",
    tables: [
      {
        name: 'todo',
        columns: [
          { name: 'id', type: 'INT', pk: true },
          { name: 'label', type: 'VARCHAR(60)' },
          { name: 'done', type: 'TINYINT(1)' },
        ],
        sampleRows: [
          [1, 'Acheter du pain', 0],
          [2, 'Lire un livre', 0],
          [3, 'Ranger', 0],
        ],
      },
    ],
    gatingExerciseSlug: 'gate-c43-update',
    gating: {
      kind: 'mutation',
      permissions: 'dml',
      schemaSql: 'CREATE TABLE todo (id INT PRIMARY KEY, label VARCHAR(60) NOT NULL, done TINYINT NOT NULL DEFAULT 0) ENGINE=InnoDB;',
      seedSql: "INSERT INTO todo (id, label, done) VALUES (1, 'Acheter du pain', 0), (2, 'Lire un livre', 0), (3, 'Ranger', 0);",
      solutionSql: 'UPDATE todo SET done = 1 WHERE id = 1;',
      verifySql: 'SELECT id, done FROM todo ORDER BY id;',
      expected: {
        columns: ['id', 'done'],
        rows: [
          [1, 1],
          [2, 0],
          [3, 0],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['UPDATE todo SET done = 1 ...', "N'oublie pas WHERE id = 1, sinon toutes les tâches passent à faites.", 'Seule la tâche 1 doit changer.'],
      explanationFr: "UPDATE ... WHERE id = 1 ne modifie que la tâche 1. Sans WHERE, les 3 tâches seraient marquées faites.",
    },
  },
  {
    slug: 'C44',
    moduleSlug: 'M13',
    moduleTitle: 'Modifier les données',
    position: 44,
    title: 'DELETE (supprimer des lignes)',
    conceptSlug: 'delete',
    prerequisites: ['C43'],
    explanationFr:
      "DELETE supprime des lignes : DELETE FROM table WHERE condition. ⚠️ Sans WHERE, TOUTE la table est vidée ! " +
      "Le WHERE choisit précisément quoi supprimer.",
    exampleSql: 'DELETE FROM todo WHERE id = 3;',
    exampleResultFr: "L'exemple supprime la tâche 3.",
    statementFr: "Supprime UNIQUEMENT la tâche numéro 2 (DELETE ... WHERE id = 2).",
    tables: [
      {
        name: 'todo',
        columns: [
          { name: 'id', type: 'INT', pk: true },
          { name: 'label', type: 'VARCHAR(60)' },
          { name: 'done', type: 'TINYINT(1)' },
        ],
        sampleRows: [
          [1, 'Acheter du pain', 0],
          [2, 'Lire un livre', 0],
          [3, 'Ranger', 0],
        ],
      },
    ],
    gatingExerciseSlug: 'gate-c44-delete',
    gating: {
      kind: 'mutation',
      permissions: 'dml',
      schemaSql: 'CREATE TABLE todo (id INT PRIMARY KEY, label VARCHAR(60) NOT NULL, done TINYINT NOT NULL DEFAULT 0) ENGINE=InnoDB;',
      seedSql: "INSERT INTO todo (id, label, done) VALUES (1, 'Acheter du pain', 0), (2, 'Lire un livre', 0), (3, 'Ranger', 0);",
      solutionSql: 'DELETE FROM todo WHERE id = 2;',
      verifySql: 'SELECT id FROM todo ORDER BY id;',
      expected: { columns: ['id'], rows: [[1], [3]] },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['DELETE FROM todo WHERE ...', 'Cible la tâche 2 : WHERE id = 2.', 'Sans WHERE, toute la table serait supprimée !'],
      explanationFr: "DELETE FROM todo WHERE id = 2 ne supprime que la tâche 2 ; il reste les tâches 1 et 3.",
    },
  },
  {
    slug: 'C45',
    moduleSlug: 'M13',
    moduleTitle: 'Modifier les données',
    position: 45,
    title: 'Transactions (COMMIT / ROLLBACK)',
    conceptSlug: 'transactions',
    prerequisites: ['C42', 'C44'],
    explanationFr:
      "Une transaction groupe plusieurs modifications : START TRANSACTION commence, COMMIT enregistre " +
      "définitivement, ROLLBACK annule tout. Sans COMMIT, les changements ne sont PAS enregistrés.",
    exampleSql: 'START TRANSACTION; DELETE FROM todo WHERE id = 1; ROLLBACK;',
    exampleResultFr: "L'exemple supprime puis ANNULE (ROLLBACK) : la table est inchangée.",
    statementFr: "Dans une transaction, ajoute la tâche (id=3, label='Payer la facture', done=0) puis ENREGISTRE-la avec COMMIT.",
    tables: [
      {
        name: 'todo',
        columns: [
          { name: 'id', type: 'INT', pk: true },
          { name: 'label', type: 'VARCHAR(60)' },
          { name: 'done', type: 'TINYINT(1)' },
        ],
        sampleRows: [
          [1, 'Acheter du pain', 0],
          [2, 'Lire un livre', 1],
        ],
      },
    ],
    gatingExerciseSlug: 'gate-c45-transaction',
    gating: {
      kind: 'mutation',
      permissions: 'dml',
      allowMultiStatement: true,
      schemaSql: 'CREATE TABLE todo (id INT PRIMARY KEY, label VARCHAR(60) NOT NULL, done TINYINT NOT NULL DEFAULT 0) ENGINE=InnoDB;',
      seedSql: "INSERT INTO todo (id, label, done) VALUES (1, 'Acheter du pain', 0), (2, 'Lire un livre', 1);",
      solutionSql: "START TRANSACTION; INSERT INTO todo (id, label, done) VALUES (3, 'Payer la facture', 0); COMMIT;",
      verifySql: 'SELECT id, label, done FROM todo ORDER BY id;',
      expected: {
        columns: ['id', 'label', 'done'],
        rows: [
          [1, 'Acheter du pain', 0],
          [2, 'Lire un livre', 1],
          [3, 'Payer la facture', 0],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Commence par START TRANSACTION;', "Ajoute la tâche avec INSERT INTO todo ...;", "Termine par COMMIT; — sans lui, rien n'est enregistré."],
      explanationFr: "START TRANSACTION puis INSERT puis COMMIT enregistre la tâche 3. Sans COMMIT, elle disparaîtrait à la fin.",
    },
  },
  {
    slug: 'C46',
    moduleSlug: 'M14',
    moduleTitle: 'Concevoir un schéma',
    position: 46,
    title: 'CREATE TABLE',
    conceptSlug: 'create-table',
    prerequisites: ['C3', 'C30'],
    explanationFr:
      "CREATE TABLE crée une nouvelle table : on liste les colonnes avec leur type, et on désigne la clé " +
      "primaire. Ta base de travail est vide : c'est à toi de créer la table.",
    exampleSql: 'CREATE TABLE exemple (id INT PRIMARY KEY, libelle VARCHAR(30));',
    exampleResultFr: "L'exemple crée une table « exemple » avec deux colonnes.",
    statementFr: "Crée une table nommée produits avec : id de type INT en clé primaire (PRIMARY KEY), et nom de type VARCHAR(50).",
    tables: [],
    gatingExerciseSlug: 'gate-c46-create-table',
    gating: {
      kind: 'mutation',
      permissions: 'ddl',
      schemaSql: '',
      seedSql: '',
      solutionSql: 'CREATE TABLE produits (id INT PRIMARY KEY, nom VARCHAR(50));',
      verifySql:
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'produits' ORDER BY ordinal_position;",
      expected: {
        columns: ['COLUMN_NAME', 'DATA_TYPE'],
        rows: [
          ['id', 'int'],
          ['nom', 'varchar'],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Utilise CREATE TABLE produits ( ... ).', 'Déclare id INT PRIMARY KEY.', 'Ajoute nom VARCHAR(50).'],
      explanationFr: "CREATE TABLE produits (id INT PRIMARY KEY, nom VARCHAR(50)) crée la table avec ses deux colonnes.",
    },
  },
  {
    slug: 'C47',
    moduleSlug: 'M14',
    moduleTitle: 'Concevoir un schéma',
    position: 47,
    title: 'ALTER TABLE',
    conceptSlug: 'alter-table',
    prerequisites: ['C46'],
    explanationFr:
      "ALTER TABLE modifie une table existante, par exemple pour ajouter une colonne : " +
      "ALTER TABLE table ADD COLUMN colonne type.",
    exampleSql: 'ALTER TABLE produits ADD COLUMN description VARCHAR(100);',
    exampleResultFr: "L'exemple ajoute une colonne description.",
    statementFr: "Ajoute à la table produits une colonne prix de type DECIMAL(6,2) (ALTER TABLE ... ADD COLUMN).",
    tables: [
      {
        name: 'produits',
        columns: [
          { name: 'id', type: 'INT', pk: true },
          { name: 'nom', type: 'VARCHAR(50)' },
        ],
        sampleRows: [],
      },
    ],
    gatingExerciseSlug: 'gate-c47-alter-table',
    gating: {
      kind: 'mutation',
      permissions: 'ddl',
      schemaSql: 'CREATE TABLE produits (id INT PRIMARY KEY, nom VARCHAR(50));',
      seedSql: '',
      solutionSql: 'ALTER TABLE produits ADD COLUMN prix DECIMAL(6,2);',
      verifySql:
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'produits' ORDER BY ordinal_position;",
      expected: {
        columns: ['COLUMN_NAME', 'DATA_TYPE'],
        rows: [
          ['id', 'int'],
          ['nom', 'varchar'],
          ['prix', 'decimal'],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Utilise ALTER TABLE produits ADD COLUMN ...', 'La colonne s appelle prix.', 'Son type est DECIMAL(6,2).'],
      explanationFr: "ALTER TABLE produits ADD COLUMN prix DECIMAL(6,2) ajoute la colonne prix à la table existante.",
    },
  },
  {
    slug: 'C48',
    moduleSlug: 'M14',
    moduleTitle: 'Concevoir un schéma',
    position: 48,
    title: 'Contraintes (NOT NULL, PRIMARY KEY)',
    conceptSlug: 'constraints',
    prerequisites: ['C46', 'C30'],
    explanationFr:
      "Les contraintes protègent les données : PRIMARY KEY (identifiant unique), NOT NULL (valeur obligatoire), " +
      "UNIQUE (pas de doublon), FOREIGN KEY (référence valide). Ici on rend une colonne obligatoire avec NOT NULL.",
    exampleSql: 'CREATE TABLE exemple (id INT PRIMARY KEY, code VARCHAR(10) NOT NULL);',
    exampleResultFr: "L'exemple crée une table dont la colonne code est obligatoire.",
    statementFr: "Crée une table utilisateurs avec id INT en PRIMARY KEY et email VARCHAR(80) OBLIGATOIRE (NOT NULL).",
    tables: [],
    gatingExerciseSlug: 'gate-c48-constraints',
    gating: {
      kind: 'mutation',
      permissions: 'ddl',
      schemaSql: '',
      seedSql: '',
      solutionSql: 'CREATE TABLE utilisateurs (id INT PRIMARY KEY, email VARCHAR(80) NOT NULL);',
      verifySql:
        "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'utilisateurs' ORDER BY ordinal_position;",
      expected: {
        columns: ['COLUMN_NAME', 'IS_NULLABLE'],
        rows: [
          ['id', 'NO'],
          ['email', 'NO'],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Crée la table avec CREATE TABLE utilisateurs ( ... ).', 'id INT PRIMARY KEY (une clé primaire est non nulle).', 'email VARCHAR(80) NOT NULL rend la colonne obligatoire.'],
      explanationFr: "PRIMARY KEY rend id non nul, et NOT NULL rend email obligatoire : les deux colonnes sont « NO » (non nullable).",
    },
  },
  {
    slug: 'C49',
    moduleSlug: 'M14',
    moduleTitle: 'Concevoir un schéma',
    position: 49,
    title: 'Index (et intro à EXPLAIN)',
    conceptSlug: 'index-explain',
    prerequisites: ['C46'],
    explanationFr:
      "Un index accélère les recherches sur une colonne (comme l'index d'un livre), sans changer les résultats. " +
      "CREATE INDEX nom ON table (colonne). La commande EXPLAIN devant un SELECT montre le « plan » : comment " +
      "MySQL compte s'y prendre, et s'il utilise un index.",
    exampleSql: 'CREATE INDEX idx_titre ON catalogue (titre);',
    exampleResultFr: "L'exemple crée un index sur la colonne titre.",
    statementFr: "Crée un index nommé idx_annee sur la colonne annee de la table catalogue (CREATE INDEX).",
    tables: [
      {
        name: 'catalogue',
        columns: [
          { name: 'id', type: 'INT', pk: true },
          { name: 'titre', type: 'VARCHAR(50)' },
          { name: 'annee', type: 'INT' },
        ],
        sampleRows: [
          [1, 'Alpha', 2001],
          [2, 'Beta', 1999],
          [3, 'Gamma', 2010],
        ],
      },
    ],
    gatingExerciseSlug: 'gate-c49-index',
    gating: {
      kind: 'mutation',
      permissions: 'ddl',
      schemaSql: 'CREATE TABLE catalogue (id INT PRIMARY KEY, titre VARCHAR(50), annee INT);',
      seedSql: "INSERT INTO catalogue (id, titre, annee) VALUES (1, 'Alpha', 2001), (2, 'Beta', 1999), (3, 'Gamma', 2010);",
      solutionSql: 'CREATE INDEX idx_annee ON catalogue (annee);',
      verifySql:
        "SELECT index_name, column_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'catalogue' AND index_name = 'idx_annee';",
      expected: { columns: ['INDEX_NAME', 'COLUMN_NAME'], rows: [['idx_annee', 'annee']] },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ['Utilise CREATE INDEX nom ON table (colonne).', "Le nom de l'index est idx_annee.", 'La colonne indexée est annee.'],
      explanationFr: "CREATE INDEX idx_annee ON catalogue (annee) crée l'index. Il accélère les filtres sur annee sans changer les résultats.",
    },
  },
  {
    slug: 'C50',
    moduleSlug: 'M15',
    moduleTitle: 'Projet final',
    position: 50,
    title: 'Projet final',
    conceptSlug: 'final-project',
    prerequisites: ['C31', 'C28', 'C18'],
    explanationFr:
      "Bravo d'être arrivé jusqu'ici ! Ce dernier défi combine plusieurs notions : une jointure (INNER JOIN), " +
      "un regroupement (GROUP BY) avec COUNT, et un tri (ORDER BY). Prends ton temps et décompose le problème.",
    exampleSql:
      'SELECT books.title, COUNT(*) AS nb FROM books INNER JOIN loans ON books.id = loans.book_id GROUP BY books.id, books.title ORDER BY nb DESC;',
    exampleResultFr: "L'exemple compte combien de fois chaque livre a été emprunté (du plus au moins emprunté).",
    statementFr:
      "Pour chaque membre ayant emprunté au moins un livre, affiche son nom (name) et son nombre d'emprunts (nb), du plus actif au moins actif, puis par nom en cas d'égalité. (INNER JOIN members + loans, GROUP BY, ORDER BY nb DESC puis name.)",
    tables: [MEMBERS_TABLE, LOANS_TABLE],
    gatingExerciseSlug: 'gate-c50-final',
    gating: {
      kind: 'sql',
      seedDb: SEED,
      solutionSql:
        'SELECT members.name, COUNT(*) AS nb FROM members INNER JOIN loans ON members.id = loans.member_id GROUP BY members.id, members.name ORDER BY nb DESC, members.name;',
      expected: {
        columns: ['name', 'nb'],
        rows: [
          ['Alice', 2],
          ['Bruno', 1],
          ['Chloé', 1],
          ['Emma', 1],
        ],
      },
      compare: { orderSensitive: true, compareColumnNames: false },
      hints: [
        'Relie members et loans avec INNER JOIN (David, sans emprunt, sera naturellement exclu).',
        'Regroupe par membre avec GROUP BY et compte avec COUNT(*).',
        'Trie avec ORDER BY nb DESC, puis members.name pour départager.',
      ],
      explanationFr:
        "La jointure relie chaque membre à ses emprunts, GROUP BY + COUNT(*) compte par membre, et ORDER BY nb DESC, name classe les plus actifs d'abord. Alice (2) devance Bruno, Chloé et Emma (1 chacun).",
    },
  },
];

const BY_SLUG = new Map(CARDS.map((c) => [c.slug, c]));

// Enforce authoring rule (DESIGN §12.6.a): a card's gating query must differ from its example.
export function assertAuthoringRules(): void {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/;+\s*$/, '').toLowerCase();
  for (const c of CARDS) {
    if ((c.gating.kind === 'sql' || c.gating.kind === 'mutation') && c.exampleSql && norm(c.exampleSql) === norm(c.gating.solutionSql)) {
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
      : card.gating.kind === 'mutation'
        ? { kind: 'mutation' as const, hintCount: card.gating.hints.length }
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
