import type { RespectifyIntegrationOptions } from './types';

const defaults: Required<Pick<RespectifyIntegrationOptions, 'configPath' | 'commentsApiPath' | 'showBranding'>> &
  Pick<RespectifyIntegrationOptions, 'getPostUrl' | 'rateLimit'> = {
  configPath: './respectify.config.json',
  commentsApiPath: '/api/respectify/comments',
  showBranding: true,
  getPostUrl: (slug, site) => `${site.replace(/\/$/, '')}/posts/${slug}/`,
  rateLimit: { windowMs: 5 * 60 * 1000, maxRequests: 10 },
};

let options: typeof defaults = { ...defaults };

export function setIntegrationOptions(userOptions: RespectifyIntegrationOptions = {}): void {
  options = {
    ...defaults,
    ...userOptions,
    getPostUrl: userOptions.getPostUrl ?? defaults.getPostUrl,
    rateLimit: userOptions.rateLimit ?? defaults.rateLimit,
  };
}

export function getIntegrationOptions(): typeof defaults {
  return options;
}
