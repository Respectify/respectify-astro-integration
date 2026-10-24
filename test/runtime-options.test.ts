import { describe, expect, it, vi } from 'vitest';
import type { AstroIntegration } from 'astro';

/**
 * Astro evaluates astro.config, and so `respectify()`, in a different module graph from the
 * server bundle that runs the actions and the comments route. Module state set by
 * `respectify()` never reaches that bundle. These tests reproduce that split with
 * `vi.resetModules()`: the integration runs in one module instance, and the server code is
 * loaded fresh, as it is in production.
 */
type SetupHook = NonNullable<AstroIntegration['hooks']['astro:config:setup']>;
type SetupOptions = Parameters<SetupHook>[0];

interface VitePluginLike {
  name: string;
  resolveId?: (id: string) => string | undefined | Promise<string | undefined>;
  load?: (id: string) => string | undefined | Promise<string | undefined>;
}

/** Run the integration's setup hook and return the Vite plugins it registers. */
async function runSetup(integration: AstroIntegration): Promise<VitePluginLike[]> {
  const plugins: VitePluginLike[] = [];
  const hook = integration.hooks['astro:config:setup'];
  if (!hook) throw new Error('The integration has no astro:config:setup hook');
  // Only the root of the Astro config is read by the hook
  const setupOptions: Partial<Omit<SetupOptions, 'config'>> & { config: Pick<SetupOptions['config'], 'root'> } = {
    config: { root: new URL('file:///project/') },
    command: 'build',
    isRestart: false,
    injectRoute: () => {},
    addMiddleware: () => {},
    addWatchFile: () => {},
    updateConfig: (config) => {
      plugins.push(...((config.vite?.plugins ?? []) as VitePluginLike[]));
      return config as SetupOptions['config'];
    },
  };
  await hook(setupOptions as SetupOptions);
  return plugins;
}

/** Load a virtual module's source the way Vite would, through the integration's plugins. */
async function loadVirtualModule(plugins: VitePluginLike[], id: string): Promise<string | undefined> {
  for (const plugin of plugins) {
    const resolved = await plugin.resolveId?.(id);
    if (resolved) return plugin.load?.(resolved);
  }
  return undefined;
}

describe('integration options reach the server bundle', () => {
  it('exposes the options given to respectify() to a fresh copy of the server code', async () => {
    vi.resetModules();
    const { default: respectify } = await import('../src/index');
    const integration = respectify({
      runtime: './src/respectify.runtime.ts',
      commentsApiPath: '/api/comments',
      showBranding: false,
      rateLimit: { windowMs: 1000, maxRequests: 3 },
      tolerances: { insult: 'relaxed' },
    });
    const plugins = await runSetup(integration);

    const source = await loadVirtualModule(plugins, 'virtual:@respectify/astro/options');

    expect(source).toBeDefined();
    const serialized = /export default (.*);?$/s.exec(source ?? '')?.[1]?.replace(/;\s*$/, '');
    expect(JSON.parse(serialized ?? 'null')).toMatchObject({
      commentsApiPath: '/api/comments',
      showBranding: false,
      rateLimit: { windowMs: 1000, maxRequests: 3 },
      tolerances: { insult: 'relaxed' },
    });
  });

  it("points the runtime virtual module at the site's runtime file, resolved from the project root", async () => {
    vi.resetModules();
    const { default: respectify } = await import('../src/index');
    const plugins = await runSetup(respectify({ runtime: './src/respectify.runtime.ts' }));

    const source = await loadVirtualModule(plugins, 'virtual:@respectify/astro/runtime');

    expect(source).toContain('/project/src/respectify.runtime.ts');
  });

  it('rejects a function in the integration options, since it cannot reach the server bundle', async () => {
    vi.resetModules();
    const { default: respectify } = await import('../src/index');
    const options = {
      runtime: './src/respectify.runtime.ts',
      getPostUrl: (slug: string, site: string) => `${site}/blog/${slug}/`,
    };

    expect(() => respectify(options as Parameters<typeof respectify>[0])).toThrow(/getPostUrl.*defineRespectifyRuntime/s);
  });
});

describe('integration option validation at setup', () => {
  it('applies the defaults to the options the server bundle sees', async () => {
    const { default: respectify } = await import('../src/index');
    const plugins = await runSetup(respectify({ runtime: './src/respectify.runtime.ts' }));

    const source = await loadVirtualModule(plugins, 'virtual:@respectify/astro/options');

    expect(source).toBe(
      'export default {"configPath":"./respectify.config.json","commentsApiPath":"/api/respectify/comments","showBranding":true,"rateLimit":{"windowMs":300000,"maxRequests":10}};',
    );
  });

  it('rejects credentials in the client options, since they would be written into the bundle', async () => {
    const { default: respectify } = await import('../src/index');
    const options = { runtime: './src/respectify.runtime.ts', client: { apiKey: 'secret' } };

    expect(() => respectify(options as Parameters<typeof respectify>[0])).toThrow(/client\.apiKey.*RESPECTIFY_API_KEY/s);
  });

  it('rejects tolerances the Respectify client does not accept', async () => {
    const { default: respectify } = await import('../src/index');
    const options = { runtime: './src/respectify.runtime.ts', tolerances: { threat: 'relaxed' } };

    expect(() => respectify(options as Parameters<typeof respectify>[0])).toThrow(/Invalid Respectify tolerances/);
  });
});
