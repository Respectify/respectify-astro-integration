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
const MegacallRequestBodySchema = z
  .object({
    comment: z.string(),
    run_spam_check: z.boolean(),
    run_relevance_check: z.boolean(),
    run_comment_score: z.boolean(),
    run_dogwhistle_check: z.boolean(),
    article_context_id: z.string().optional(),
    tolerances: z.record(z.string()).optional(),
  })
  .passthrough();

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

/** Records the megacall requests the client sends, and answers each with the configured result. */
export interface FakeRespectifyApi {
  respondToMegacallWith: (result: WireMegaCallResult) => void;
  megacallRequests: () => MegacallRequestBody[];
  requestedEndpoints: () => string[];
}

function requestUrl(input: string | URL | Request): string {
  if (input instanceof Request) return input.url;
  return input.toString();
}

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Replace global fetch with a fake Respectify API, so the real RespectifyClient runs end to end
 * (request building, tolerance validation, response sanitising) without any network access.
 * Any endpoint other than inittopic and megacall fails the test.
 */
export function installFakeRespectifyApi(): FakeRespectifyApi {
  let megacallResponse: WireMegaCallResult = megacallResult();
  const megacallBodies: MegacallRequestBody[] = [];
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
      return jsonResponse(megacallResponse);
    }
    throw new Error(`Unexpected Respectify request in test: ${url}`);
  });

  vi.stubGlobal('fetch', fakeFetch);

  return {
    respondToMegacallWith: (result) => {
      megacallResponse = result;
    },
    megacallRequests: () => [...megacallBodies],
    requestedEndpoints: () => [...endpoints],
  };
}
