import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { textDate } from './text-date';

/** The default SQLite table name: the `Comment` table `@respectify/astro` 0.x created through Astro DB. */
export const DEFAULT_SQLITE_COMMENT_TABLE_NAME = 'Comment';

/**
 * Build the Drizzle definition of the comment table, named `name`. Its columns, defaults and
 * index names match the table `@respectify/astro` 0.x defined through Astro DB, so an existing
 * Astro DB (libSQL/Turso) database is used as it is. For a new database, put the result in
 * your Drizzle schema and migrate with drizzle-kit; the store never creates it.
 *
 * Like the Astro DB table it has no foreign key on `parentId`; the store clears a deleted
 * comment's replies' `parentId` itself.
 */
export function createSqliteCommentTable(name: string = DEFAULT_SQLITE_COMMENT_TABLE_NAME) {
  return sqliteTable(
    name,
    {
      id: integer('id').primaryKey(),
      postSlug: text('postSlug').notNull(),
      author: text('author').notNull(),
      email: text('email'),
      content: text('content').notNull(),
      createdAt: textDate('createdAt').notNull().default(sql`CURRENT_TIMESTAMP`),
      approved: integer('approved', { mode: 'boolean' }).notNull().default(false),
      parentId: integer('parentId'),
    },
    (columns) => [
      index(`${name}_postSlug_idx`).on(columns.postSlug),
      index(`${name}_approved_idx`).on(columns.approved),
    ],
  );
}

/** The Drizzle type of a Respectify comment table on SQLite. */
export type SqliteCommentTable = ReturnType<typeof createSqliteCommentTable>;

/** The comment table under its default name, ready to export from your Drizzle schema. */
export const respectifyComments: SqliteCommentTable = createSqliteCommentTable();
