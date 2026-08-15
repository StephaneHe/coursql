// Versioned card content (DESIGN §12.6). Learner-facing text in French; technical keywords
// (SELECT, FROM, NULL, INT...) kept in English. This slice ships cards C1 -> C5.
// Solutions and expected results NEVER leave the server before the dedicated routes.

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
  ],
};

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
        'le nom d\'une colonne',
        'une valeur, à l\'intersection d\'une ligne et de la colonne author',
        'le nom de la base',
      ],
      correctIndex: 2,
      hints: ["Regarde la colonne author.", "C'est ce qui est écrit dans une case précise."],
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
      hints: ["Une année est un nombre entier.", "Ce n'est pas du texte (VARCHAR) ni une date complète (DATE)."],
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
    exampleResultFr: "Cette requête affiche toutes les colonnes (id, title, author, year) de tous les livres.",
    statementFr: "Affiche toutes les colonnes de tous les livres de la table books.",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c4-select-star',
    gating: {
      kind: 'sql',
      seedDb: 'seed_books_v1',
      solutionSql: 'SELECT * FROM books;',
      expected: {
        columns: ['id', 'title', 'author', 'year'],
        rows: [
          [1, 'Les Misérables', 'Victor Hugo', 1862],
          [2, 'Le Petit Prince', 'Antoine de Saint-Exupéry', 1943],
          [3, 'Contes', null, 1875],
          [4, 'Le Petit Prince', 'Antoine de Saint-Exupéry', 1943],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: false },
      hints: ["Une lecture commence par SELECT.", "L'étoile * veut dire « toutes les colonnes ».", "Précise la table avec FROM books."],
      explanationFr: "SELECT * prend toutes les colonnes, FROM books indique où lire. Le résultat contient les 4 livres.",
    },
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
    exampleResultFr: "Cette requête n'affiche que le titre et l'auteur, dans cet ordre.",
    statementFr: "Affiche uniquement les colonnes title et year (dans cet ordre) de la table books.",
    tables: [BOOKS_TABLE],
    gatingExerciseSlug: 'gate-c5-columns',
    gating: {
      kind: 'sql',
      seedDb: 'seed_books_v1',
      solutionSql: 'SELECT title, year FROM books;',
      expected: {
        columns: ['title', 'year'],
        rows: [
          ['Les Misérables', 1862],
          ['Le Petit Prince', 1943],
          ['Contes', 1875],
          ['Le Petit Prince', 1943],
        ],
      },
      compare: { orderSensitive: false, compareColumnNames: true },
      hints: ["Liste les colonnes après SELECT, séparées par une virgule.", "L'ordre demandé est title puis year.", "N'utilise pas *."],
      explanationFr: "On liste title, year après SELECT. Les noms et l'ordre des colonnes comptent ici.",
    },
    practice: ['select-all-books'],
  },
];

const BY_SLUG = new Map(CARDS.map((c) => [c.slug, c]));

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
