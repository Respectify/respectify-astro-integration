# @respectify/astro

Official Respectify integration for Astro.

## Installation

```bash
npm install @respectify/astro
```

## Usage

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import respectify from "@respectify/astro";

export default defineConfig({
  integrations: [
    respectify({
      mode: "perspective-compatible"
    })
  ]
});
```

## Options

- `mode`: `"perspective-compatible"` or `"full-moderation"` (default: `"perspective-compatible"`)
- `publicKey`: optional public key string exposed through Vite define

## Links

- NPM: https://www.npmjs.com/package/@respectify/astro
- Repository: https://github.com/Respectify/respectify-astro-integration
