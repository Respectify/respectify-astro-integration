import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createPostgresCommentStore } from '../../src/adapters/postgres';
import { describeCommentStoreContract } from '../../src/testing';

/** A new in-process Postgres per test, migrated with the shipped reference migration. */
describeCommentStoreContract('Postgres (PGlite)', async () => {
  const client = new PGlite();
  const db = drizzle({ client });
  await migrate(db, { migrationsFolder: './migrations/postgres' });
  return { store: createPostgresCommentStore(db), dispose: () => client.close() };
});
