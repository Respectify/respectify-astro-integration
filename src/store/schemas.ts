import { z } from 'zod';
import { COMMENT_LIMITS } from './limits';
import type { NewComment } from './types';

/** A comment id: a positive integer. */
export const commentIdSchema = z.number().int().positive();

/** What a store accepts in `create`. Every store validates its input against this. */
export const newCommentSchema = z.strictObject({
  postSlug: z.string().min(1).max(COMMENT_LIMITS.postSlugMax),
  author: z.string().min(1).max(COMMENT_LIMITS.authorMax),
  email: z.email().max(COMMENT_LIMITS.emailMax).optional(),
  content: z.string().min(1).max(COMMENT_LIMITS.contentMax),
  approved: z.boolean(),
  parentId: commentIdSchema.optional(),
}) satisfies z.ZodType<NewComment>;

/** Thrown by a store when `create` is given input that does not match `newCommentSchema`. */
export class CommentValidationError extends Error {
  readonly issues: z.core.$ZodIssue[];

  constructor(issues: z.core.$ZodIssue[]) {
    super(`Invalid comment: ${issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`).join('; ')}`);
    this.name = 'CommentValidationError';
    this.issues = issues;
  }
}

/**
 * Validate a new comment for a store.
 * @throws CommentValidationError when it does not match `newCommentSchema`
 */
export function parseNewComment(input: NewComment): NewComment {
  const result = newCommentSchema.safeParse(input);
  if (!result.success) {
    throw new CommentValidationError(result.error.issues);
  }
  return result.data;
}
