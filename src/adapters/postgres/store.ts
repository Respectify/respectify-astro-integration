import { and, asc, eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { commentIdSchema, parseNewComment } from '../../store/schemas';
import type { CommentRecord, ICommentStore, NewComment, PublicComment } from '../../store/types';
import { respectifyComments, type PostgresCommentTable } from './table';

export interface PostgresCommentStoreOptions {
  /** The comment table, when it is not the default `respectify_comment` (see `createPostgresCommentTable`) */
  table?: PostgresCommentTable;
}

/** A comment store on any Drizzle Postgres database: node-postgres, postgres.js, Neon, PGlite and others. */
class PostgresCommentStore<TQueryResult extends PgQueryResultHKT, TSchema extends Record<string, unknown>>
  implements ICommentStore
{
  readonly #db: PgDatabase<TQueryResult, TSchema>;
  readonly #table: PostgresCommentTable;

  constructor(db: PgDatabase<TQueryResult, TSchema>, table: PostgresCommentTable) {
    this.#db = db;
    this.#table = table;
  }

  async findById(id: number): Promise<CommentRecord | undefined> {
    if (!commentIdSchema.safeParse(id).success) return undefined;
    const [row] = await this.#db.select().from(this.#table).where(eq(this.#table.id, id)).limit(1);
    return row;
  }

  async listApproved(postSlug: string): Promise<PublicComment[]> {
    const table = this.#table;
    return this.#db
      .select({
        id: table.id,
        author: table.author,
        content: table.content,
        createdAt: table.createdAt,
        parentId: table.parentId,
      })
      .from(table)
      .where(and(eq(table.postSlug, postSlug), eq(table.approved, true)))
      .orderBy(asc(table.createdAt), asc(table.id));
  }

  async create(input: NewComment): Promise<CommentRecord> {
    const comment = parseNewComment(input);
    const [row] = await this.#db
      .insert(this.#table)
      .values({
        postSlug: comment.postSlug,
        author: comment.author,
        email: comment.email ?? null,
        content: comment.content,
        approved: comment.approved,
        parentId: comment.parentId ?? null,
      })
      .returning();
    if (!row) {
      throw new Error('The comment was not stored: the database returned no row');
    }
    return row;
  }

  async delete(id: number): Promise<boolean> {
    if (!commentIdSchema.safeParse(id).success) return false;
    // The parent_id foreign key sets each reply's parent to null
    const deleted = await this.#db.delete(this.#table).where(eq(this.#table.id, id)).returning({ id: this.#table.id });
    return deleted.length > 0;
  }
}

/**
 * Store comments in Postgres through your own Drizzle database instance, so the integration
 * uses your connection and never opens one. The table must already exist: add
 * `respectifyComments` (or a table from `createPostgresCommentTable`) to your Drizzle schema
 * and migrate with drizzle-kit.
 */
export function createPostgresCommentStore<
  TQueryResult extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(db: PgDatabase<TQueryResult, TSchema>, options: PostgresCommentStoreOptions = {}): ICommentStore {
  return new PostgresCommentStore(db, options.table ?? respectifyComments);
}
