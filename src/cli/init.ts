import path from 'node:path';
import { z } from 'zod';
import {
  ACTIONS_MANUAL_INSTRUCTIONS,
  COMPONENT_SNIPPET,
  ENVIRONMENT_VARIABLES,
  REQUIRED_PACKAGES,
  SCAFFOLD_PATHS,
  actionsTemplate,
  drizzleConfigTemplate,
  runtimeTemplate,
  schemaExportLine,
  schemaTemplate,
} from './templates.js';
import type {
  DatabaseKind,
  IProjectFiles,
  InitDependencies,
  InitOptions,
  InitResult,
  InitStep,
} from './types.js';

/** A problem the person running the command can fix, reported without a stack trace. */
export class InitError extends Error {
  override readonly name = 'InitError';
}

const PACKAGE_JSON = 'package.json';

const ASTRO_CONFIG_FILES = [
  'astro.config.ts',
  'astro.config.mjs',
  'astro.config.js',
  'astro.config.mts',
  'astro.config.cjs',
] as const;

const DRIZZLE_CONFIG_FILES = [
  'drizzle.config.ts',
  'drizzle.config.js',
  'drizzle.config.mjs',
  'drizzle.config.mts',
  'drizzle.config.cjs',
] as const;

/** The places Astro looks for a site's actions. */
const ACTIONS_FILES = [
  'src/actions/index.ts',
  'src/actions/index.js',
  'src/actions/index.mjs',
  'src/actions.ts',
  'src/actions.js',
] as const;

/** A schema that is one source file, which a line can be added to. */
const SCHEMA_SOURCE_FILE = /\.(?:ts|mts|js|mjs)$/;

/** Which database each drizzle-kit dialect means to this package. Other dialects are not supported. */
const DIALECT_DATABASE: Record<string, DatabaseKind | undefined> = {
  postgresql: 'postgres',
  sqlite: 'sqlite',
  turso: 'sqlite',
};

const packageJsonSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

/** How each package manager installs packages and runs a project's binaries. */
interface PackageManagerCommands {
  install: string;
  installDev: string;
  run: string;
}

const PACKAGE_MANAGERS: readonly { lockFiles: readonly string[]; commands: PackageManagerCommands }[] = [
  { lockFiles: ['pnpm-lock.yaml'], commands: { install: 'pnpm add', installDev: 'pnpm add -D', run: 'pnpm exec' } },
  { lockFiles: ['yarn.lock'], commands: { install: 'yarn add', installDev: 'yarn add -D', run: 'yarn' } },
  { lockFiles: ['bun.lock', 'bun.lockb'], commands: { install: 'bun add', installDev: 'bun add -d', run: 'bunx' } },
];

const NPM_COMMANDS: PackageManagerCommands = { install: 'npm install', installDev: 'npm install -D', run: 'npx' };

/** The first of the candidate files that exists in the project. */
function findFirst(files: IProjectFiles, candidates: readonly string[]): string | undefined {
  return candidates.find((candidate) => files.exists(candidate));
}

/** The package manager the project uses, judged by its lock file. npm when there is none. */
function detectPackageManager(files: IProjectFiles): PackageManagerCommands {
  const found = PACKAGE_MANAGERS.find((manager) => manager.lockFiles.some((lockFile) => files.exists(lockFile)));
  return found?.commands ?? NPM_COMMANDS;
}

/** The names of every package the project already depends on. */
function readInstalledPackages(files: IProjectFiles): Set<string> {
  let parsed: z.infer<typeof packageJsonSchema>;
  try {
    parsed = packageJsonSchema.parse(JSON.parse(files.read(PACKAGE_JSON)));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new InitError(`Could not read ${PACKAGE_JSON}: ${reason}`);
  }
  return new Set([...Object.keys(parsed.dependencies ?? {}), ...Object.keys(parsed.devDependencies ?? {})]);
}

/** True for a relative path that stays inside the project folder. */
function isInsideProject(relativePath: string): boolean {
  const segments = relativePath.split(/[\\/]/);
  return !path.isAbsolute(relativePath) && !segments.includes('..');
}

