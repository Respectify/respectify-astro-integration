export interface RespectifyIntegrationOptions {
  /** Path to respectify.config.json (default: ./respectify.config.json) */
  configPath?: string;

  /** Build the canonical URL for a post — used to initialize Respectify topics */
  getPostUrl?: (slug: string, site: string) => string;

  /** API route path for fetching comments (default: /api/respectify/comments) */
  commentsApiPath?: string;

  /** Show Powered by Respectify branding (default: true) */
  showBranding?: boolean;

  /** Rate limit for comment submissions per IP */
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };
}

export interface RespectifyAnalysisResult {
  score: number;
  approved: boolean;
  feedback: string;
  suggestion?: string;
  isSpam?: boolean;
  spamConfidence?: number;
}
