import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { getIntegrationOptions } from '../runtime-config';
import type { RespectifyClientConfig, RespectifyMegacallConfig } from '../types';

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
