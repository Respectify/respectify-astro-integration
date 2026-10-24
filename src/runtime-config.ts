import options from 'virtual:@respectify/astro/options';
import type { ResolvedIntegrationOptions } from './types';

/**
 * The options given to `respectify()` in astro.config, with defaults applied. They reach the
 * server bundle through the `virtual:@respectify/astro/options` module, which the integration
 * writes at setup; module state set in astro.config would not.
 */
export function getIntegrationOptions(): ResolvedIntegrationOptions {
  return options;
}

export type { ResolvedIntegrationOptions };
