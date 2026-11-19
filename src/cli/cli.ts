import { parseArgs } from 'node:util';
import { z } from 'zod';
import { InitError, runInit } from './init.js';
import { DATABASE_KINDS } from './types.js';
import type { ICliLogger, IPrompter, IProjectFiles, InitResult, InitStep, InitStepStatus } from './types.js';

export const USAGE = `Usage: npx @respectify/astro init [options]

Sets up Respectify comments in an Astro project: writes the runtime module, the config
file and the comment actions, and adds the comment table to your Drizzle schema.
Files that already exist are never overwritten.

Options:
  --database <postgres|sqlite>  The database your comments go in. Read from drizzle.config
                                when there is one, otherwise you are asked.
  --cwd <folder>                The project folder (default: the current folder)
  -h, --help                    Show this help`;

const cliArgumentsSchema = z.object({
  command: z.literal('init', { error: 'Unknown command. The only command is "init".' }),
  database: z
    .enum(DATABASE_KINDS, { error: `--database must be one of: ${DATABASE_KINDS.join(', ')}` })
    .optional(),
  cwd: z.string().min(1).default('.'),
});

/** What the command needs from the outside world. */
export interface CliDependencies {
  logger: ICliLogger;
  prompter: IPrompter;
  /** Opens the project in a folder. */
  openProject: (folder: string) => IProjectFiles;
  /** The text of the package's default-respectify.config.json. */
  defaultConfigJson: string;
}

const STEP_LABELS: Record<InitStepStatus, string> = {
  created: 'Created  ',
  updated: 'Updated  ',
  unchanged: 'Kept     ',
  manual: 'By hand  ',
};

function describeStep(step: InitStep): string {
  const line = `  ${STEP_LABELS[step.status]} ${step.path}`;
  return step.status === 'unchanged' ? `${line} (already there)` : line;
}

/** Say what was done, then what is left to do. */
function report(result: InitResult, logger: ICliLogger): void {
  logger.info(`Respectify comments, stored in ${result.database === 'postgres' ? 'Postgres' : 'SQLite'}:\n`);
  for (const step of result.steps) logger.info(describeStep(step));

  const manualSteps = result.steps.flatMap((step) => (step.instructions === undefined ? [] : [step.instructions]));
  const remaining = [...manualSteps, ...result.nextSteps];
  logger.info('\nWhat is left to do:');
  remaining.forEach((step, index) => {
    logger.info(`\n${index + 1}. ${step}`);
  });
  logger.info('\nDocs: https://docs.respectify.ai/docs/astro');
}

/**
 * Run the command line.
 * @param argv the arguments after the program name
 * @returns the process exit code
 */
export async function runCli(argv: readonly string[], dependencies: CliDependencies): Promise<number> {
  const { logger, prompter, openProject, defaultConfigJson } = dependencies;

  let parsed: ReturnType<typeof parseCommandLine>;
  try {
    parsed = parseCommandLine(argv);
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    logger.info(`\n${USAGE}`);
    return 1;
  }

  if (parsed.values.help === true || parsed.positionals.length === 0) {
    logger.info(USAGE);
    return parsed.values.help === true ? 0 : 1;
  }

  const validated = cliArgumentsSchema.safeParse({
    command: parsed.positionals[0],
    database: parsed.values.database,
    cwd: parsed.values.cwd,
  });
  if (!validated.success) {
    logger.error(validated.error.issues.map((issue) => issue.message).join('; '));
    logger.info(`\n${USAGE}`);
    return 1;
  }

  try {
    const result = await runInit(
      { database: validated.data.database },
      { files: openProject(validated.data.cwd), prompter, defaultConfigJson },
    );
    report(result, logger);
    return 0;
  } catch (error) {
    if (!(error instanceof InitError)) throw error;
    logger.error(error.message);
    return 1;
  }
}

function parseCommandLine(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      database: { type: 'string' },
      cwd: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
}
