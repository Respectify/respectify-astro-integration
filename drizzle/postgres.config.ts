import { defineConfig } from 'drizzle-kit';

/** Generates the reference Postgres migration in migrations/postgres from the adapter's table. */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/adapters/postgres/table.ts',
  out: './migrations/postgres',
});
