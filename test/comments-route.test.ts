import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../src/lib/logger';
import { GET } from '../src/routes/comments';
import type { ICommentStore } from '../src/store/types';
import { createInMemoryCommentStore } from './helpers/in-memory-comment-store';
import { setTestRuntime } from './stubs/respectify-runtime';

const POST_SLUG = 'a-post';

let store: ICommentStore;

beforeEach(() => {
  store = createInMemoryCommentStore();
  setTestRuntime({ store });
});

/** Call the route for this `?slug=` value, or with no slug when it is null. */
function getComments(slug: string | null): Promise<Response> {
  const url = new URL('https://example.com/api/respectify/comments');
  if (slug !== null) url.searchParams.set('slug', slug);
  return GET({ url });
}

describe('GET comments', () => {
  it("returns the post's approved comments, oldest first, with parentId and without email", async () => {
    const parent = await store.create({
      postSlug: POST_SLUG,
      author: 'Ada',
      email: 'ada@example.com',
      content: 'First',
      approved: true,
    });
    await store.create({ postSlug: POST_SLUG, author: 'Bo', content: 'Reply', approved: true, parentId: parent.id });
    await store.create({ postSlug: POST_SLUG, author: 'Cy', content: 'Held', approved: false });
    await store.create({ postSlug: 'other-post', author: 'Di', content: 'Elsewhere', approved: true });

    const response = await getComments(POST_SLUG);
    const body = (await response.json()) as { comments: Record<string, string | number | null>[] };

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.comments.map(({ content, parentId }) => ({ content, parentId }))).toEqual([
      { content: 'First', parentId: null },
      { content: 'Reply', parentId: parent.id },
    ]);
    expect(Object.keys(body.comments[0] ?? {}).sort()).toEqual(['author', 'content', 'createdAt', 'id', 'parentId']);
  });

  it('rejects a request with no slug', async () => {
    const response = await getComments(null);

    expect(response.status).toBe(400);
  });

  it('rejects an empty slug', async () => {
    const response = await getComments('');

    expect(response.status).toBe(400);
  });

  it('rejects a slug over the length limit', async () => {
    const response = await getComments('x'.repeat(501));

    expect(response.status).toBe(400);
  });

  it('logs and reports a 500 when the store fails, instead of an empty list', async () => {
    const failure = new Error('database is down');
    setTestRuntime({ store: { ...store, listApproved: () => Promise.reject(failure) } });
    const logError = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const response = await getComments(POST_SLUG);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Could not load comments' });
    expect(logError).toHaveBeenCalledWith('Could not load comments', { slug: POST_SLUG, error: failure });
  });
});
