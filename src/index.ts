import type { AstroIntegration } from 'astro';
import { envField } from 'astro/config';
import { setIntegrationOptions } from './runtime-config';
import type { RespectifyIntegrationOptions } from './types';

export default function respectify(userOptions: RespectifyIntegrationOptions = {}): AstroIntegration {
  setIntegrationOptions(userOptions);

  const commentsApiPath = userOptions.commentsApiPath ?? '/api/respectify/comments';
  const routePattern = commentsApiPath.replace(/^\//, '');

  return {
    name: '@respectify/astro',
    hooks: {
      'astro:config:setup': ({ injectRoute, updateConfig }) => {
        updateConfig({
          env: {
            schema: {
              RESPECTIFY_EMAIL: envField.string({ context: 'server', access: 'secret' }),
              RESPECTIFY_API_KEY: envField.string({ context: 'server', access: 'secret' }),
            },
          },
        });

        injectRoute({
          pattern: routePattern,
          entrypoint: '@respectify/astro/routes/comments',
        });
      },
    },
  };
}

export type { RespectifyIntegrationOptions, RespectifyAnalysisResult } from './types';
