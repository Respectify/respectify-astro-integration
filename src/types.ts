import type {
  HealthItemScores,
  MegacallOptions,
  ModerationTolerances,
  RespectifyClientOptions,
} from '@respectify/client';
import type { CommentRecord, ICommentStore } from './store/types';

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

/**
 * Client options the integration accepts in astro.config. Credentials are not among them:
 * options are serialized into the server bundle, so credentials come from the
 * `RESPECTIFY_EMAIL` / `RESPECTIFY_API_KEY` env vars (or respectify.config.json) instead.
 */
export type RespectifyIntegrationClientConfig = Omit<RespectifyClientConfig, 'email' | 'apiKey'>;

/**
 * Options for `respectify()` in astro.config. Every option must be serializable: they are
 * passed to the server bundle as JSON. Functions and the comment store belong in the
 * runtime module (see `defineRespectifyRuntime`).
 */
export interface RespectifyIntegrationOptions {
  /**
   * The runtime module: a file whose default export is `defineRespectifyRuntime({ store, ... })`.
   * A relative path is resolved against the project root; a package specifier is left to Vite.
   */
  runtime: string;

  /** Path to respectify.config.json (default: ./respectify.config.json) */
  configPath?: string;

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
   * Options forwarded to the Respectify API client (`baseUrl`, `timeout`, `version`, `website`).
   */
  client?: RespectifyIntegrationClientConfig;

  /**
   * Options forwarded to every Respectify megacall
   * (`includeSpam`, `includeRelevance`, `includeCommentScore`, `includeDogwhistle`,
   * `bannedTopics`, `sensitiveTopics`, `dogwhistleExamples`, `replyToComment`).
   */
  megacall?: RespectifyMegacallConfig;

  /**
   * Comment-health tolerances sent with every megacall, merged per item over the
   * `tolerances` in respectify.config.json (these win). Items not named are "standard".
   * Floored categories (threat, identity_attack, sexual_content, harassment) can never
   * be "permissive", "relaxed" or "off".
   */
  tolerances?: ModerationTolerances;
}

/** The integration options as the server bundle sees them, with defaults applied. */
export interface ResolvedIntegrationOptions {
  configPath: string;
  commentsApiPath: string;
  showBranding: boolean;
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  client?: RespectifyIntegrationClientConfig;
  megacall?: RespectifyMegacallConfig;
  tolerances?: ModerationTolerances;
}

/**
 * What the runtime module provides: the parts of the integration that are not serializable.
 * It is loaded in the server bundle, so it may hold database clients and functions.
 */
export interface RespectifyRuntime {
  /** Where comments are kept */
  store: ICommentStore;

  /** Build the canonical URL for a post, used to initialize Respectify topics (default: `${site}/posts/${slug}/`) */
  getPostUrl?: (slug: string, site: string) => string;

  /**
   * Provide a post's raw text content directly instead of having Respectify fetch
   * `getPostUrl`. Useful when the URL isn't publicly fetchable (staged/preview content,
   * auth-gated pages, or timing issues right after deploy). Takes priority over
   * `getPostUrl` for topic initialization when provided.
   */
  getPostContent?: (slug: string) => string | Promise<string>;

  /**
   * Called when Respectify stops moderating because the account's free plan is used up.
   * From then on comments are published unmoderated, so tell yourself: email, Slack, a
   * dashboard flag. Called once per affected comment. Commenters are never told. The event
   * is also logged at error level whether or not this is set.
   */
  onModerationStopped?: (event: ModerationStoppedEvent) => void | Promise<void>;

  /**
   * Called when a comment is stored for you to review instead of being published or
   * rejected: on the free plan, a comment that has used all five of its attempts. The
   * comment is in your store with `approved: false`; set `approved` to true to publish it,
   * or delete it.
   */
  onHeldForReview?: (event: HeldForReviewEvent) => void | Promise<void>;
}

/** Why moderation stopped. Only the free plan can run out today. */
export type ModerationStoppedReason = 'free_allowance_exhausted';

/** What `onModerationStopped` receives. */
export interface ModerationStoppedEvent {
  reason: ModerationStoppedReason;
  /** Where to add credit so moderation resumes */
  upgradeUrl: string;
  /** The API's own message, which already names the upgrade URL */
  message: string;
  /** The post the unmoderated comment was published on */
  postSlug: string | undefined;
}

/** Why a comment was held rather than published or rejected. */
export type HeldForReviewReason = 'revision_limit_reached';

/** What `onHeldForReview` receives. */
export interface HeldForReviewEvent {
  reason: HeldForReviewReason;
  /** The stored comment, with `approved: false` */
  comment: CommentRecord;
}

export interface AnalyzeCommentOptions {
  /** Parent comment text when submitting a reply */
  replyToComment?: string;
  /**
   * The revision token the previous analysis of this same comment returned, when the
   * commenter is resubmitting a revised version (see `RespectifyAnalysisResult.revisionToken`).
   */
  revisionToken?: string;
}

/** Moderation did not run on this comment; it was published as it was. */
export interface ModerationSkipped {
  reason: ModerationStoppedReason;
  /** Where to add credit so moderation resumes */
  upgradeUrl: string;
}

export interface RespectifyAnalysisResult {
  score: number;
  approved: boolean;
  feedback: string;
  suggestion?: string;
  /**
   * Set when the comment went through unmoderated because the account's free plan is used
   * up. `approved` is true: publish it as it is, and tell the site owner, never the commenter.
   */
  moderationSkipped?: ModerationSkipped;
  /**
   * True when the comment should be stored unpublished for the site owner to review, rather
   * than rejected: on the free plan, when it has used all five of its attempts. `approved`
   * is false.
   */
  heldForReview?: boolean;
  /**
   * On the free plan, the token to send back (as `AnalyzeCommentOptions.revisionToken`) if the
   * commenter revises this comment, so the revision is not counted as a new comment. Absent
   * for paid accounts.
   */
  revisionToken?: string;
  /** True when the comment is spam: it is rejected */
  isSpam?: boolean;
  spamConfidence?: number;
  /**
   * True when the comment looks like spam but is not certain. It is not approved (never,
   * even with `allowOverride`), but it is not rejected as spam either: `feedback` carries
   * the server's suggestion so the commenter can revise it. Set when a spam check ran.
   */
  suspectedSpam?: boolean;
  /** The server's suggestion for a suspected-spam comment, such as to remove a link */
  spamSuggestion?: string;
  /** True when the comment score found a problem the site's tolerances do not accept */
  exceedsTolerance?: boolean;
  /** Comment health, 1.0-5.0, when the API returned it */
  healthScore?: number;
  /** Per-item comment-health results (score, minimum, is_acceptable), when the API returned them */
  healthItems?: HealthItemScores;
}
