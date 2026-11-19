import type { DatabaseKind } from './types.js';

/** Where `init` puts each file, relative to the project root. */
export const SCAFFOLD_PATHS = {
  runtime: 'src/respectify.runtime.ts',
  config: 'respectify.config.json',
  actions: 'src/actions/index.ts',
  schema: 'src/db/schema.ts',
  drizzleConfig: 'drizzle.config.ts',
} as const;

/** The package subpath that exports the comment table and store for each database. */
const ADAPTER_ENTRY: Record<DatabaseKind, string> = {
  postgres: '@respectify/astro/postgres',
  sqlite: '@respectify/astro/sqlite',
};

/** The line a Drizzle schema needs so drizzle-kit creates the comment table. */
export function schemaExportLine(database: DatabaseKind): string {
  return `export { respectifyComments } from '${ADAPTER_ENTRY[database]}';`;
}

/** A new Drizzle schema file holding only the comment table. */
export function schemaTemplate(database: DatabaseKind): string {
  return `// The table Respectify comments are stored in. Add your own tables to this file too.
${schemaExportLine(database)}
`;
}

const POSTGRES_RUNTIME = `import { defineRespectifyRuntime } from '@respectify/astro/runtime';
import { createPostgresCommentStore } from '@respectify/astro/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getSecret } from 'astro:env/server';

const connectionString = getSecret('DATABASE_URL');
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Respectify comments need it to reach your database.');
}

// If your site already creates a Drizzle database, import it here and delete these lines.
const db = drizzle({ client: new Pool({ connectionString }) });

export default defineRespectifyRuntime({
  store: createPostgresCommentStore(db),
  // Optional: the public URL of a post, which Respectify reads for topic context
  // getPostUrl: (slug, site) => \`\${site}/blog/\${slug}/\`,
});
`;

const SQLITE_RUNTIME = `import { defineRespectifyRuntime } from '@respectify/astro/runtime';
import { createSqliteCommentStore } from '@respectify/astro/sqlite';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { getSecret } from 'astro:env/server';

const url = getSecret('DATABASE_URL');
if (!url) {
  throw new Error('DATABASE_URL is not set. Respectify comments need it to reach your database.');
}

// Only a hosted database such as Turso needs a token; an empty one counts as none
const authToken = getSecret('DATABASE_AUTH_TOKEN') || undefined;

// If your site already creates a Drizzle database, import it here and delete these lines.
const db = drizzle({ client: createClient({ url, authToken }) });

export default defineRespectifyRuntime({
  store: createSqliteCommentStore(db),
  // Optional: the public URL of a post, which Respectify reads for topic context
  // getPostUrl: (slug, site) => \`\${site}/blog/\${slug}/\`,
});
`;

/** The runtime module: it builds the comment store from the site's database connection. */
export function runtimeTemplate(database: DatabaseKind): string {
  return database === 'postgres' ? POSTGRES_RUNTIME : SQLITE_RUNTIME;
}

/** The lines an existing actions file needs. */
export const ACTIONS_MANUAL_INSTRUCTIONS = `Add the comment actions to your existing actions:

    import { respectifyCommentActions } from '@respectify/astro/actions';

    export const server = {
      // ...your actions
      comments: respectifyCommentActions,
    };`;

/** A new Astro Actions file exposing the comment actions. */
export function actionsTemplate(): string {
  return `import { respectifyCommentActions } from '@respectify/astro/actions';

export const server = {
  comments: respectifyCommentActions,
};
`;
}

const DRIZZLE_CONFIG_HEAD = `import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit does not read .env by itself
if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('Set DATABASE_URL before running drizzle-kit.');
}
`;

/** A new drizzle-kit config pointing at the schema file `init` writes. */
export function drizzleConfigTemplate(database: DatabaseKind): string {
  const dialect = database === 'postgres' ? 'postgresql' : 'turso';
  // drizzle-kit rejects an empty token, so an empty DATABASE_AUTH_TOKEN counts as none
  const credentials =
    database === 'postgres' ? '{ url }' : '{ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined }';
  return `${DRIZZLE_CONFIG_HEAD}
export default defineConfig({
  dialect: '${dialect}',
  schema: './${SCAFFOLD_PATHS.schema}',
  out: './drizzle',
  dbCredentials: ${credentials},
});
`;
}

/** The packages each database needs beside `@respectify/astro` itself. */
export const REQUIRED_PACKAGES: Record<DatabaseKind, { runtime: readonly string[]; dev: readonly string[] }> = {
  postgres: { runtime: ['@respectify/client', 'drizzle-orm', 'pg'], dev: ['drizzle-kit', '@types/pg'] },
  sqlite: { runtime: ['@respectify/client', 'drizzle-orm', '@libsql/client'], dev: ['drizzle-kit'] },
};

/** The lines shown for the environment variables each database's runtime module reads, with sample values. */
export const ENVIRONMENT_VARIABLES: Record<DatabaseKind, readonly string[]> = {
  postgres: [
    'RESPECTIFY_EMAIL=you@example.com',
    'RESPECTIFY_API_KEY=your-api-key',
    'DATABASE_URL=postgres://user:password@host:5432/database',
  ],
  sqlite: [
    'RESPECTIFY_EMAIL=you@example.com',
    'RESPECTIFY_API_KEY=your-api-key',
    'DATABASE_URL=file:local.db',
    '',
    'For a hosted database such as Turso, use its URL and token instead:',
    '',
    'DATABASE_URL=libsql://your-database.turso.io',
    'DATABASE_AUTH_TOKEN=your-database-token',
  ],
};

/** The snippet that puts comments on a page. */
export const COMPONENT_SNIPPET = `---
import CommentSection from '@respectify/astro/components/CommentSection.astro';
---

<CommentSection postSlug={post.id} />`;
