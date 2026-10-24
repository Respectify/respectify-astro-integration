import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommentValidationError } from '../store/schemas';
import type { ICommentStore, NewComment } from '../store/types';

/** A store on an empty comment table, and how to release it after the test. */
export interface CommentStoreFixture {
  store: ICommentStore;
  dispose?: () => Promise<void> | void;
}

/**
 * The contract every `ICommentStore` must meet, as a Vitest suite. Call it from a test file
 * with a factory that returns a store on a new, empty, migrated table each time:
 *
 * ```ts
 * import { describeCommentStoreContract } from '@respectify/astro/testing';
 * describeCommentStoreContract('my store', async () => ({ store: createMyStore(await freshDb()) }));
 * ```
 */
export function describeCommentStoreContract(name: string, createFixture: () => Promise<CommentStoreFixture>): void {
  describe(`ICommentStore contract: ${name}`, () => {
    let fixture: CommentStoreFixture;
    let store: ICommentStore;

    beforeEach(async () => {
      fixture = await createFixture();
      store = fixture.store;
    });

    afterEach(async () => {
      await fixture.dispose?.();
    });

    function comment(overrides: Partial<NewComment> = {}): NewComment {
      return { postSlug: 'a-post', author: 'Ada', content: 'A comment.', approved: true, ...overrides };
    }

    describe('create', () => {
      it('returns the stored comment with an id and a creation time', async () => {
        const before = Date.now();
        const created = await store.create(comment({ email: 'ada@example.com' }));

        expect(created).toEqual({
          id: expect.any(Number),
          postSlug: 'a-post',
          author: 'Ada',
          email: 'ada@example.com',
          content: 'A comment.',
          createdAt: expect.any(Date),
          approved: true,
          parentId: null,
        });
        // Some databases keep whole seconds only
        expect(created.createdAt.getTime()).toBeGreaterThanOrEqual(Math.floor(before / 1000) * 1000);
        expect(created.createdAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
      });

      it('stores a missing email and parent as null', async () => {
        const created = await store.create(comment());

        expect(created.email).toBeNull();
        expect(created.parentId).toBeNull();
      });

      it('stores an unapproved comment as unapproved', async () => {
        const created = await store.create(comment({ approved: false }));

        expect(created.approved).toBe(false);
      });

      it('stores the parent of a reply', async () => {
        const parent = await store.create(comment());
        const reply = await store.create(comment({ parentId: parent.id }));

        expect(reply.parentId).toBe(parent.id);
      });

      it('gives each comment a different id', async () => {
        const first = await store.create(comment());
        const second = await store.create(comment());

        expect(second.id).not.toBe(first.id);
      });

      it('keeps quotes, backslashes, SQL and non-Latin text exactly as given', async () => {
        const content = `It's "quoted" \\ back; DROP TABLE comments; -- 你好 🎉`;
        const created = await store.create(comment({ content, author: `O'Brien` }));

        const found = await store.findById(created.id);
        expect(found?.content).toBe(content);
        expect(found?.author).toBe(`O'Brien`);
      });

      it.each<[string, Partial<NewComment>]>([
        ['an empty author', { author: '' }],
        ['an empty comment', { content: '' }],
        ['an empty post slug', { postSlug: '' }],
        ['a comment over the length limit', { content: 'x'.repeat(5001) }],
        ['an author over the length limit', { author: 'x'.repeat(101) }],
        ['an invalid email', { email: 'not-an-email' }],
        ['a parent id that is not a positive integer', { parentId: 0 }],
      ])('rejects %s and stores nothing', async (_label, overrides) => {
        await expect(store.create(comment(overrides))).rejects.toBeInstanceOf(CommentValidationError);

        expect(await store.listApproved(overrides.postSlug ?? 'a-post')).toEqual([]);
      });
    });

    describe('findById', () => {
      it('returns the comment with that id, email included', async () => {
        const created = await store.create(comment({ email: 'ada@example.com', approved: false }));

        expect(await store.findById(created.id)).toEqual(created);
      });

      it('returns undefined when there is no comment with that id', async () => {
        expect(await store.findById(987_654)).toBeUndefined();
      });

      it('returns undefined for an id that is not a positive integer', async () => {
        expect(await store.findById(-1)).toBeUndefined();
        expect(await store.findById(1.5)).toBeUndefined();
      });
    });

    describe('listApproved', () => {
      it("returns only the post's approved comments", async () => {
        const approved = await store.create(comment({ content: 'Approved.' }));
        await store.create(comment({ content: 'Held back.', approved: false }));
        await store.create(comment({ postSlug: 'another-post', content: 'Elsewhere.' }));

        const listed = await store.listApproved('a-post');

        expect(listed.map((c) => c.id)).toEqual([approved.id]);
      });

      it('returns the public fields only, never the email', async () => {
        const parent = await store.create(comment({ email: 'ada@example.com' }));
        const reply = await store.create(comment({ email: 'bob@example.com', author: 'Bob', parentId: parent.id }));

        const listed = await store.listApproved('a-post');

        expect(listed).toEqual([
          { id: parent.id, author: 'Ada', content: 'A comment.', createdAt: parent.createdAt, parentId: null },
          { id: reply.id, author: 'Bob', content: 'A comment.', createdAt: reply.createdAt, parentId: parent.id },
        ]);
      });

      it('lists oldest first, breaking ties by id', async () => {
        const created = [];
        for (const content of ['First.', 'Second.', 'Third.']) {
          created.push(await store.create(comment({ content })));
        }

        const listed = await store.listApproved('a-post');

        expect(listed.map((c) => c.content)).toEqual(['First.', 'Second.', 'Third.']);
      });

      it('returns an empty list for a post with no comments', async () => {
        expect(await store.listApproved('no-such-post')).toEqual([]);
      });
    });

    describe('delete', () => {
      it('deletes the comment and returns true', async () => {
        const created = await store.create(comment());

        expect(await store.delete(created.id)).toBe(true);
        expect(await store.findById(created.id)).toBeUndefined();
        expect(await store.listApproved('a-post')).toEqual([]);
      });

      it('returns false when there is no comment with that id', async () => {
        expect(await store.delete(987_654)).toBe(false);
      });

      it('leaves the other comments alone', async () => {
        const kept = await store.create(comment({ content: 'Kept.' }));
        const removed = await store.create(comment({ content: 'Removed.' }));

        await store.delete(removed.id);

        expect((await store.listApproved('a-post')).map((c) => c.id)).toEqual([kept.id]);
      });

      it('keeps the replies of a deleted comment, with no parent', async () => {
        const parent = await store.create(comment());
        const reply = await store.create(comment({ parentId: parent.id }));

        await store.delete(parent.id);

        expect(await store.findById(reply.id)).toEqual({ ...reply, parentId: null });
      });
    });
  });
}
