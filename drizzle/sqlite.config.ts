import { defineConfig } from 'drizzle-kit';

/** Generates the reference SQLite migration in migrations/sqlite from the adapter's table. */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/adapters/sqlite/table.ts',
  out: './migrations/sqlite',
});
