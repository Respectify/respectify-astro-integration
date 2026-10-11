import type { RespectifyConfig } from './config';
import { loadRespectifyConfig, resolveClientConfig, resolveMegacallConfig, resolveTolerances } from './config';
import { RESPECTIFY_API_KEY, RESPECTIFY_EMAIL } from 'astro:env/server';
import {
  RespectifyClient,
  AuthenticationError,
  PaymentRequiredError,
  RespectifyError,
  type MegacallOptions,
  type MegaCallResult,
} from '@respectify/client';
import { getIntegrationOptions } from '../runtime-config';
import { logger } from './logger';
import type { AnalyzeCommentOptions, RespectifyAnalysisResult } from '../types';

let client: RespectifyClient | null = null;
let clientFingerprint: string | null = null;
const articleIdCache = new Map<string, string>();

function getRespectifyClient(config: RespectifyConfig): RespectifyClient {
  const clientConfig = resolveClientConfig(config);
  const email = clientConfig.email ?? RESPECTIFY_EMAIL;
  const apiKey = clientConfig.apiKey ?? RESPECTIFY_API_KEY;

  if (!email || !apiKey) {
    throw new Error('Respectify credentials not configured. Set RESPECTIFY_EMAIL and RESPECTIFY_API_KEY.');
  }

  const fingerprint = JSON.stringify({
    email,
    apiKey,
    baseUrl: clientConfig.baseUrl,
    version: clientConfig.version,
    timeout: clientConfig.timeout,
    website: clientConfig.website,
  });

  if (!client || clientFingerprint !== fingerprint) {
    client = new RespectifyClient({
      email,
      apiKey,
      ...(clientConfig.baseUrl !== undefined ? { baseUrl: clientConfig.baseUrl } : {}),
      ...(clientConfig.version !== undefined ? { version: clientConfig.version } : {}),
      ...(clientConfig.timeout !== undefined ? { timeout: clientConfig.timeout } : {}),
      ...(clientConfig.website !== undefined ? { website: clientConfig.website } : {}),
    });
    clientFingerprint = fingerprint;
  }

  return client;
}

async function getOrInitializeArticleId(postSlug: string, config: RespectifyConfig): Promise<string> {
  const cached = articleIdCache.get(postSlug);
  if (cached) return cached;

  const { getPostUrl, getPostContent } = getIntegrationOptions();
  const respectifyClient = getRespectifyClient(config);
  const topicDescription = `Post: ${postSlug}`;

  const result = await (getPostContent
    ? respectifyClient.initTopicFromText(await getPostContent(postSlug), topicDescription)
    : (() => {
        const site = import.meta.env.SITE;
        if (!site) {
          throw new Error('import.meta.env.SITE must be set in astro.config.ts for Respectify topic initialization.');
        }
        return respectifyClient.initTopicFromUrl(getPostUrl!(postSlug, site), topicDescription);
      })());

  articleIdCache.set(postSlug, result.article_id);
  logger.info('Initialized Respectify topic', { postSlug, source: getPostContent ? 'text' : 'url' });

  return result.article_id;
}

export async function verifyRespectifyCredentials(): Promise<boolean> {
  try {
    const config = loadRespectifyConfig();
    const respectifyClient = getRespectifyClient(config);
    const result = await respectifyClient.checkUserCredentials();
    return result.active;
  } catch (error) {
    logger.error('Respectify credential verification failed', { error });
    return false;
  }
}

function buildSuggestion(result: MegaCallResult, showFeedback: boolean): string | undefined {
  if (!showFeedback || !result.comment_score) return undefined;

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

  if (result.relevance_check && !result.relevance_check.on_topic.on_topic) {
    suggestions.push(result.relevance_check.on_topic.reasoning);
  }

  if (result.dogwhistle_check?.detection.dogwhistles_detected && result.dogwhistle_check.detection.reasoning) {
    suggestions.push(result.dogwhistle_check.detection.reasoning);
  }

  return suggestions.length > 0 ? suggestions.join(' ') : undefined;
}

/**
 * Approve, warn or block on the comment's content.
 *
 * With a comment score, `exceeds_tolerance` decides whether there is a problem at all:
 * - false: approved, whatever the toxicity (toxicity_score is not adjusted for the site's
 *   tolerances, so a comment the site accepts is not held back by it)
 * - true: blocked when respectfulness < thresholds.block and blockDisrespectful is on;
 *   otherwise a warning, approved only when allowOverride is on
 *
 * Without exceeds_tolerance the respectfulness bands decide as before: >= autoApprove
 * approves, < block blocks, anything between warns. With no comment score at all the score
 * is autoApprove, so the comment is approved; a comment score lacking exceeds_tolerance
 * (an API older than moderation tolerances) falls back to the bands on 1 - toxicity_score.
 */
