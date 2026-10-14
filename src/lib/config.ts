import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { TOLERANCE_LEVELS } from '@respectify/client';
import type {
  FlooredModerationCategory,
  FlooredToleranceLevel,
  ModerationTolerances,
  ToleranceLevel,
} from '@respectify/client';
import { getIntegrationOptions } from '../runtime-config';
import type { RespectifyClientConfig, RespectifyMegacallConfig } from '../types';

/** Levels a floored category accepts: standard or stricter, never permissive, relaxed or off. */
const FLOORED_TOLERANCE_LEVELS = ['standard', 'strict', 'zero_tolerance'] as const satisfies readonly FlooredToleranceLevel[];

const ToleranceLevelSchema = z.enum(TOLERANCE_LEVELS);

/** Levels looser than a floored category allows, which get the API's floor wording rather than the default error. */
const BELOW_FLOOR_TOLERANCE_LEVELS: readonly ToleranceLevel[] = ['off', 'permissive', 'relaxed'];

/** A floored category's level, rejecting "permissive", "relaxed" and "off" with the same wording the API uses. */
function flooredToleranceLevelSchema(
  category: FlooredModerationCategory,
): z.ZodEnum<z.Writeable<typeof FLOORED_TOLERANCE_LEVELS>> {
  return z.enum(FLOORED_TOLERANCE_LEVELS, {
    errorMap: (_issue, ctx) => ({
      message:
        BELOW_FLOOR_TOLERANCE_LEVELS.includes(ctx.data)
          ? `${category} can be made stricter but not relaxed or turned off`
          : ctx.defaultError,
    }),
  });
}

/**
 * Per-site tolerances: a level per comment-health item (the nine problem categories and
 * quality). Items not named are "standard". Unknown items are rejected.
 */
const ModerationTolerancesSchema = z
  .object({
    threat: flooredToleranceLevelSchema('threat').optional(),
    identity_attack: flooredToleranceLevelSchema('identity_attack').optional(),
    sexual_content: flooredToleranceLevelSchema('sexual_content').optional(),
    harassment: flooredToleranceLevelSchema('harassment').optional(),
    insult: ToleranceLevelSchema.optional(),
    profanity: ToleranceLevelSchema.optional(),
    dismissive_tone: ToleranceLevelSchema.optional(),
    logical_fallacy: ToleranceLevelSchema.optional(),
    low_effort: ToleranceLevelSchema.optional(),
    quality: ToleranceLevelSchema.optional(),
  })
  .strict() satisfies z.ZodType<ModerationTolerances>;

const MegacallConfigSchema = z
  .object({
    includeSpam: z.boolean().optional(),
    includeRelevance: z.boolean().optional(),
    includeCommentScore: z.boolean().optional(),
    includeDogwhistle: z.boolean().optional(),
    bannedTopics: z.array(z.string()).optional(),
    sensitiveTopics: z.array(z.string()).optional(),
    dogwhistleExamples: z.array(z.string()).optional(),
    replyToComment: z.string().optional(),
  })
  .optional();

const ClientConfigSchema = z
  .object({
    baseUrl: z.string().url().optional(),
    version: z.string().optional(),
    timeout: z.number().positive().optional(),
    website: z.string().optional(),
    email: z.string().email().optional(),
    apiKey: z.string().optional(),
  })
  .optional();

const RespectifyConfigSchema = z.object({
  enabled: z.boolean(),
  /** @deprecated Prefer `client.baseUrl` — still accepted and mapped to the client base URL */
  apiEndpoint: z.string().url().optional(),
  requiresAuth: z.boolean().optional(),
  autoPublish: z
    .object({
      enabled: z.boolean(),
      minimumScore: z.number().min(0).max(1),
    })
    .optional(),
  moderation: z.object({
    blockDisrespectful: z.boolean(),
    showFeedbackToUser: z.boolean().optional(),
    allowOverride: z.boolean(),
    /** Reject comments that fail relevance / banned-topic checks (default: true when relevance is enabled) */
    blockOffTopic: z.boolean().optional(),
    /** Reject comments when dogwhistles are detected (default: true when dogwhistle is enabled) */
    blockDogwhistles: z.boolean().optional(),
  }),
  thresholds: z.object({
    autoApprove: z.number().min(0).max(1),
    warn: z.number().min(0).max(1),
    block: z.number().min(0).max(1),
  }),
  feedback: z.object({
    approved: z.string(),
    warning: z.string(),
    blocked: z.string(),
    offTopic: z.string().optional(),
    dogwhistle: z.string().optional(),
  }),
  /** Options forwarded to RespectifyClient (merged with integration `client` options) */
  client: ClientConfigSchema,
  /** Options forwarded to megacall (merged with integration `megacall` options) */
  megacall: MegacallConfigSchema,
  /** Moderation tolerances sent with every megacall (merged with integration `tolerances`) */
  tolerances: ModerationTolerancesSchema.optional(),
});

export type RespectifyConfig = z.infer<typeof RespectifyConfigSchema>;

let cachedConfig: RespectifyConfig | null = null;

export function loadRespectifyConfig(): RespectifyConfig {
  const isDevelopment = import.meta.env.DEV;

  if (cachedConfig && !isDevelopment) {
    return cachedConfig;
  }

  const { configPath } = getIntegrationOptions();
  const resolvedPath = path.isAbsolute(configPath) ? configPath : path.join(process.cwd(), configPath);

  try {
    const configFile = fs.readFileSync(resolvedPath, 'utf-8');
    const config = JSON.parse(configFile) as unknown;
    cachedConfig = RespectifyConfigSchema.parse(config);
    return cachedConfig;
  } catch (error) {
    throw new Error(`Failed to load Respectify config from ${resolvedPath}: ${error}`);
  }
}

/** Merge JSON + integration client options. Integration options win. */
export function resolveClientConfig(config: RespectifyConfig): RespectifyClientConfig {
  const { client: integrationClient } = getIntegrationOptions();
  const fromJson: RespectifyClientConfig = {
    ...(config.apiEndpoint ? { baseUrl: config.apiEndpoint } : {}),
    ...config.client,
  };
  return { ...fromJson, ...integrationClient };
}

/** Merge JSON + integration megacall options. Integration options win. */
export function resolveMegacallConfig(config: RespectifyConfig): RespectifyMegacallConfig {
  const { megacall: integrationMegacall } = getIntegrationOptions();
  return {
    includeSpam: true,
    ...config.megacall,
    ...integrationMegacall,
  };
}

/**
 * Merge JSON + integration tolerances per item. Integration options win.
 * Undefined when neither names an item, so every item is judged at "standard".
 */
export function resolveTolerances(config: RespectifyConfig): ModerationTolerances | undefined {
  const { tolerances: integrationTolerances } = getIntegrationOptions();
  const merged: ModerationTolerances = { ...config.tolerances, ...integrationTolerances };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function getDefaultConfig(): RespectifyConfig {
  return {
    enabled: true,
    moderation: {
      blockDisrespectful: true,
      showFeedbackToUser: true,
      allowOverride: false,
    },
    thresholds: {
      autoApprove: 0.7,
      warn: 0.5,
      block: 0.3,
    },
    feedback: {
      approved: 'Thank you for your respectful comment!',
      warning: 'Your comment may contain disrespectful language. Please consider revising it.',
      blocked: 'Your comment does not meet our respectfulness standards. Please revise and try again.',
    },
  };
}
