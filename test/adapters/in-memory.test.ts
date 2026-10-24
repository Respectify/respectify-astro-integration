import { describeCommentStoreContract } from '../../src/testing';
import { createInMemoryCommentStore } from '../helpers/in-memory-comment-store';

/** The in-memory test store must behave like a real one, or tests built on it prove nothing. */
describeCommentStoreContract('in memory (test helper)', async () => ({ store: createInMemoryCommentStore() }));
