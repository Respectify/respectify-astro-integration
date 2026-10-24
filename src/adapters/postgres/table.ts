import { boolean, index, integer, pgTable, text, timestamp, type AnyPgColumn } from 'drizzle-orm/pg-core';

/** The default Postgres table name for Respectify comments. */
export const DEFAULT_POSTGRES_COMMENT_TABLE_NAME = 'respectify_comment';

/**
 * Build the Drizzle definition of the comment table, named `name`. Put the result in your
 * Drizzle schema so drizzle-kit can generate its migration; the store never creates it.
 *
 * Replies keep a foreign key to their parent, which is set to null when the parent is deleted.
 */
export function createPostgresCommentTable(name: string = DEFAULT_POSTGRES_COMMENT_TABLE_NAME) {
  const table = pgTable(
    name,
    {
      id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
      postSlug: text('post_slug').notNull(),
      author: text('author').notNull(),
      email: text('email'),
      content: text('content').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      approved: boolean('approved').notNull().default(false),
      parentId: integer('parent_id').references((): AnyPgColumn => table.id, { onDelete: 'set null' }),
    },
    (columns) => [
      index(`${name}_post_slug_created_at_idx`).on(columns.postSlug, columns.createdAt),
      index(`${name}_parent_id_idx`).on(columns.parentId),
    ],
  );
  return table;
}

/** The Drizzle type of a Respectify comment table on Postgres. */
export type PostgresCommentTable = ReturnType<typeof createPostgresCommentTable>;

/** The comment table under its default name, ready to export from your Drizzle schema. */
export const respectifyComments: PostgresCommentTable = createPostgresCommentTable();