/** What an existing drizzle-kit config says about the project's database. */
interface DrizzleConfigInfo {
  path: string;
  /** The config's dialect as written, when it could be read. */
  dialect?: string;
  /** The database that dialect means, when this package supports it. */
  database?: DatabaseKind;
  /** The schema file, relative to the project root, when the config names exactly one source file. */
  schemaFile?: string;
}

/** Read the dialect and schema file out of a drizzle-kit config without running it. */
function readDrizzleConfig(files: IProjectFiles): DrizzleConfigInfo | undefined {
  const path = findFirst(files, DRIZZLE_CONFIG_FILES);
  if (path === undefined) return undefined;

  const source = files.read(path);
  const dialect = /\bdialect\s*:\s*(['"`])([a-z]+)\1/.exec(source)?.[2];
  const schema = /\bschema\s*:\s*(['"`])([^'"`]+)\1/.exec(source)?.[2];
  // Only a single source file inside the project can have a line added to it
  const schemaFile =
    schema !== undefined && !schema.includes('*') && SCHEMA_SOURCE_FILE.test(schema) && isInsideProject(schema)
      ? schema.replace(/^\.\//, '')
      : undefined;

  return {
    path,
    dialect,
    database: dialect === undefined ? undefined : DIALECT_DATABASE[dialect],
    schemaFile,
  };
}

/** The database to scaffold for: the one asked for, else the project's own, else the person's answer. */
async function resolveDatabase(
  options: InitOptions,
  drizzleConfig: DrizzleConfigInfo | undefined,
  { prompter }: InitDependencies,
): Promise<DatabaseKind> {
  if (options.database !== undefined) return options.database;
  if (drizzleConfig?.database !== undefined) return drizzleConfig.database;
  if (!prompter.interactive) {
    throw new InitError('Say which database your comments go in: --database postgres or --database sqlite');
  }
  return prompter.choose<DatabaseKind>('Which database will store your comments?', [
    { value: 'postgres', label: 'Postgres' },
    { value: 'sqlite', label: 'SQLite (libSQL or Turso)' },
  ]);
}

/** Write a file unless it already exists. */
function createIfMissing(files: IProjectFiles, path: string, content: string): InitStep {
  if (files.exists(path)) return { status: 'unchanged', path };
  files.create(path, content);
  return { status: 'created', path };
}

/** Expose the comment actions: in a new actions file, or by telling the person what to add to theirs. */
function scaffoldActions(files: IProjectFiles): InitStep {
  const existing = findFirst(files, ACTIONS_FILES);
  if (existing === undefined) return createIfMissing(files, SCAFFOLD_PATHS.actions, actionsTemplate());
  if (files.read(existing).includes('respectifyCommentActions')) return { status: 'unchanged', path: existing };
  return { status: 'manual', path: existing, instructions: ACTIONS_MANUAL_INSTRUCTIONS };
}

/** Make sure a schema file exports the comment table, adding the line when it is missing. */
function addTableToSchema(files: IProjectFiles, path: string, database: DatabaseKind): InitStep {
  if (!files.exists(path)) {
    files.create(path, schemaTemplate(database));
    return { status: 'created', path };
  }
  const source = files.read(path);
  if (source.includes('@respectify/astro/')) return { status: 'unchanged', path };
  const separator = source === '' || source.endsWith('\n') ? '' : '\n';
  files.append(path, `${separator}${schemaExportLine(database)}\n`);
  return { status: 'updated', path };
}

/**
 * Put the comment table in the project's Drizzle schema. A project with no drizzle-kit config
 * gets one; a project with its own keeps it, and gets the table added to the schema it names.
 */
function scaffoldDrizzle(
  files: IProjectFiles,
  database: DatabaseKind,
  drizzleConfig: DrizzleConfigInfo | undefined,
): InitStep[] {
  if (drizzleConfig === undefined) {
    return [
      addTableToSchema(files, SCAFFOLD_PATHS.schema, database),
      createIfMissing(files, SCAFFOLD_PATHS.drizzleConfig, drizzleConfigTemplate(database)),
    ];
  }

  const exportLine = schemaExportLine(database);
  if (drizzleConfig.dialect !== undefined && drizzleConfig.database !== database) {
    return [
      {
        status: 'manual',
        path: drizzleConfig.path,
        instructions:
          `${drizzleConfig.path} is set up for "${drizzleConfig.dialect}", not ${database}, so the comment table ` +
          `was not added to it. Give the comment table its own drizzle-kit config, with a schema containing:\n\n    ${exportLine}`,
      },
    ];
  }
  if (drizzleConfig.schemaFile === undefined) {
    return [
      {
        status: 'manual',
        path: drizzleConfig.path,
        instructions: `Add the comment table to your Drizzle schema:\n\n    ${exportLine}`,
      },
    ];
  }
  return [addTableToSchema(files, drizzleConfig.schemaFile, database)];
}

/** What the project looked like before anything was written. */
interface ProjectState {
  astroConfigPath: string;
  astroConfig: string;
  installed: Set<string>;
}

/** Everything the command leaves for the person, in the order to do it. */
function describeNextSteps(files: IProjectFiles, database: DatabaseKind, project: ProjectState): string[] {
  const commands = detectPackageManager(files);
  const { installed, astroConfig, astroConfigPath } = project;
  const steps: string[] = [];

  const required = REQUIRED_PACKAGES[database];
  const missing = required.runtime.filter((name) => !installed.has(name));
  const missingDev = required.dev.filter((name) => !installed.has(name));
  const installLines = [
    ...(missing.length > 0 ? [`${commands.install} ${missing.join(' ')}`] : []),
    ...(missingDev.length > 0 ? [`${commands.installDev} ${missingDev.join(' ')}`] : []),
  ];
  if (installLines.length > 0) {
    steps.push(`Install the database packages:\n\n    ${installLines.join('\n    ')}`);
  }

  if (!astroConfig.includes('@respectify/astro')) {
    steps.push(`Add the integration to ${astroConfigPath}:\n\n    ${commands.run} astro add @respectify/astro`);
  }
  if (!/\badapter\s*:/.test(astroConfig)) {
    steps.push(
      'Comments are saved by your server, so the site needs a server adapter. For Node:\n\n' +
        `    ${commands.run} astro add node\n\n` +
        'Vercel, Netlify and Cloudflare have adapters too.',
    );
  }

  steps.push(
    `Set these environment variables (in .env for local work):\n\n    ${ENVIRONMENT_VARIABLES[database].join('\n    ')}`,
  );
  steps.push(
    `Create the comment table:\n\n    ${commands.run} drizzle-kit generate\n    ${commands.run} drizzle-kit migrate`,
  );
  steps.push(
    `Put comments on a page, for example in your blog post layout:\n\n    ${COMPONENT_SNIPPET.split('\n').join('\n    ')}`,
  );
  return steps;
}

/**
 * Scaffold the files a site needs for Respectify comments: the runtime module, the config
 * file, the comment actions and the comment table in the Drizzle schema. A file that already
 * exists is never overwritten.
 * @throws InitError when the folder is not an Astro project or the database cannot be decided
 */
export async function runInit(options: InitOptions, dependencies: InitDependencies): Promise<InitResult> {
  const { files, defaultConfigJson } = dependencies;

  const astroConfigPath = findFirst(files, ASTRO_CONFIG_FILES);
  if (!files.exists(PACKAGE_JSON) || astroConfigPath === undefined) {
    throw new InitError('Run this in the root folder of an Astro project: no package.json and astro.config found here.');
  }

  // Everything that can fail is read before the first file is written
  const project: ProjectState = {
    astroConfigPath,
    astroConfig: files.read(astroConfigPath),
    installed: readInstalledPackages(files),
  };
  const drizzleConfig = readDrizzleConfig(files);
  const database = await resolveDatabase(options, drizzleConfig, dependencies);

  const steps: InitStep[] = [
    createIfMissing(files, SCAFFOLD_PATHS.runtime, runtimeTemplate(database)),
    createIfMissing(files, SCAFFOLD_PATHS.config, defaultConfigJson),
    scaffoldActions(files),
    ...scaffoldDrizzle(files, database, drizzleConfig),
  ];

  return { database, steps, nextSteps: describeNextSteps(files, database, project) };
}
