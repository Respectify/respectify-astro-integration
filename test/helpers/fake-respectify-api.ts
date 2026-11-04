import { vi } from 'vitest';
import { z } from 'zod';
import type { CommentScore, MegaCallResult } from '@respectify/client';

/**
 * A comment score as it arrives on the wire. An API older than moderation tolerances sends
 * neither `exceeds_tolerance` nor `tolerances`, so both are optional here.
 */
export type WireCommentScore = Omit<CommentScore, 'exceeds_tolerance' | 'tolerances'> &
  Partial<Pick<CommentScore, 'exceeds_tolerance' | 'tolerances'>>;

/** A megacall response as it arrives on the wire. */
export type WireMegaCallResult = Omit<MegaCallResult, 'comment_score'> & {
  comment_score: WireCommentScore | null;
};

/** The parts of the megacall request body the tests assert on. */
const MegacallRequestBodySchema = z.looseObject({
    comment: z.string(),
    run_spam_check: z.boolean(),
    run_relevance_check: z.boolean(),
    run_comment_score: z.boolean(),
    run_dogwhistle_check: z.boolean(),
    article_context_id: z.string().optional(),
    tolerances: z.record(z.string(), z.string()).optional(),
});

export type MegacallRequestBody = z.infer<typeof MegacallRequestBodySchema>;

export const FAKE_ARTICLE_ID = '00000000-0000-4000-8000-000000000001';

/** A clean comment score; override fields to shape a scenario. */
export function commentScore(overrides: Partial<WireCommentScore> = {}): WireCommentScore {
  return {
    logical_fallacies: [],
    objectionable_phrases: [],
    negative_tone_phrases: [],
    appears_low_effort: false,
    overall_score: 4,
    toxicity_score: 0,
    toxicity_explanation: '',
    ...overrides,
  };
}

/** A megacall response with every check absent; override fields to shape a scenario. */
export function megacallResult(overrides: Partial<WireMegaCallResult> = {}): WireMegaCallResult {
  return {
    comment_score: null,
    spam_check: null,
    relevance_check: null,
    dogwhistle_check: null,
    perspective: null,
    ...overrides,
  };
}

/** How the fake answers megacall: a result (with optional response headers), or an HTTP error. */
type MegacallAnswer =
  | { kind: 'result'; result: WireMegaCallResult; headers: Record<string, string> }
  | { kind: 'error'; status: number; body: object; headers: Record<string, string> };

/** Records the megacall requests the client sends, and answers each with the configured result. */
export interface FakeRespectifyApi {
  /** Answer megacall with this result, optionally adding response headers such as the revision token */
  respondToMegacallWith: (result: WireMegaCallResult, headers?: Record<string, string>) => void;
  /** Answer megacall with this HTTP error, optionally adding response headers such as Retry-After */
  failMegacallWith: (status: number, body: object, headers?: Record<string, string>) => void;
  megacallRequests: () => MegacallRequestBody[];
  /** The request headers of each megacall, in order */
  megacallRequestHeaders: () => Record<string, string>[];
  requestedEndpoints: () => string[];
}

/** Error bodies the API sends on the free plan, as the backend contract defines them. */
export const FREE_PLAN_ERRORS = {
  allowanceExhausted: (upgradeUrl = 'https://respectify.ai/dashboard/billing') => ({
    error: 'Free comment allowance used up',
    message: `Your free plan's 200 comments are used up. Add credit at ${upgradeUrl} to continue.`,
    code: 402,
    error_code: 'free_allowance_exhausted',
    upgrade_url: upgradeUrl,
  }),
  revisionLimitReached: () => ({
    error: 'Revision limit reached',
    message: 'This comment has used all 5 of its attempts.',
    code: 409,
    error_code: 'revision_limit_reached',
  }),
  rateLimited: () => ({
    error: 'Too Many Requests',
    message: 'Free plan keys are limited per minute.',
    code: 429,
    error_code: 'free_rate_limited',
  }),
  insufficientBalance: () => ({
    error: 'Payment Required',
    message: 'Your balance is too low for this request.',
    code: 402,
  }),
} as const;

function requestUrl(input: string | URL | Request): string {
  if (input instanceof Request) return input.url;
  return input.toString();
}

function jsonResponse(body: object, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

/** The request headers as a plain record, whichever form the client passed them in. */
function headersOf(init: RequestInit | undefined): Record<string, string> {
  const record: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, name) => {
    record[name.toLowerCase()] = value;
  });
  return record;
}

/**
 * Replace global fetch with a fake Respectify API, so the real RespectifyClient runs end to end
 * (request building, tolerance validation, response sanitising) without any network access.
 * Any endpoint other than inittopic and megacall fails the test.
 */
export function installFakeRespectifyApi(): FakeRespectifyApi {
  let megacallAnswer: MegacallAnswer = { kind: 'result', result: megacallResult(), headers: {} };
  const megacallBodies: MegacallRequestBody[] = [];
  const megacallHeaders: Record<string, string>[] = [];
  const endpoints: string[] = [];

  const fakeFetch = vi.fn<typeof fetch>(async (input, init) => {
    const url = requestUrl(input);
    const endpoint = new URL(url).pathname.split('/').pop() ?? '';
    endpoints.push(endpoint);

    if (endpoint === 'inittopic') {
      return jsonResponse({ article_id: FAKE_ARTICLE_ID });
    }
    if (endpoint === 'megacall') {
      const rawBody = typeof init?.body === 'string' ? init.body : '';
      megacallBodies.push(MegacallRequestBodySchema.parse(JSON.parse(rawBody)));
      megacallHeaders.push(headersOf(init));
      return megacallAnswer.kind === 'result'
        ? jsonResponse(megacallAnswer.result, 200, megacallAnswer.headers)
        : jsonResponse(megacallAnswer.body, megacallAnswer.status, megacallAnswer.headers);
    }
    throw new Error(`Unexpected Respectify request in test: ${url}`);
  });

  vi.stubGlobal('fetch', fakeFetch);

  return {
    respondToMegacallWith: (result, headers = {}) => {
      megacallAnswer = { kind: 'result', result, headers };
    },
    failMegacallWith: (status, body, headers = {}) => {
      megacallAnswer = { kind: 'error', status, body, headers };
    },
    megacallRequests: () => [...megacallBodies],
    megacallRequestHeaders: () => megacallHeaders.map((headers) => ({ ...headers })),
    requestedEndpoints: () => [...endpoints],
  };
}
