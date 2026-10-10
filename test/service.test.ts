import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RespectifyConfig } from '../src/lib/config';
import type { analyzeComment as AnalyzeComment } from '../src/lib/service';
import type { RespectifyIntegrationOptions } from '../src/types';
import { baseConfig, createConfigFileDirectory } from './helpers/config-file';
import {
  FAKE_ARTICLE_ID,
  commentScore,
  installFakeRespectifyApi,
  megacallResult,
  type FakeRespectifyApi,
} from './helpers/fake-respectify-api';

const POST_SLUG = 'a-post';
const COMMENT = 'A comment on the post.';

const configFiles = createConfigFileDirectory();
let api: FakeRespectifyApi;

afterAll(() => {
  configFiles.cleanup();
});

beforeEach(() => {
  api = installFakeRespectifyApi();
});

/**
 * Load a fresh copy of the service against this config, so the client and article-ID caches
 * from earlier tests cannot leak in. Topic context comes from getPostContent, which keeps the
 * tests independent of the site URL.
 */
async function loadAnalyzeComment(
  config: RespectifyConfig,
  integrationOptions: RespectifyIntegrationOptions = {},
): Promise<typeof AnalyzeComment> {
  vi.resetModules();
  const runtimeConfig = await import('../src/runtime-config');
  runtimeConfig.setIntegrationOptions({
    configPath: configFiles.write(config),
    getPostContent: async () => 'The post the comments are about.',
    ...integrationOptions,
  });
  const service = await import('../src/lib/service');
  return service.analyzeComment;
}

function withModeration(overrides: Partial<RespectifyConfig['moderation']>): RespectifyConfig {
  const config = baseConfig();
  return { ...config, moderation: { ...config.moderation, ...overrides } };
}

describe('analyzeComment with exceeds_tolerance', () => {
  it('approves when exceeds_tolerance is false, even with a high toxicity score', async () => {
    const analyzeComment = await loadAnalyzeComment(baseConfig());
    api.respondToMegacallWith(
      megacallResult({ comment_score: commentScore({ toxicity_score: 0.9, exceeds_tolerance: false }) }),
    );

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(true);
    expect(result.feedback).toBe('APPROVED');
    expect(result.exceedsTolerance).toBe(false);
    expect(result.score).toBeCloseTo(0.1);
  });

  it('blocks when exceeds_tolerance is true and respectfulness is below the block threshold', async () => {
    const analyzeComment = await loadAnalyzeComment(baseConfig());
    api.respondToMegacallWith(
      megacallResult({ comment_score: commentScore({ toxicity_score: 0.8, exceeds_tolerance: true }) }),
    );

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(false);
    expect(result.feedback).toBe('BLOCKED');
    expect(result.exceedsTolerance).toBe(true);
    expect(result.score).toBeCloseTo(0.2);
  });

  it('blocks below the block threshold even when allowOverride is on', async () => {
    const analyzeComment = await loadAnalyzeComment(withModeration({ allowOverride: true }));
    api.respondToMegacallWith(
      megacallResult({ comment_score: commentScore({ toxicity_score: 0.8, exceeds_tolerance: true }) }),
    );

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(false);
    expect(result.feedback).toBe('BLOCKED');
  });

  it('warns instead of blocking below the block threshold when blockDisrespectful is off', async () => {
    const analyzeComment = await loadAnalyzeComment(withModeration({ blockDisrespectful: false }));
    api.respondToMegacallWith(
      megacallResult({ comment_score: commentScore({ toxicity_score: 0.8, exceeds_tolerance: true }) }),
    );

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(false);
    expect(result.feedback).toBe('WARNING');
  });

  it('warns and holds the comment at or above the block threshold when allowOverride is off', async () => {
    const analyzeComment = await loadAnalyzeComment(baseConfig());
    api.respondToMegacallWith(
      megacallResult({ comment_score: commentScore({ toxicity_score: 0.4, exceeds_tolerance: true }) }),
    );

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(false);
    expect(result.feedback).toBe('WARNING');
    expect(result.exceedsTolerance).toBe(true);
  });

  it('warns and approves at or above the block threshold when allowOverride is on', async () => {
    const analyzeComment = await loadAnalyzeComment(withModeration({ allowOverride: true }));
    api.respondToMegacallWith(
      megacallResult({ comment_score: commentScore({ toxicity_score: 0.4, exceeds_tolerance: true }) }),
    );

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(true);
    expect(result.feedback).toBe('WARNING');
  });

  it('warns when exceeds_tolerance is true even if respectfulness clears the auto-approve threshold', async () => {
    const analyzeComment = await loadAnalyzeComment(baseConfig());
    api.respondToMegacallWith(
      megacallResult({ comment_score: commentScore({ toxicity_score: 0.1, exceeds_tolerance: true }) }),
    );

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(false);
    expect(result.feedback).toBe('WARNING');
  });
});

