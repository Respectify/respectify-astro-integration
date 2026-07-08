import type { RespectifyConfig } from './config';
import { loadRespectifyConfig } from './config';
import { RESPECTIFY_API_KEY, RESPECTIFY_EMAIL } from 'astro:env/server';
import {
  RespectifyClient,
  AuthenticationError,
  PaymentRequiredError,
  RespectifyError,
} from '@respectify/client';
import { getIntegrationOptions } from '../runtime-config';
import { logger } from './logger';
import type { RespectifyAnalysisResult } from '../types';

let client: RespectifyClient | null = null;
const articleIdCache = new Map<string, string>();

function getRespectifyClient(): RespectifyClient {
  if (!client) {
    if (!RESPECTIFY_EMAIL || !RESPECTIFY_API_KEY) {
      throw new Error('Respectify credentials not configured. Set RESPECTIFY_EMAIL and RESPECTIFY_API_KEY.');
    }

    client = new RespectifyClient({
      email: RESPECTIFY_EMAIL,
      apiKey: RESPECTIFY_API_KEY,
    });
  }

  return client;
}

async function getOrInitializeArticleId(postSlug: string): Promise<string> {
  const cached = articleIdCache.get(postSlug);
  if (cached) return cached;

  const { getPostUrl } = getIntegrationOptions();
  const site = import.meta.env.SITE;
  if (!site) {
    throw new Error('import.meta.env.SITE must be set in astro.config.ts for Respectify topic initialization.');
  }

  const postUrl = getPostUrl!(postSlug, site);
  const respectifyClient = getRespectifyClient();

  const result = await respectifyClient.initTopicFromUrl(postUrl, `Post: ${postSlug}`);
  articleIdCache.set(postSlug, result.article_id);
  logger.info('Initialized Respectify topic', { postSlug });

  return result.article_id;
}

export async function verifyRespectifyCredentials(): Promise<boolean> {
  try {
    const respectifyClient = getRespectifyClient();
    const result = await respectifyClient.checkUserCredentials();
    return result.active;
  } catch (error) {
    logger.error('Respectify credential verification failed', { error });
    return false;
  }
}

export async function analyzeComment(text: string, postSlug?: string): Promise<RespectifyAnalysisResult> {
  const config: RespectifyConfig = loadRespectifyConfig();

  if (!config.enabled) {
    return {
      score: 1,
      approved: true,
      feedback: config.feedback.approved,
    };
  }

  try {
    const respectifyClient = getRespectifyClient();
    let respectifyArticleId: string | undefined;

    if (postSlug) {
      try {
        respectifyArticleId = await getOrInitializeArticleId(postSlug);
      } catch (error) {
        logger.warn('Could not initialize Respectify article ID; falling back to spam-only check', {
          postSlug,
          error,
        });
      }
    }

    const megacallOptions: {
      comment: string;
      articleId?: string;
      includeSpam: boolean;
      includeCommentScore?: boolean;
    } = {
      comment: text,
      includeSpam: true,
    };

    if (respectifyArticleId) {
      megacallOptions.articleId = respectifyArticleId;
      megacallOptions.includeCommentScore = true;
    }

    const result = await respectifyClient.megacall(megacallOptions);

    if (result.spam_check?.is_spam) {
      return {
        score: 0,
        approved: false,
        feedback: 'This comment appears to be spam.',
        isSpam: true,
        spamConfidence: result.spam_check.confidence,
      };
    }

    let respectfulnessScore = config.thresholds.autoApprove;

    if (result.comment_score) {
      const toxicityScore = result.comment_score.toxicity_score ?? 0;
      respectfulnessScore = 1 - toxicityScore;
    }

    let approved = false;
    let feedback = '';

    if (respectfulnessScore >= config.thresholds.autoApprove) {
      approved = true;
      feedback = config.feedback.approved;
    } else if (respectfulnessScore < config.thresholds.block && config.moderation.blockDisrespectful) {
      approved = false;
      feedback = config.feedback.blocked;
    } else {
      approved = config.moderation.allowOverride;
      feedback = config.feedback.warning;
    }

    let suggestion: string | undefined;
    if (result.comment_score) {
      const suggestions: string[] = [];

      if (result.comment_score.toxicity_explanation) {
        suggestions.push(result.comment_score.toxicity_explanation);
      }

      if (result.comment_score.logical_fallacies.length > 0) {
        suggestions.push(
          `Logical fallacies detected: ${result.comment_score.logical_fallacies.map((f) => f.fallacy_name).join(', ')}`,
        );
      }

      if (result.comment_score.objectionable_phrases.length > 0) {
        suggestions.push(`Objectionable phrases found: ${result.comment_score.objectionable_phrases.length} issue(s)`);
      }

      if (suggestions.length > 0) suggestion = suggestions.join(' ');
    }

    const analysisResult: RespectifyAnalysisResult = {
      score: respectfulnessScore,
      approved,
      feedback,
    };

    if (suggestion) analysisResult.suggestion = suggestion;

    return analysisResult;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      logger.error('Respectify authentication failed', { error });
    } else if (error instanceof PaymentRequiredError) {
      logger.error('Respectify subscription required', { error });
    } else if (error instanceof RespectifyError) {
      logger.error('Respectify API error', { statusCode: error.statusCode, message: error.message });
    } else {
      logger.error('Respectify analysis failed', { error });
    }

    return {
      score: 0,
      approved: false,
      feedback: 'Comment analysis service is temporarily unavailable. Please try again later.',
    };
  }
}
