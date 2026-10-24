import type { RespectifyRuntime } from './types';

/**
 * Define the runtime module named by `respectify({ runtime })`. Its default export must be
 * the value this returns:
 *
 * ```ts
 * // src/respectify.runtime.ts
 * import { defineRespectifyRuntime } from '@respectify/astro/runtime';
 * import { createSqliteCommentStore } from '@respectify/astro/sqlite';
 *
 * export default defineRespectifyRuntime({ store: createSqliteCommentStore(db) });
 * ```
 *
 * This entry is bundled into the server, so it must never value-import `astro`, `astro/*`
 * or `astro:*`: bundling adapters such as Vercel cannot put Astro's compiler in a function.
 */
export function defineRespectifyRuntime(runtime: RespectifyRuntime): RespectifyRuntime {
  return runtime;
}

export type { RespectifyRuntime } from './types';
export type { ICommentStore, CommentRecord, NewComment, PublicComment } from './store/types';
