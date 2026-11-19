/** The databases `init` can scaffold a comment store for. */
export const DATABASE_KINDS = ['postgres', 'sqlite'] as const;

/** A database `init` can scaffold a comment store for: Postgres, or SQLite through libSQL/Turso. */
export type DatabaseKind = (typeof DATABASE_KINDS)[number];

/** Where the command writes what it has to say. */
export interface ICliLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * The project the command works on. Every path is relative to the project root, and a path
 * that would leave the root is refused.
 */
export interface IProjectFiles {
  /** True when the path names a file inside the project. */
  exists(relativePath: string): boolean;

  /** @throws Error when the file is missing or outside the project */
  read(relativePath: string): string;

  /**
   * Write a new file, creating its folders.
   * @throws Error when the file already exists: nothing is ever overwritten
   */
  create(relativePath: string, content: string): void;

  /** Add text to the end of an existing file. */
  append(relativePath: string, content: string): void;
}

/** One answer a question accepts. */
export interface PromptChoice<Value extends string> {
  value: Value;
  label: string;
}

/** Asks the person running the command a question. */
export interface IPrompter {
  /** True when there is a terminal to ask on. */
  readonly interactive: boolean;

  choose<Value extends string>(question: string, choices: readonly PromptChoice<Value>[]): Promise<Value>;
}

/** What `init` was asked to do. */
export interface InitOptions {
  /** The database to scaffold for. When absent it is read from drizzle.config, then asked for. */
  database?: DatabaseKind;
}

/** What happened to one file `init` is responsible for. */
export type InitStepStatus =
  /** The file did not exist and was written. */
  | 'created'
  /** A line was added to the end of an existing file. */
  | 'updated'
  /** The file already had what it needs, or already exists and was left alone. */
  | 'unchanged'
  /** The command could not safely make the change; `instructions` says what to do by hand. */
  | 'manual';

/** The outcome for one file. */
export interface InitStep {
  status: InitStepStatus;
  /** The file, relative to the project root. */
  path: string;
  /** What the person has to do themselves, for a `manual` step. */
  instructions?: string;
}

/** Everything `init` did and everything left for the person to do. */
export interface InitResult {
  database: DatabaseKind;
  steps: InitStep[];
  /** The remaining steps, in the order to do them. */
  nextSteps: string[];
}

/** What `init` needs from the outside world. */
export interface InitDependencies {
  files: IProjectFiles;
  prompter: IPrompter;
  /** The text of the package's default-respectify.config.json. */
  defaultConfigJson: string;
}
