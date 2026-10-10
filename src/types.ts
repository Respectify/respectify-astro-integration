import type { MegacallOptions, ModerationTolerances, RespectifyClientOptions } from '@respectify/client';

/**
 * Options forwarded to `RespectifyClient`.
 * Email and API key default to `RESPECTIFY_EMAIL` / `RESPECTIFY_API_KEY` env vars.
 */
export type RespectifyClientConfig = Partial<RespectifyClientOptions>;

/**
 * Options forwarded to every `megacall`.
 * `comment` and `articleId` are set automatically by the integration, and
 * `tolerances` comes from the top-level `tolerances` option.
 */
export type RespectifyMegacallConfig = Omit<MegacallOptions, 'comment' | 'articleId' | 'tolerances'>;

export interface RespectifyIntegrationOptions {
  /** Path to respectify.config.json (default: ./respectify.config.json) */
  configPath?: string;

  /** Build the canonical URL for a post — used to initialize Respectify topics */
  getPostUrl?: (slug: string, site: string) => string;

  /**
   * Provide a post's raw text content directly instead of having Respectify fetch
   * `getPostUrl`. Useful when the URL isn't publicly fetchable (staged/preview content,
   * auth-gated pages, or timing issues right after deploy). Takes priority over
   * `getPostUrl` for topic initialization when provided.
   */
  getPostContent?: (slug: string) => string | Promise<string>;

  /** API route path for fetching comments (default: /api/respectify/comments) */
  commentsApiPath?: string;

  /** Show Powered by Respectify branding (default: true) */
  showBranding?: boolean;

  /** Rate limit for comment submissions per IP */
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };

  /**
   * Options forwarded to the Respectify API client
   * (`baseUrl`, `timeout`, `version`, `website`, optional credential overrides).
   */
  client?: RespectifyClientConfig;

  /**
   * Options forwarded to every Respectify megacall
   * (`includeSpam`, `includeRelevance`, `includeCommentScore`, `includeDogwhistle`,
   * `bannedTopics`, `sensitiveTopics`, `dogwhistleExamples`, `replyToComment`).
   */
  megacall?: RespectifyMegacallConfig;

  /**
   * Moderation tolerances sent with every megacall, merged per category over the
   * `tolerances` in respectify.config.json (these win). The categories named override
   * the API key's saved tolerances. Floored categories (threat, identity_attack,
   * sexual_content, harassment) can never be "relaxed".
   */
  tolerances?: ModerationTolerances;
}

export interface AnalyzeCommentOptions {
  /** Parent comment text when submitting a reply */
  replyToComment?: string;
}

export interface RespectifyAnalysisResult {
  score: number;
  approved: boolean;
  feedback: string;
  suggestion?: string;
  isSpam?: boolean;
  spamConfidence?: number;
  /** True when the comment score found a problem the site's tolerances do not accept */
  exceedsTolerance?: boolean;
}
