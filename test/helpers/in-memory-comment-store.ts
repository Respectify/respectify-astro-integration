import { parseNewComment } from '../../src/store/schemas';
import type { CommentRecord, ICommentStore, NewComment, PublicComment } from '../../src/store/types';

/** An `ICommentStore` held in memory, for tests of code that depends only on the interface. */
export function createInMemoryCommentStore(): ICommentStore {
  const comments = new Map<number, CommentRecord>();
  let nextId = 1;

  return {
    findById: async (id: number): Promise<CommentRecord | undefined> => {
      const found = comments.get(id);
      return found ? { ...found } : undefined;
    },

    listApproved: async (postSlug: string): Promise<PublicComment[]> =>
      [...comments.values()]
        .filter((comment) => comment.postSlug === postSlug && comment.approved)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
        .map(({ id, author, content, createdAt, parentId }) => ({ id, author, content, createdAt, parentId })),

    create: async (input: NewComment): Promise<CommentRecord> => {
      const valid = parseNewComment(input);
      const record: CommentRecord = {
        id: nextId,
        postSlug: valid.postSlug,
        author: valid.author,
        email: valid.email ?? null,
        content: valid.content,
        createdAt: new Date(),
        approved: valid.approved,
        parentId: valid.parentId ?? null,
      };
      nextId += 1;
      comments.set(record.id, record);
      return { ...record };
    },

    delete: async (id: number): Promise<boolean> => {
      if (!comments.delete(id)) return false;
      for (const comment of comments.values()) {
        if (comment.parentId === id) comment.parentId = null;
      }
      return true;
    },
  };
}
