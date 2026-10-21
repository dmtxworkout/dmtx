import type {
  BlockSection,
  BlockType,
  FormatConfig,
  LoadPrescription,
  MeasurementType,
  Tempo,
  WorkoutFormat,
} from '@dmtx/schemas';

/** The subset of an exercise the parser needs to resolve names. */
export interface CatalogExercise {
  id: string;
  name: string;
  aliases?: string[];
}

export type Severity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  | 'unknown_exercise'
  | 'unknown_keyword'
  | 'missing_exercise'
  | 'ambiguous_exercise'
  | 'missing_count'
  | 'format_needs_config'
  | 'unsupported'
  | 'orphan_rest'
  | 'interval_outside_emom'
  | 'orphan_note';

/** A problem on one line. `from`/`to` are column offsets within that line. */
export interface Diagnostic {
  line: number;
  from: number;
  to: number;
  severity: Severity;
  code: DiagnosticCode;
  message: string;
  /** Candidate exercise names for `unknown_exercise` / `ambiguous_exercise`. */
  suggestions?: string[];
}

export interface ExerciseMatch {
  id: string;
  name: string;
  confidence: 'exact' | 'fuzzy';
}

export interface ParsedItem {
  line: number;
  kind: 'exercise' | 'rest';
  /** The text that was matched against the catalog ('' for rests). */
  rawName: string;
  /** Column range of `rawName` within the line (for highlighting). */
  nameRange: [number, number] | null;
  match: ExerciseMatch | null;
  measure: MeasurementType;
  sets: number | null;
  reps: number | null;
  workSeconds: number | null;
  distanceMeters: number | null;
  restBetweenSeconds: number | null;
  tempoOverride: Tempo | null;
  loadPrescription: LoadPrescription | null;
  perSide: boolean;
  intervalIndex: number | null;
  notes: string | null;
}

export interface ParsedBlock {
  line: number;
  section: BlockSection;
  /** `part`: a format header and the blocks indented under it (`children`). */
  kind: 'group' | 'rest' | 'part';
  type: BlockType;
  rounds: number | null;
  label: string | null;
  /** A note the athlete sees, written as "(texto)" on its own line under the header. */
  notes: string | null;
  items: ParsedItem[];
  /** A loose exercise/rest line (no group header). */
  loose: boolean;
  /** For a part: its format + timing. */
  format?: FormatConfig | null;
  /** For a part: the blocks it contains, in order. */
  children?: ParsedBlock[];
}

export interface SectionFormat {
  format: WorkoutFormat;
  config: FormatConfig;
  line: number;
}

export type LineKind = 'blank' | 'comment' | 'note' | 'section' | 'format' | 'group' | 'rest' | 'item';

export interface LineInfo {
  kind: LineKind;
  section: BlockSection;
}

export interface ParsedRutina {
  /** Main section format; null → caller defaults to `for_time`. */
  main: SectionFormat | null;
  warmup: SectionFormat | null;
  cooldown: SectionFormat | null;
  blocks: ParsedBlock[];
  diagnostics: Diagnostic[];
  lines: LineInfo[];
}
