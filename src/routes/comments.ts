import type { APIContext } from 'astro';
import { logger } from '../lib/logger';
import { getRespectifyRuntime } from '../runtime';
import { COMMENT_LIMITS } from '../store/limits';
import type { PublicComment } from '../store/types';

export const prerender = false;

function json(body: Record<string, string | PublicComment[]>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

/** The approved comments on the post named by `?slug=`, oldest first. */
export async function GET(context: Pick<APIContext, 'url'>): Promise<Response> {
  const slug = context.url.searchParams.get('slug');

  if (!slug || slug.length > COMMENT_LIMITS.postSlugMax) {
    return json({ error: 'Missing or invalid slug parameter' }, 400);
  }

  try {
    const approved = await getRespectifyRuntime().store.listApproved(slug);
    // Copy only the public fields, so a store that returns more can never leak them
    const comments = approved.map(({ id, author, content, createdAt, parentId }) => ({
      id,
      author,
      content,
      createdAt,
      parentId,
    }));
    return json({ comments }, 200);
  } catch (error) {
    logger.error('Could not load comments', { slug, error });
    return json({ error: 'Could not load comments' }, 500);
  }
}
