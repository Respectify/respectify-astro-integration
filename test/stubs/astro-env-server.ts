/**
 * Stand-in for Astro's `astro:env/server` virtual module (see vitest.config.ts).
 * Matches the declaration in src/env.d.ts. The values are fake: every test that reaches the
 * network stubs `fetch`, so these credentials are never sent anywhere real.
 */
export const RESPECTIFY_EMAIL: string | undefined = 'tests@respectify.invalid';
export const RESPECTIFY_API_KEY: string | undefined = 'test-api-key';
