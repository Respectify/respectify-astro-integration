import type { RespectifyIntegrationOptions, RespectifyClientConfig, RespectifyMegacallConfig } from './types';

export type ResolvedIntegrationOptions = Required<
  Pick<RespectifyIntegrationOptions, 'configPath' | 'commentsApiPath' | 'showBranding'>
> &
  Pick<RespectifyIntegrationOptions, 'getPostUrl' | 'getPostContent' | 'rateLimit' | 'client' | 'megacall'>;

const defaults: ResolvedIntegrationOptions = {
  configPath: './respectify.config.json',
  commentsApiPath: '/api/respectify/comments',
  showBranding: true,
  getPostUrl: (slug, site) => `${site.replace(/\/$/, '')}/posts/${slug}/`,
  getPostContent: undefined,
  rateLimit: { windowMs: 5 * 60 * 1000, maxRequests: 10 },
  client: undefined,
  megacall: undefined,
};

let options: ResolvedIntegrationOptions = { ...defaults };

export function setIntegrationOptions(userOptions: RespectifyIntegrationOptions = {}): void {
  options = {
    ...defaults,
    ...userOptions,
    getPostUrl: userOptions.getPostUrl ?? defaults.getPostUrl,
    getPostContent: userOptions.getPostContent,
    rateLimit: userOptions.rateLimit ?? defaults.rateLimit,
    client: userOptions.client,
    megacall: userOptions.megacall,
  };
}

export function getIntegrationOptions(): ResolvedIntegrationOptions {
  return options;
}

export type { RespectifyClientConfig, RespectifyMegacallConfig };
