import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { getIntegrationOptions } from '../runtime-config';

const RespectifyConfigSchema = z.object({
  enabled: z.boolean(),
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
  }),
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
