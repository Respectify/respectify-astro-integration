/**
 * Stand-in for the integration's `virtual:@respectify/astro/options` module (see
 * vitest.config.ts). Matches the declaration in src/env.d.ts. Tests choose the options with
 * `setTestIntegrationOptions`; the export is a live binding, so code reading it sees the change.
 */
import { DEFAULT_INTEGRATION_OPTIONS } from '../../src/options';
import type { ResolvedIntegrationOptions } from '../../src/types';

let options: ResolvedIntegrationOptions = { ...DEFAULT_INTEGRATION_OPTIONS };

/** Use the defaults with these overrides, replacing any options an earlier call set. */
export function setTestIntegrationOptions(overrides: Partial<ResolvedIntegrationOptions> = {}): void {
  options = { ...DEFAULT_INTEGRATION_OPTIONS, ...overrides };
}

export { options as default };
