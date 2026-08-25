export interface Me {
  user_id: string;
  display_name: string;
}

export type CardStatus =
  | 'locked'
  | 'available'
  | 'in_progress'
  | 'validated'
  | 'validated_after_hint';

export interface ProgressCard {
  slug: string;
  title: string;
  status: CardStatus;
  hint_used: boolean;
  solution_viewed: boolean;
}

export interface ProgressModule {
  moduleSlug: string;
  moduleTitle: string;
  cards: ProgressCard[];
}

export interface TableColumn {
  name: string;
  type: string;
  pk?: boolean;
  fk?: string;
  note?: string;
}

export interface TableSchema {
  name: string;
  columns: TableColumn[];
  sampleRows?: (string | number | null)[][];
}

export interface GatingPublic {
  kind: 'quiz' | 'sql' | 'mutation';
  questionFr?: string;
  options?: string[];
  hintCount: number;
}

export interface PublicCard {
  slug: string;
  moduleSlug: string;
  moduleTitle: string;
  position: number;
  title: string;
  conceptSlug: string;
  prerequisites: string[];
  explanationFr: string;
  exampleSql: string | null;
  exampleResultFr: string | null;
  statementFr: string;
  tables: TableSchema[];
  gating: GatingPublic;
  practice: string[];
}

export interface ExecuteResponse {
  status: 'pass' | 'fail' | 'error' | 'timeout';
  kind: 'sql' | 'quiz' | 'mutation';
  columns?: string[];
  rows?: (string | number | null)[][];
  truncated?: boolean;
  messageFr: string;
  card_validated?: boolean;
  next_card_slug?: string | null;
}