describe('analyzeComment without exceeds_tolerance', () => {
  it('approves at the auto-approve score when there is no comment score', async () => {
    const analyzeComment = await loadAnalyzeComment(baseConfig());
    api.respondToMegacallWith(megacallResult());

    const result = await analyzeComment(COMMENT);

    expect(result.approved).toBe(true);
    expect(result.feedback).toBe('APPROVED');
    expect(result.score).toBe(0.7);
    expect(result.exceedsTolerance).toBeUndefined();
  });

  it('approves a legacy comment score at or above autoApprove', async () => {
    const analyzeComment = await loadAnalyzeComment(baseConfig());
    api.respondToMegacallWith(megacallResult({ comment_score: commentScore({ toxicity_score: 0.2 }) }));

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(true);
    expect(result.feedback).toBe('APPROVED');
    expect(result.exceedsTolerance).toBeUndefined();
  });

  it('warns on a legacy comment score between block and autoApprove', async () => {
    const analyzeComment = await loadAnalyzeComment(baseConfig());
    api.respondToMegacallWith(megacallResult({ comment_score: commentScore({ toxicity_score: 0.4 }) }));

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(false);
    expect(result.feedback).toBe('WARNING');
    expect(result.exceedsTolerance).toBeUndefined();
  });

  it('blocks a legacy comment score below block', async () => {
    const analyzeComment = await loadAnalyzeComment(baseConfig());
    api.respondToMegacallWith(megacallResult({ comment_score: commentScore({ toxicity_score: 0.8 }) }));

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(false);
    expect(result.feedback).toBe('BLOCKED');
    expect(result.exceedsTolerance).toBeUndefined();
  });
});

describe('tolerances sent with megacall', () => {
  it('sends the merged tolerances when the comment score runs', async () => {
    const config: RespectifyConfig = { ...baseConfig(), tolerances: { insult: 'relaxed', threat: 'strict' } };
    const analyzeComment = await loadAnalyzeComment(config, { tolerances: { threat: 'zero_tolerance' } });
    api.respondToMegacallWith(megacallResult({ comment_score: commentScore({ exceeds_tolerance: false }) }));

    await analyzeComment(COMMENT, POST_SLUG);

    const [request] = api.megacallRequests();
    expect(request?.run_comment_score).toBe(true);
    expect(request?.article_context_id).toBe(FAKE_ARTICLE_ID);
    expect(request?.tolerances).toEqual({ insult: 'relaxed', threat: 'zero_tolerance' });
  });

  it('does not send tolerances without topic context, since the comment score cannot run', async () => {
    const config: RespectifyConfig = { ...baseConfig(), tolerances: { insult: 'relaxed' } };
    const analyzeComment = await loadAnalyzeComment(config);
    api.respondToMegacallWith(megacallResult());

    await analyzeComment(COMMENT);

    const [request] = api.megacallRequests();
    expect(api.requestedEndpoints()).not.toContain('inittopic');
    expect(request?.run_comment_score).toBe(false);
    expect(request?.tolerances).toBeUndefined();
  });

  it('does not send tolerances when the comment score is explicitly disabled', async () => {
    const config: RespectifyConfig = {
      ...baseConfig(),
      tolerances: { insult: 'relaxed' },
      megacall: { includeCommentScore: false },
    };
    const analyzeComment = await loadAnalyzeComment(config);
    api.respondToMegacallWith(megacallResult());

    await analyzeComment(COMMENT, POST_SLUG);

    const [request] = api.megacallRequests();
    expect(request?.article_context_id).toBe(FAKE_ARTICLE_ID);
    expect(request?.run_comment_score).toBe(false);
    expect(request?.tolerances).toBeUndefined();
  });

  it('does not send tolerances when none are configured', async () => {
    const analyzeComment = await loadAnalyzeComment(baseConfig());
    api.respondToMegacallWith(megacallResult({ comment_score: commentScore({ exceeds_tolerance: false }) }));

    await analyzeComment(COMMENT, POST_SLUG);

    const [request] = api.megacallRequests();
    expect(request?.run_comment_score).toBe(true);
    expect(request?.tolerances).toBeUndefined();
  });
});

