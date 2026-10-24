import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteComment, deleteCommentInput, submitComment, submitCommentInput } from '../src/actions';
import { analyzeComment } from '../src/lib/service';
import type { ICommentStore } from '../src/store/types';
import type { RespectifyAnalysisResult } from '../src/types';
import { createInMemoryCommentStore } from './helpers/in-memory-comment-store';
import { ActionError } from './stubs/astro-actions';
import { setTestIntegrationOptions } from './stubs/respectify-options';
import { setTestRuntime } from './stubs/respectify-runtime';

vi.mock('../src/lib/service', () => ({ analyzeComment: vi.fn() }));

const analyzeCommentMock = vi.mocked(analyzeComment);
const POST_SLUG = 'a-post';
const APPROVED: RespectifyAnalysisResult = { score: 0.9, approved: true, feedback: 'APPROVED' };
const HELD: RespectifyAnalysisResult = { score: 0.4, approved: false, feedback: 'WARNING', suggestion: 'Be kinder.' };

let store: ICommentStore;
let addressCount = 0;

/** A context from a new client address, so the rate limiter's buckets never carry over between tests. */
function freshClient(): { clientAddress: string } {
  addressCount += 1;
  return { clientAddress: `198.51.100.${addressCount}` };
}

beforeEach(() => {
  store = createInMemoryCommentStore();
  setTestRuntime({ store });
  setTestIntegrationOptions();
  analyzeCommentMock.mockResolvedValue(APPROVED);
});

describe('comments.submit input', () => {
  it('accepts a reply to a positive comment id', () => {
    const input = { postSlug: POST_SLUG, author: 'Ada', content: 'Hi', parentId: 3 };

    expect(submitCommentInput.safeParse(input).success).toBe(true);
  });

  it.each([0, -1, 1.5])('rejects the parent id %s', (parentId) => {
    const input = { postSlug: POST_SLUG, author: 'Ada', content: 'Hi', parentId };

    expect(submitCommentInput.safeParse(input).success).toBe(false);
  });

  it('rejects content over the length limit', () => {
    const input = { postSlug: POST_SLUG, author: 'Ada', content: 'x'.repeat(5001) };

    expect(submitCommentInput.safeParse(input).success).toBe(false);
  });
});

describe('comments.submit', () => {
  it('stores an approved comment as approved', async () => {
    const result = await submitComment(
      { postSlug: POST_SLUG, author: 'Ada', email: 'ada@example.com', content: 'Hi' },
      freshClient(),
    );

    expect(result.success).toBe(true);
    const [stored] = await store.listApproved(POST_SLUG);
    expect(stored).toMatchObject({ author: 'Ada', content: 'Hi', parentId: null });
    expect(await store.findById(stored?.id ?? 0)).toMatchObject({ approved: true, email: 'ada@example.com' });
  });

  it('returns the feedback and stores nothing when the comment is not approved', async () => {
    analyzeCommentMock.mockResolvedValue(HELD);

    const result = await submitComment({ postSlug: POST_SLUG, author: 'Ada', content: 'Hi' }, freshClient());

    expect(result).toEqual({
      success: false,
      approved: false,
      feedback: 'WARNING',
      suggestion: 'Be kinder.',
      suspectedSpam: false,
      score: 0.4,
    });
    expect(await store.listApproved(POST_SLUG)).toEqual([]);
  });

  it("stores a reply and sends the parent's text as the comment it replies to", async () => {
    const parent = await store.create({ postSlug: POST_SLUG, author: 'Bo', content: 'Parent', approved: true });

    await submitComment({ postSlug: POST_SLUG, author: 'Ada', content: 'Reply', parentId: parent.id }, freshClient());

    expect(analyzeCommentMock).toHaveBeenCalledWith('Reply', POST_SLUG, { replyToComment: 'Parent' });
    const replies = (await store.listApproved(POST_SLUG)).filter((comment) => comment.parentId === parent.id);
    expect(replies).toHaveLength(1);
  });

  it('rejects a reply to a comment that does not exist, before calling Respectify', async () => {
    const submitting = submitComment({ postSlug: POST_SLUG, author: 'Ada', content: 'Reply', parentId: 99 }, freshClient());

    await expect(submitting).rejects.toBeInstanceOf(ActionError);
    await expect(submitting).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(analyzeCommentMock).not.toHaveBeenCalled();
  });

  it('rejects a reply to a comment on another post', async () => {
    const parent = await store.create({ postSlug: 'other-post', author: 'Bo', content: 'Parent', approved: true });

    const submitting = submitComment(
      { postSlug: POST_SLUG, author: 'Ada', content: 'Reply', parentId: parent.id },
      freshClient(),
    );

    await expect(submitting).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(analyzeCommentMock).not.toHaveBeenCalled();
  });

  it('rejects a reply to a comment that is not approved', async () => {
    const parent = await store.create({ postSlug: POST_SLUG, author: 'Bo', content: 'Parent', approved: false });

    const submitting = submitComment(
      { postSlug: POST_SLUG, author: 'Ada', content: 'Reply', parentId: parent.id },
      freshClient(),
    );

    await expect(submitting).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(analyzeCommentMock).not.toHaveBeenCalled();
  });

  it('rate-limits a client by the configured limit', async () => {
    setTestIntegrationOptions({ rateLimit: { windowMs: 60_000, maxRequests: 1 } });
    const client = freshClient();

    await submitComment({ postSlug: POST_SLUG, author: 'Ada', content: 'First' }, client);
    const second = submitComment({ postSlug: POST_SLUG, author: 'Ada', content: 'Second' }, client);

    await expect(second).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });
});

describe('comments.delete input', () => {
  it.each([0, -1, 1.5])('rejects the comment id %s', (commentId) => {
    expect(deleteCommentInput.safeParse({ commentId }).success).toBe(false);
  });
});

describe('comments.delete', () => {
  it('refuses when the visitor is not logged in, and keeps the comment', async () => {
    const comment = await store.create({ postSlug: POST_SLUG, author: 'Ada', content: 'Hi', approved: true });

    const deleting = deleteComment({ commentId: comment.id }, { locals: {} });

    await expect(deleting).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(await store.findById(comment.id)).toBeDefined();
  });

  it('deletes the comment for a logged-in admin', async () => {
    const comment = await store.create({ postSlug: POST_SLUG, author: 'Ada', content: 'Hi', approved: true });

    const result = await deleteComment({ commentId: comment.id }, { locals: { isAuthenticated: true } });

    expect(result).toEqual({ success: true });
    expect(await store.findById(comment.id)).toBeUndefined();
  });

  it('reports NOT_FOUND for a comment that does not exist', async () => {
    const deleting = deleteComment({ commentId: 99 }, { locals: { isAuthenticated: true } });

    await expect(deleting).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
