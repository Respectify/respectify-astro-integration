import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FLOORED_MODERATION_CATEGORIES } from '@respectify/client';
import { loadRespectifyConfig, resolveTolerances } from '../src/lib/config';
import { setIntegrationOptions } from '../src/runtime-config';
import { baseConfig, createConfigFileDirectory } from './helpers/config-file';

const TUNABLE_CATEGORIES = ['insult', 'profanity', 'dismissive_tone', 'logical_fallacy', 'low_effort'] as const;

const configFiles = createConfigFileDirectory();

afterAll(() => {
  configFiles.cleanup();
});

/** Point the integration at a config file holding these tolerances, then load it. */
function loadWithTolerances(tolerances: Record<string, string>): ReturnType<typeof loadRespectifyConfig> {
  const configPath = configFiles.write({ ...baseConfig(), tolerances });
  setIntegrationOptions({ configPath });
  return loadRespectifyConfig();
}

describe('tolerances schema', () => {
  beforeEach(() => {
    setIntegrationOptions({});
  });

  it.each(FLOORED_MODERATION_CATEGORIES)('rejects relaxed for the floored category %s', (category) => {
    expect(() => loadWithTolerances({ [category]: 'relaxed' })).toThrow(
      `${category} can be made stricter but not relaxed`,
    );
  });

  it.each(FLOORED_MODERATION_CATEGORIES)('accepts standard, strict and zero_tolerance for %s', (category) => {
    for (const level of ['standard', 'strict', 'zero_tolerance'] as const) {
      expect(loadWithTolerances({ [category]: level }).tolerances).toEqual({ [category]: level });
    }
  });

  it.each(TUNABLE_CATEGORIES)('accepts relaxed for the tunable category %s', (category) => {
    expect(loadWithTolerances({ [category]: 'relaxed' }).tolerances).toEqual({ [category]: 'relaxed' });
  });

  it('accepts a mix of floored and tunable categories in one config', () => {
    const tolerances = { threat: 'zero_tolerance', harassment: 'strict', insult: 'relaxed', low_effort: 'strict' };
    expect(loadWithTolerances(tolerances).tolerances).toEqual(tolerances);
  });

  it('rejects an unknown category', () => {
    expect(() => loadWithTolerances({ spam: 'strict' })).toThrow(/Unrecognized key/);
  });

  it('rejects an unknown level on a tunable category', () => {
    expect(() => loadWithTolerances({ insult: 'lenient' })).toThrow(/Invalid enum value/);
  });

  it('rejects an unknown level on a floored category with the default message, not the floor message', () => {
    let thrown: Error | undefined;
    try {
      loadWithTolerances({ threat: 'lenient' });
    } catch (error) {
      if (error instanceof Error) thrown = error;
    }

    expect(thrown?.message).toMatch(/Invalid enum value/);
    expect(thrown?.message).not.toMatch(/can be made stricter but not relaxed/);
  });

  it('leaves tolerances undefined when the config omits them', () => {
    const configPath = configFiles.write(baseConfig());
    setIntegrationOptions({ configPath });

    expect(loadRespectifyConfig().tolerances).toBeUndefined();
  });
});

describe('resolveTolerances', () => {
  beforeEach(() => {
    setIntegrationOptions({});
  });

  it('returns undefined when neither the config nor the integration names a category', () => {
    expect(resolveTolerances(baseConfig())).toBeUndefined();
  });

  it('returns undefined when both name an empty set of categories', () => {
    setIntegrationOptions({ tolerances: {} });

    expect(resolveTolerances({ ...baseConfig(), tolerances: {} })).toBeUndefined();
  });

  it('returns the config tolerances when the integration sets none', () => {
    expect(resolveTolerances({ ...baseConfig(), tolerances: { insult: 'relaxed' } })).toEqual({ insult: 'relaxed' });
  });

  it('returns the integration tolerances when the config sets none', () => {
    setIntegrationOptions({ tolerances: { threat: 'strict' } });

    expect(resolveTolerances(baseConfig())).toEqual({ threat: 'strict' });
  });

  it('merges per category, with the integration winning where both name the same category', () => {
    setIntegrationOptions({ tolerances: { threat: 'zero_tolerance', profanity: 'strict' } });
    const config = { ...baseConfig(), tolerances: { threat: 'strict', insult: 'relaxed' } as const };

    expect(resolveTolerances(config)).toEqual({ threat: 'zero_tolerance', insult: 'relaxed', profanity: 'strict' });
  });
});
