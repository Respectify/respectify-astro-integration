/**
 * Stand-in for the integration's `virtual:@respectify/astro/runtime` module (see
 * vitest.config.ts). Matches the declaration in src/env.d.ts. Tests choose the runtime with
 * `setTestRuntime`; the export is a live binding, so code reading it sees the change.
 */
import type { RespectifyRuntime } from '../../src/types';
import { createInMemoryCommentStore } from '../helpers/in-memory-comment-store';

let runtime: RespectifyRuntime = { store: createInMemoryCommentStore() };

/** Use this runtime, or a fresh in-memory store with no post functions when none is given. */
export function setTestRuntime(next: RespectifyRuntime = { store: createInMemoryCommentStore() }): void {
  runtime = next;
}

export { runtime as default };
