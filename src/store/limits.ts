/**
 * Length limits for comment fields, shared by the store's input schema and the
 * `comments.submit` action's schema (which uses Astro's own Zod, so it cannot share the
 * schema object itself).
 */
export const COMMENT_LIMITS = {
  postSlugMax: 500,
  authorMax: 100,
  emailMax: 320,
  contentMax: 5000,
} as const;
