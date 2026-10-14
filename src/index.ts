import type { AstroIntegration } from 'astro';
import { envField } from 'astro/config';
import { RespectifyError, validateModerationTolerances } from '@respectify/client';
import { setIntegrationOptions } from './runtime-config';
import type { RespectifyIntegrationOptions } from './types';

/** Fail at setup, not on the first comment, when the integration's tolerances are invalid. */
function assertValidTolerances(userOptions: RespectifyIntegrationOptions): void {
  if (userOptions.tolerances === undefined) return;
  try {
    validateModerationTolerances(userOptions.tolerances);
  } catch (error) {
    if (error instanceof RespectifyError) {
      throw new Error(`Invalid Respectify tolerances: ${error.message}`);
    }
    throw error;
  }
}

export default function respectify(userOptions: RespectifyIntegrationOptions = {}): AstroIntegration {
  assertValidTolerances(userOptions);
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
              RESPECTIFY_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
              RESPECTIFY_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
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

export type {
  RespectifyIntegrationOptions,
  RespectifyAnalysisResult,
  RespectifyClientConfig,
  RespectifyMegacallConfig,
  AnalyzeCommentOptions,
} from './types';
