/** A stored comment, as every comment store returns it. */
export interface CommentRecord {
  id: number;
  postSlug: string;
  author: string;
  email: string | null;
  content: string;
  createdAt: Date;
  approved: boolean;
  /** The comment this one replies to, or null for a top-level comment (or one whose parent was deleted) */
  parentId: number | null;
}

/** A comment to store. The store assigns `id` and `createdAt`. */
export interface NewComment {
  postSlug: string;
  author: string;
  email?: string;
  content: string;
  approved: boolean;
  parentId?: number;
}

/** The fields of an approved comment that are safe to show to anyone. Never includes `email`. */
export type PublicComment = Pick<CommentRecord, 'id' | 'author' | 'content' | 'createdAt' | 'parentId'>;

/**
 * Where comments are kept. The integration's actions, API route and service depend only on
 * this interface, never on a database.
 *
 * Every store must pass the shared contract suite in `@respectify/astro/testing`. Stores
 * never create tables or run migrations: the schema is the site's to manage.
 */
export interface ICommentStore {
  /** The comment with this id, or undefined when there is none */
  findById(id: number): Promise<CommentRecord | undefined>;

  /** The approved comments on a post, oldest first (ties broken by id) */
  listApproved(postSlug: string): Promise<PublicComment[]>;

  /**
   * Store a new comment and return it as stored.
   * @throws CommentValidationError when the input does not match `newCommentSchema`
   */
  create(input: NewComment): Promise<CommentRecord>;

  /**
   * Delete a comment. Its replies are kept, with `parentId` set to null.
   * @returns true when a comment was deleted, false when there was none with this id
   */
  delete(id: number): Promise<boolean>;
}