describe('checks that short-circuit before the content decision', () => {
  /** A comment score the site would accept, so only the short-circuit can reject the comment. */
  const acceptableScore = commentScore({ toxicity_score: 0, exceeds_tolerance: false });

  it('rejects spam even when the comment is within tolerance', async () => {
    const analyzeComment = await loadAnalyzeComment(baseConfig());
    api.respondToMegacallWith(
      megacallResult({
        comment_score: acceptableScore,
        spam_check: { is_spam: true, confidence: 0.95, reasoning: 'Link farm.' },
      }),
    );

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(false);
    expect(result.isSpam).toBe(true);
    expect(result.spamConfidence).toBe(0.95);
    expect(result.exceedsTolerance).toBeUndefined();
  });

  it('rejects an off-topic comment even when it is within tolerance', async () => {
    const analyzeComment = await loadAnalyzeComment(baseConfig());
    api.respondToMegacallWith(
      megacallResult({
        comment_score: acceptableScore,
        relevance_check: {
          on_topic: { on_topic: false, confidence: 0.9, reasoning: 'Unrelated to the post.' },
          banned_topics: { banned_topics: [], quantity_on_banned_topics: 0, confidence: 0.9, reasoning: '' },
        },
      }),
    );

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(false);
    expect(result.feedback).toBe('OFF_TOPIC');
    expect(result.suggestion).toBe('Unrelated to the post.');
  });

  it('rejects a comment on a banned topic even when it is within tolerance', async () => {
    const analyzeComment = await loadAnalyzeComment(baseConfig());
    api.respondToMegacallWith(
      megacallResult({
        comment_score: acceptableScore,
        relevance_check: {
          on_topic: { on_topic: true, confidence: 0.9, reasoning: '' },
          banned_topics: {
            banned_topics: ['politics'],
            quantity_on_banned_topics: 0.6,
            confidence: 0.9,
            reasoning: 'Mostly about politics.',
          },
        },
      }),
    );

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(false);
    expect(result.feedback).toBe('OFF_TOPIC');
    expect(result.suggestion).toBe('Mostly about politics.');
  });

  it('falls through to the content decision for an off-topic comment when blockOffTopic is off', async () => {
    const analyzeComment = await loadAnalyzeComment(withModeration({ blockOffTopic: false }));
    api.respondToMegacallWith(
      megacallResult({
        comment_score: acceptableScore,
        relevance_check: {
          on_topic: { on_topic: false, confidence: 0.9, reasoning: 'Unrelated to the post.' },
          banned_topics: { banned_topics: [], quantity_on_banned_topics: 0, confidence: 0.9, reasoning: '' },
        },
      }),
    );

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(true);
    expect(result.feedback).toBe('APPROVED');
    expect(result.exceedsTolerance).toBe(false);
  });

  it('rejects a dogwhistle even when the comment is within tolerance', async () => {
    const analyzeComment = await loadAnalyzeComment(baseConfig());
    api.respondToMegacallWith(
      megacallResult({
        comment_score: acceptableScore,
        dogwhistle_check: {
          detection: { dogwhistles_detected: true, confidence: 0.85, reasoning: 'Coded language.' },
          details: null,
        },
      }),
    );

    const result = await analyzeComment(COMMENT, POST_SLUG);

    expect(result.approved).toBe(false);
    expect(result.feedback).toBe('DOGWHISTLE');
    expect(result.suggestion).toBe('Coded language.');
  });
});
