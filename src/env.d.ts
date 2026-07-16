/// <reference types="astro/client" />

import '@astrojs/db';

declare global {
  namespace App {
    interface Locals {
      isAuthenticated?: boolean;
    }
  }
}

declare module 'astro:env/server' {
  export const RESPECTIFY_EMAIL: string | undefined;
  export const RESPECTIFY_API_KEY: string | undefined;
}

declare module 'astro:db' {
  export const Comment: import('@astrojs/db/runtime').Table<
    'Comment',
    typeof import('./schema').RespectifyComment.columns
  >;
}
