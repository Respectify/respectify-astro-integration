import runtime from 'virtual:@respectify/astro/runtime';
import type { RespectifyRuntime } from './types';

/** The site's runtime module, with the default `getPostUrl` applied. */
export type ResolvedRespectifyRuntime = RespectifyRuntime & Required<Pick<RespectifyRuntime, 'getPostUrl'>>;

/** The default canonical post URL: `${site}/posts/${slug}/`. */
function defaultGetPostUrl(slug: string, site: string): string {
  return `${site.replace(/\/$/, '')}/posts/${slug}/`;
}

/**
 * The comment store and post functions from the module named by `respectify({ runtime })`.
 * Kept apart from the options so pages that only need options do not load the store.
 * @throws Error when the runtime module's default export has no store
 */
export function getRespectifyRuntime(): ResolvedRespectifyRuntime {
  if (!runtime?.store) {
    throw new Error(
      '@respectify/astro: the runtime module has no store. Its default export must be defineRespectifyRuntime({ store }).',
    );
  }
  return {
    store: runtime.store,
    getPostUrl: runtime.getPostUrl ?? defaultGetPostUrl,
    getPostContent: runtime.getPostContent,
  };
}
