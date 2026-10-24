import { and, asc, eq } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import { commentIdSchema, parseNewComment } from '../../store/schemas';
import type { CommentRecord, ICommentStore, NewComment, PublicComment } from '../../store/types';
import { respectifyComments, type SqliteCommentTable } from './table';

export interface SqliteCommentStoreOptions {
  /** The comment table, when it is not the default `Comment` (see `createSqliteCommentTable`) */
  table?: SqliteCommentTable;
}

/** A comment store on any Drizzle SQLite database: libSQL/Turso, better-sqlite3, Cloudflare D1 and others. */
class SqliteCommentStore<
  TResultKind extends 'sync' | 'async',
  TRunResult,
  TSchema extends Record<string, unknown>,
> implements ICommentStore
{
  // Widened from the constructor's generic kinds: Drizzle cannot type a select chain on an unresolved result kind
  readonly #db: BaseSQLiteDatabase<'sync' | 'async', TRunResult, TSchema>;
  readonly #table: SqliteCommentTable;

  constructor(db: BaseSQLiteDatabase<TResultKind, TRunResult, TSchema>, table: SqliteCommentTable) {
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
    const table = this.#table;
    const deleted = await this.#db.delete(table).where(eq(table.id, id)).returning({ id: table.id });
    if (deleted.length === 0) return false;
    // No foreign key does this (the Astro DB table has none), so the replies are detached here
    await this.#db.update(table).set({ parentId: null }).where(eq(table.parentId, id));
    return true;
  }
}

/**
 * Store comments in SQLite through your own Drizzle database instance, so the integration
 * uses your connection and never opens one. The table must already exist: an Astro DB
 * `Comment` table works as it is; otherwise add `respectifyComments` (or a table from
 * `createSqliteCommentTable`) to your Drizzle schema and migrate with drizzle-kit.
 */
export function createSqliteCommentStore<
  TResultKind extends 'sync' | 'async',
  TRunResult,
  TSchema extends Record<string, unknown>,
>(db: BaseSQLiteDatabase<TResultKind, TRunResult, TSchema>, options: SqliteCommentStoreOptions = {}): ICommentStore {
  return new SqliteCommentStore(db, options.table ?? respectifyComments);
}
