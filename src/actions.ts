import { defineAction, ActionError, type ActionAPIContext } from 'astro:actions';
import { z } from 'astro/zod';
import { analyzeComment } from './lib/service';
import { checkRateLimit } from './lib/rate-limit';
import { getIntegrationOptions } from './runtime-config';
import { getRespectifyRuntime } from './runtime';
import { COMMENT_LIMITS } from './store/limits';
import { CommentValidationError } from './store/schemas';

/** Input to `comments.submit`. Uses Astro's Zod (3 on Astro 5, 4 on Astro 6+), so only API both share. */
export const submitCommentInput = z.object({
  postSlug: z.string().min(1).max(COMMENT_LIMITS.postSlugMax),
  author: z.string().min(1).max(COMMENT_LIMITS.authorMax),
  email: z.string().email().max(COMMENT_LIMITS.emailMax).optional(),
  content: z.string().min(1).max(COMMENT_LIMITS.contentMax),
  parentId: z.number().int().positive().optional(),
});

/** Input to `comments.delete`. */
export const deleteCommentInput = z.object({
  commentId: z.number().int().positive(),
});

export type SubmitCommentInput = z.infer<typeof submitCommentInput>;
export type DeleteCommentInput = z.infer<typeof deleteCommentInput>;

export type SubmitCommentResult =
  | {
      success: false;
      approved: false;
      feedback: string;
      suggestion: string | undefined;
      suspectedSpam: boolean;
      score: number;
    }
  | {
      success: true;
      approved: true;
      feedback: string;
      score: number;
      message: string;
    };

/** The client's address, or a shared bucket when the adapter or rendering mode does not expose one. */
function clientAddressOf(context: Pick<ActionAPIContext, 'clientAddress'>): string {
  try {
    return context.clientAddress;
  } catch {
    return 'unknown';
  }
}

/**
 * The text of the comment being replied to.
 * @throws ActionError BAD_REQUEST when the parent does not exist, is on another post, or is not approved
 */
async function loadReplyTarget(parentId: number, postSlug: string): Promise<string> {
  const parent = await getRespectifyRuntime().store.findById(parentId);
  if (!parent || parent.postSlug !== postSlug || !parent.approved) {
    throw new ActionError({ code: 'BAD_REQUEST', message: 'The comment you are replying to was not found.' });
  }
  return parent.content;
}

/**
 * Rate-limit, moderate with Respectify, and store the comment when it is approved.
 * @throws ActionError TOO_MANY_REQUESTS, or BAD_REQUEST for an invalid parent or comment
 */
export async function submitComment(
  { postSlug, author, email, content, parentId }: SubmitCommentInput,
  context: Pick<ActionAPIContext, 'clientAddress'>,
): Promise<SubmitCommentResult> {
  const { rateLimit } = getIntegrationOptions();
  if (!checkRateLimit(clientAddressOf(context), rateLimit.windowMs, rateLimit.maxRequests)) {
    throw new ActionError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many comments submitted. Please wait a bit before trying again.',
    });
  }

  const replyToComment = parentId === undefined ? undefined : await loadReplyTarget(parentId, postSlug);
  const analysis = await analyzeComment(content, postSlug, { replyToComment });

  if (!analysis.approved) {
    return {
      success: false,
      approved: false,
      feedback: analysis.feedback,
      suggestion: analysis.suggestion,
      suspectedSpam: analysis.suspectedSpam === true,
      score: analysis.score,
    };
  }

  try {
    await getRespectifyRuntime().store.create({ postSlug, author, email, content, parentId, approved: true });
  } catch (error) {
    if (error instanceof CommentValidationError) {
      throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
    }
    throw error;
  }

  return {
    success: true,
    approved: true,
    feedback: analysis.feedback,
    score: analysis.score,
    message: 'Comment published successfully!',
  };
}

/**
 * Delete a comment. Only for an authenticated admin.
 * @throws ActionError UNAUTHORIZED when not logged in, NOT_FOUND when there is no such comment
 */
export async function deleteComment(
  { commentId }: DeleteCommentInput,
  context: Pick<ActionAPIContext, 'locals'>,
): Promise<{ success: true }> {
  if (!context.locals.isAuthenticated) {
    throw new ActionError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to delete comments',
    });
  }

  const deleted = await getRespectifyRuntime().store.delete(commentId);
  if (!deleted) {
    throw new ActionError({ code: 'NOT_FOUND', message: 'Comment not found' });
  }
  return { success: true };
}

/**
 * Merge into your src/actions/index.ts:
 *
 * ```ts
 * import { respectifyCommentActions } from '@respectify/astro/actions';
 *
 * export const server = {
 *   comments: respectifyCommentActions,
 *   // ...your other actions
 * };
 * ```
 */
export const respectifyCommentActions = {
  submit: defineAction({
    accept: 'json',
    input: submitCommentInput,
    handler: submitComment,
  }),

  delete: defineAction({
    accept: 'json',
    input: deleteCommentInput,
    handler: deleteComment,
  }),
};
