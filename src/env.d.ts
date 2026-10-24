/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    isAuthenticated?: boolean;
  }
}

declare module 'astro:env/server' {
  export const RESPECTIFY_EMAIL: string | undefined;
  export const RESPECTIFY_API_KEY: string | undefined;
}

declare module 'virtual:@respectify/astro/options' {
  const options: import('./types').ResolvedIntegrationOptions;
  export default options;
}

declare module 'virtual:@respectify/astro/runtime' {
  const runtime: import('./types').RespectifyRuntime;
  export default runtime;
}
