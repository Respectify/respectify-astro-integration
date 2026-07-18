import { defineAction, ActionError } from 'astro:actions';
import { z } from 'astro/zod';
import { db, Comment, eq } from 'astro:db';
import { analyzeComment } from './lib/service';

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
    input: z.object({
      postSlug: z.string().min(1),
      author: z.string().min(1).max(100),
      email: z.string().email().optional(),
      content: z.string().min(1).max(5000),
      parentId: z.number().optional(),
    }),
    handler: async ({ postSlug, author, email, content, parentId }) => {
      let replyToComment: string | undefined;
      if (parentId !== undefined) {
        const [parent] = await db.select().from(Comment).where(eq(Comment.id, parentId)).limit(1);
        replyToComment = parent?.content;
      }

      const analysis = await analyzeComment(content, postSlug, { replyToComment });

      if (!analysis.approved) {
        return {
          success: false as const,
          approved: false as const,
          feedback: analysis.feedback,
          suggestion: analysis.suggestion,
          score: analysis.score,
        };
      }

      await db.insert(Comment).values({
        postSlug,
        author,
        email,
        content,
        parentId,
        approved: true,
      });

      return {
        success: true as const,
        approved: true as const,
        feedback: analysis.feedback,
        score: analysis.score,
        message: 'Comment published successfully!',
      };
    },
  }),

  delete: defineAction({
    accept: 'json',
    input: z.object({
      commentId: z.number(),
    }),
    handler: async ({ commentId }, context) => {
      if (!context.locals.isAuthenticated) {
        throw new ActionError({
          code: 'UNAUTHORIZED',
          message: 'You must be logged in to delete comments',
        });
      }

      await db.delete(Comment).where(eq(Comment.id, commentId));
      return { success: true as const };
    },
  }),
};
