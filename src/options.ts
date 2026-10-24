import { z } from 'zod';
import { RespectifyError, validateModerationTolerances } from '@respectify/client';
import type { ModerationTolerances } from '@respectify/client';
import type {
  RespectifyIntegrationClientConfig,
  RespectifyIntegrationOptions,
  RespectifyMegacallConfig,
  ResolvedIntegrationOptions,
} from './types';

/** The options the server bundle sees when `respectify()` is given only `runtime`. */
export const DEFAULT_INTEGRATION_OPTIONS: ResolvedIntegrationOptions = {
  configPath: './respectify.config.json',
  commentsApiPath: '/api/respectify/comments',
  showBranding: true,
  rateLimit: { windowMs: 5 * 60 * 1000, maxRequests: 10 },
};

/** Options that used to be accepted by `respectify()` and now belong in the runtime module. */
const RUNTIME_ONLY_OPTIONS = ['getPostUrl', 'getPostContent'] as const;

/** Credentials are never serialized into the server bundle. */
const CREDENTIAL_CLIENT_OPTIONS = ['email', 'apiKey'] as const;

const clientConfigSchema = z
  .object({
    baseUrl: z.string().url().optional(),
    version: z.string().optional(),
    timeout: z.number().positive().optional(),
    website: z.string().optional(),
  })
  .strict() satisfies z.ZodType<RespectifyIntegrationClientConfig>;

const megacallConfigSchema = z
  .object({
    includeSpam: z.boolean().optional(),
    includeRelevance: z.boolean().optional(),
    includeCommentScore: z.boolean().optional(),
    includeDogwhistle: z.boolean().optional(),
    includePerspectiveAnalyzeComment: z.boolean().optional(),
    bannedTopics: z.array(z.string()).optional(),
    sensitiveTopics: z.array(z.string()).optional(),
    dogwhistleExamples: z.array(z.string()).optional(),
    replyToComment: z.string().optional(),
    contextComments: z.array(z.string()).optional(),
  })
  .strict() satisfies z.ZodType<RespectifyMegacallConfig>;

/** Tolerances are checked by the Respectify client's own validator, so the wording matches the API. */
const tolerancesSchema = z.custom<ModerationTolerances>().superRefine((tolerances, ctx) => {
  try {
    validateModerationTolerances(tolerances);
  } catch (error) {
    if (!(error instanceof RespectifyError)) throw error;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid Respectify tolerances: ${error.message}` });
  }
});

const integrationOptionsSchema = z
  .object({
    runtime: z.string().min(1, 'runtime must name the module that calls defineRespectifyRuntime()'),
    configPath: z.string().min(1).default(DEFAULT_INTEGRATION_OPTIONS.configPath),
    commentsApiPath: z
      .string()
      .startsWith('/', 'commentsApiPath must be a path starting with "/"')
      .default(DEFAULT_INTEGRATION_OPTIONS.commentsApiPath),
    showBranding: z.boolean().default(DEFAULT_INTEGRATION_OPTIONS.showBranding),
    rateLimit: z
      .object({
        windowMs: z.number().int().positive(),
        maxRequests: z.number().int().positive(),
      })
      .strict()
      .default(DEFAULT_INTEGRATION_OPTIONS.rateLimit),
    client: clientConfigSchema.optional(),
    megacall: megacallConfigSchema.optional(),
    tolerances: tolerancesSchema.optional(),
  })
  .strict();

/** The validated options: what the server bundle sees, plus the runtime module's specifier. */
export type ParsedIntegrationOptions = ResolvedIntegrationOptions & { runtime: string };

/** Throw a clear error for an option that cannot be serialized or must not be. */
function assertNoMisplacedOptions(userOptions: RespectifyIntegrationOptions): void {
  for (const option of RUNTIME_ONLY_OPTIONS) {
    if (option in userOptions) {
      throw new Error(
        `@respectify/astro: the "${option}" option moved out of astro.config. ` +
          `Export it from your runtime module with defineRespectifyRuntime({ store, ${option} }) ` +
          'and point respectify({ runtime }) at that module. Functions cannot reach the server bundle.',
      );
    }
  }

  const client = userOptions.client;
  if (client === undefined) return;
  for (const option of CREDENTIAL_CLIENT_OPTIONS) {
    if (option in client) {
      throw new Error(
        `@respectify/astro: "client.${option}" is not accepted in astro.config, because integration options ` +
          'are written into the server bundle. Set RESPECTIFY_EMAIL and RESPECTIFY_API_KEY instead.',
      );
    }
  }
}

/**
 * Validate `respectify()`'s options and apply defaults. Runs at setup, so a bad option fails
 * the build instead of the first comment.
 * @throws Error naming every invalid option
 */
export function parseIntegrationOptions(userOptions: RespectifyIntegrationOptions): ParsedIntegrationOptions {
  assertNoMisplacedOptions(userOptions);

  const result = integrationOptionsSchema.safeParse(userOptions);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || 'options'}: ${issue.message}`);
    throw new Error(`Invalid @respectify/astro options: ${issues.join('; ')}`);
  }
  return result.data;
}

/** Split the parsed options into the runtime specifier and what the server bundle sees. */
export function toResolvedIntegrationOptions(parsed: ParsedIntegrationOptions): ResolvedIntegrationOptions {
  return {
    configPath: parsed.configPath,
    commentsApiPath: parsed.commentsApiPath,
    showBranding: parsed.showBranding,
    rateLimit: parsed.rateLimit,
    client: parsed.client,
    megacall: parsed.megacall,
    tolerances: parsed.tolerances,
  };
}
