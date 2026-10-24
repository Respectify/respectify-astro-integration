import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AstroIntegration } from 'astro';
import { envField } from 'astro/config';
import { parseIntegrationOptions, toResolvedIntegrationOptions } from './options';
import type { RespectifyIntegrationOptions } from './types';

const OPTIONS_MODULE_ID = 'virtual:@respectify/astro/options';
const RUNTIME_MODULE_ID = 'virtual:@respectify/astro/runtime';

/** A Vite plugin serving virtual modules, in the shape `vite.plugins` accepts. */
interface VirtualModulesPlugin {
  name: string;
  resolveId: (id: string) => string | undefined;
  load: (id: string) => string | undefined;
}

/** Declarations for the virtual modules, injected into the site's generated types. */
const VIRTUAL_MODULE_TYPES = `declare module '${OPTIONS_MODULE_ID}' {
  const options: import('@respectify/astro').ResolvedIntegrationOptions;
  export default options;
}

declare module '${RUNTIME_MODULE_ID}' {
  const runtime: import('@respectify/astro').RespectifyRuntime;
  export default runtime;
}
`;

/**
 * Where Vite should load the runtime module from. A relative path is resolved against the
 * project root; an absolute path or a package specifier is left as given.
 */
function resolveRuntimeSpecifier(runtime: string, root: URL): string {
  if (runtime.startsWith('./') || runtime.startsWith('../')) {
    return fileURLToPath(new URL(runtime, root));
  }
  return path.isAbsolute(runtime) ? path.normalize(runtime) : runtime;
}

/** Serve each virtual module's source, keyed by its public id, using Vite's `\0` resolved-id convention. */
function createVirtualModulesPlugin(modules: Record<string, string>): VirtualModulesPlugin {
  const sources = new Map(Object.entries(modules).map(([id, source]) => [`\0${id}`, source]));
  return {
    name: '@respectify/astro:virtual-modules',
    resolveId: (id) => (sources.has(`\0${id}`) ? `\0${id}` : undefined),
    load: (id) => sources.get(id),
  };
}

/**
 * The Respectify comments integration. Its options are serialized into the server bundle,
 * so they must be plain data; the comment store and post functions live in the module
 * named by `runtime`.
 */
export default function respectify(userOptions: RespectifyIntegrationOptions): AstroIntegration {
  const parsed = parseIntegrationOptions(userOptions);
  const resolvedOptions = toResolvedIntegrationOptions(parsed);
  const routePattern = resolvedOptions.commentsApiPath.replace(/^\//, '');

  return {
    name: '@respectify/astro',
    hooks: {
      'astro:config:setup': ({ config, injectRoute, updateConfig }) => {
        const runtimeSpecifier = resolveRuntimeSpecifier(parsed.runtime, config.root);

        updateConfig({
          env: {
            schema: {
              RESPECTIFY_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
              RESPECTIFY_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
            },
          },
          vite: {
            plugins: [
              createVirtualModulesPlugin({
                [OPTIONS_MODULE_ID]: `export default ${JSON.stringify(resolvedOptions)};`,
                [RUNTIME_MODULE_ID]: `export { default } from ${JSON.stringify(runtimeSpecifier)};`,
              }),
            ],
          },
        });

        injectRoute({
          pattern: routePattern,
          entrypoint: '@respectify/astro/routes/comments',
        });
      },
      'astro:config:done': ({ injectTypes }) => {
        injectTypes({ filename: 'virtual-modules.d.ts', content: VIRTUAL_MODULE_TYPES });
      },
    },
  };
}

/**
 * Re-exported for compatibility. Runtime modules should import `defineRespectifyRuntime` from
 * `@respectify/astro/runtime`: this entry is the integration and imports `astro/config`, which
 * bundling adapters such as Vercel cannot put in a server function.
 */
export { defineRespectifyRuntime } from './define-runtime';

export type {
  RespectifyIntegrationOptions,
  RespectifyIntegrationClientConfig,
  ResolvedIntegrationOptions,
  RespectifyRuntime,
  RespectifyAnalysisResult,
  RespectifyClientConfig,
  RespectifyMegacallConfig,
  AnalyzeCommentOptions,
} from './types';
export type { ICommentStore, CommentRecord, NewComment, PublicComment } from './store/types';
export { CommentValidationError, newCommentSchema } from './store/schemas';
export { COMMENT_LIMITS } from './store/limits';
