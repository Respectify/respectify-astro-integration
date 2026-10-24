import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createSqliteCommentStore } from '../../src/adapters/sqlite';
import { describeCommentStoreContract } from '../../src/testing';

/** A new in-memory libSQL database per test, migrated with the shipped reference migration. */
describeCommentStoreContract('SQLite (libSQL)', async () => {
  const client = createClient({ url: ':memory:' });
  const db = drizzle({ client });
  await migrate(db, { migrationsFolder: './migrations/sqlite' });
  return { store: createSqliteCommentStore(db), dispose: () => client.close() };
});