function decideOnContent(
  config: RespectifyConfig,
  respectfulnessScore: number,
  exceedsTolerance: boolean | undefined,
): Pick<RespectifyAnalysisResult, 'approved' | 'feedback'> {
  const isWithinTolerance =
    exceedsTolerance === undefined ? respectfulnessScore >= config.thresholds.autoApprove : !exceedsTolerance;

  if (isWithinTolerance) {
    return { approved: true, feedback: config.feedback.approved };
  }
  if (respectfulnessScore < config.thresholds.block && config.moderation.blockDisrespectful) {
    return { approved: false, feedback: config.feedback.blocked };
  }
  return { approved: config.moderation.allowOverride, feedback: config.feedback.warning };
}

export async function analyzeComment(
  text: string,
  postSlug?: string,
  options: AnalyzeCommentOptions = {},
): Promise<RespectifyAnalysisResult> {
  const config: RespectifyConfig = loadRespectifyConfig();

  if (!config.enabled) {
    return {
      score: 1,
      approved: true,
      feedback: config.feedback.approved,
    };
  }

  try {
    const respectifyClient = getRespectifyClient(config);
    let respectifyArticleId: string | undefined;

    if (postSlug) {
      try {
        respectifyArticleId = await getOrInitializeArticleId(postSlug, config);
      } catch (error) {
        logger.warn('Could not initialize Respectify article ID; falling back to spam-only check', {
          postSlug,
          error,
        });
      }
    }

    const megacallDefaults = resolveMegacallConfig(config);
    const megacallOptions: MegacallOptions = {
      ...megacallDefaults,
      comment: text,
    };

    if (respectifyArticleId) {
      megacallOptions.articleId = respectifyArticleId;
      // Score requires an article; enable by default when topic context exists unless explicitly disabled
      if (megacallOptions.includeCommentScore === undefined) {
        megacallOptions.includeCommentScore = true;
      }
    } else {
      // Relevance / comment score / dogwhistle require articleId — drop them without context
      delete megacallOptions.includeRelevance;
      delete megacallOptions.includeCommentScore;
      delete megacallOptions.includeDogwhistle;
    }

    if (options.replyToComment !== undefined) {
      megacallOptions.replyToComment = options.replyToComment;
    }

    // Tolerances only shape the comment score, which needs topic context
    const tolerances = resolveTolerances(config);
    if (tolerances && megacallOptions.includeCommentScore) {
      megacallOptions.tolerances = tolerances;
    }

    const result = await respectifyClient.megacall(megacallOptions);
    const showFeedback = config.moderation.showFeedbackToUser !== false;

    if (result.spam_check?.is_spam) {
      return {
        score: 0,
        approved: false,
        feedback: 'This comment appears to be spam.',
        isSpam: true,
        spamConfidence: result.spam_check.confidence,
      };
    }

    const blockOffTopic = config.moderation.blockOffTopic !== false;
    if (blockOffTopic && result.relevance_check) {
      const { on_topic, banned_topics } = result.relevance_check;
      const hasBannedTopics = banned_topics.banned_topics.length > 0 && banned_topics.quantity_on_banned_topics > 0;
      if (!on_topic.on_topic || hasBannedTopics) {
        return {
          score: 0,
          approved: false,
          feedback: config.feedback.offTopic ?? 'This comment appears to be off-topic.',
          suggestion: showFeedback ? on_topic.reasoning || banned_topics.reasoning : undefined,
        };
      }
    }

    const blockDogwhistles = config.moderation.blockDogwhistles !== false;
    if (blockDogwhistles && result.dogwhistle_check?.detection.dogwhistles_detected) {
      return {
        score: 0,
        approved: false,
        feedback: config.feedback.dogwhistle ?? 'This comment was blocked due to policy violations.',
        suggestion: showFeedback ? result.dogwhistle_check.detection.reasoning : undefined,
      };
    }

    // Respectfulness is 1 - toxicity_score. Without a comment score there is nothing to
    // judge content by, so the comment is treated as at the auto-approve threshold.
    const respectfulnessScore = result.comment_score
      ? 1 - (result.comment_score.toxicity_score ?? 0)
      : config.thresholds.autoApprove;
    const exceedsTolerance = result.comment_score?.exceeds_tolerance;

    const { approved, feedback } = decideOnContent(config, respectfulnessScore, exceedsTolerance);

    const analysisResult: RespectifyAnalysisResult = {
      score: respectfulnessScore,
      approved,
      feedback,
    };
    if (exceedsTolerance !== undefined) analysisResult.exceedsTolerance = exceedsTolerance;
    if (result.comment_score?.health_score !== undefined) analysisResult.healthScore = result.comment_score.health_score;
    if (result.comment_score?.health_items !== undefined) analysisResult.healthItems = result.comment_score.health_items;

    const suggestion = buildSuggestion(result, showFeedback);
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
