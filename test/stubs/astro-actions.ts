/**
 * Stand-in for Astro's `astro:actions` virtual module (see vitest.config.ts). `defineAction`
 * returns its config unchanged, so the handler is the one the package defines; tests call the
 * exported handlers directly with an input and a minimal context.
 */

/** The error codes the package throws. */
export type ActionErrorCode = 'BAD_REQUEST' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'TOO_MANY_REQUESTS';

export class ActionError extends Error {
  readonly code: ActionErrorCode;

  constructor({ code, message }: { code: ActionErrorCode; message?: string }) {
    super(message ?? code);
    this.name = 'ActionError';
    this.code = code;
  }
}

export function defineAction<TConfig>(config: TConfig): TConfig {
  return config;
}
