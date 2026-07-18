# @respectify/astro

Respectify-powered commenting for Astro. Drop in AI moderation, spam filtering, and a polished comment UX in minutes.

Respectify does more than just comment moderation — it provides a complete solution for managing and enhancing user-generated content. It monitors for tone, logical fallacies, and spam and educates commenters on how to improve their comments.

Built for production — powers [nickhodges.com](https://nickhodges.com) as a live Respectify demo.

- **NPM:** https://www.npmjs.com/package/@respectify/astro
- **Repository:** https://github.com/Respectify/respectify-astro-integration
- **Product site:** https://respectify.ai

## Features

- **Respectify AI moderation** — spam detection, toxicity scoring, fallacy detection, revision suggestions
- **Works with prerendered pages** — comments load at runtime via API; no rebuild needed
- **One component** — `<CommentSection postSlug="..." />`
- **Powered by Respectify branding** — optional callout and badge for demos
- **Astro DB storage** — Turso/libSQL via `@astrojs/db`
- **Self-contained CSS** — no Tailwind required; customize via CSS variables
- **Fail-closed** — rejects comments when Respectify is unavailable

## Requirements

- Astro 5 or 6 with **`output: 'server'`** (or hybrid) and a server adapter (Vercel, Node, etc.)
- [`@astrojs/db`](https://docs.astro.build/en/guides/astro-db/) configured with Turso for production
- A [Respectify](https://respectify.ai) account (`RESPECTIFY_EMAIL` + `RESPECTIFY_API_KEY`)

> Prefer API-only moderation without Astro DB / comment UI? Use [`@respectify/client`](https://www.npmjs.com/package/@respectify/client) instead. See [Choose your TypeScript path](https://respectify.ai/comment-moderation-api#paths).

## Quick start

### 1. Install

```bash
npm install @respectify/astro @respectify/client @astrojs/db
```

### 2. Add the integration

```ts
// astro.config.ts
import { defineConfig } from 'astro/config';
import db from '@astrojs/db';
import respectify from '@respectify/astro';

export default defineConfig({
  site: 'https://yoursite.com',
  output: 'server',
  adapter: vercel(), // or node, netlify, etc.
  integrations: [
    db(),
    respectify({
      // Optional: customize post URL for Respectify topic context
      getPostUrl: (slug, site) => `${site}/blog/${slug}/`,
    }),
  ],
});
```

### 3. Configure Respectify

Copy a starter config to your project root:

```bash
# Minimal defaults
cp node_modules/@respectify/astro/default-respectify.config.json ./respectify.config.json

# Or the fully commented sample (strip comments — JSON does not allow them)
cp node_modules/@respectify/astro/respectify.config.sample.jsonc ./respectify.config.json
```

See [`respectify.config.sample.jsonc`](./respectify.config.sample.jsonc) for every field and how it maps to `@respectify/client`.

Add environment variables:

```env
RESPECTIFY_EMAIL=you@example.com
RESPECTIFY_API_KEY=your-api-key
ASTRO_DB_REMOTE_URL=libsql://...
ASTRO_DB_APP_TOKEN=...
```

### 4. Add the database table

Copy this into `db/config.ts` (or import from `@respectify/astro/schema` if your setup supports it):

```ts
import { defineDb, defineTable, column, NOW } from 'astro:db';

const Comment = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    postSlug: column.text(),
    author: column.text(),
    email: column.text({ optional: true }),
    content: column.text(),
    createdAt: column.date({ default: NOW }),
    approved: column.boolean({ default: false }),
    parentId: column.number({ optional: true }),
  },
  indexes: [
    { on: ['postSlug'], unique: false },
    { on: ['approved'], unique: false },
  ],
});

export default defineDb({ tables: { Comment } });
```

Or use the exported helper:

```ts
import { defineDb } from 'astro:db';
import { Comment } from '@respectify/astro/schema';

export default defineDb({ tables: { Comment } });
```

Run migrations:

```bash
npx astro db push
```

### 5. Wire up Astro Actions

```ts
// src/actions/index.ts
import { respectifyCommentActions } from '@respectify/astro/actions';

export const server = {
  comments: respectifyCommentActions,
};
```

### 6. Add comments to your layout

```astro
---
import CommentSection from '@respectify/astro/components/CommentSection.astro';
---

<CommentSection postSlug={post.id} />
```

That's it. Comments are moderated by Respectify before they appear.

## Component props

| Prop | Default | Description |
|------|---------|-------------|
| `postSlug` | required | Unique identifier for the page |
| `apiPath` | `/api/respectify/comments` | Comments API path (must match integration) |
| `showBranding` | `true` | Show Powered by Respectify callout |
| `enableDelete` | `false` | Show delete controls when admin is authenticated |
| `class` | — | Extra CSS class on root wrapper |

## Customization

### CSS variables

Override on `.rf-comments`:

```css
.rf-comments {
  --rf-accent: #2bbc89;
  --rf-accent-hover: #24966f;
  --rf-radius: 0.75rem;
}
```

### Integration options

Any `@respectify/client` option can be set via `client` and `megacall`. Values in `astro.config` override the same keys in `respectify.config.json`.

```ts
respectify({
  configPath: './respectify.config.json',
  commentsApiPath: '/api/respectify/comments',
  showBranding: true,
  getPostUrl: (slug, site) => `${site}/posts/${slug}/`,
  rateLimit: { windowMs: 300_000, maxRequests: 10 },

  // Forwarded to RespectifyClient (email/apiKey still default from env)
  client: {
    baseUrl: 'https://app.respectify.ai',
    timeout: 30_000,
    version: '0.2',
    website: 'yoursite.com',
  },

  // Forwarded to every megacall (comment + articleId are set automatically)
  megacall: {
    includeSpam: true,
    includeCommentScore: true,
    includeRelevance: true,
    includeDogwhistle: true,
    bannedTopics: ['spam-topics'],
    sensitiveTopics: [],
    dogwhistleExamples: [],
  },
});
```

### `respectify.config.json`

Moderation policy lives in the JSON file. You can also put `client` / `megacall` there (same shapes as above). Integration options win on conflicts.

For a field-by-field walkthrough with comments, see [`respectify.config.sample.jsonc`](./respectify.config.sample.jsonc).

Replies automatically pass the parent comment text as `replyToComment` to Respectify.

### Admin delete (optional)

Set `enableDelete` on `CommentSection` and implement auth so `context.locals.isAuthenticated` is true. See the [Nick-Blog](https://github.com/NickHodges/Nick-Blog) repo for a full admin auth example.

## How it works

```text
Visitor submits comment
  → Astro Action (comments.submit)
  → Respectify megacall (configured checks: spam, score, relevance, dogwhistle, …)
  → If approved: save to Astro DB
  → Client refreshes comment list via GET /api/respectify/comments
```

Post pages can stay `prerender = true`. Only the API route and actions need server runtime.

## License

MIT
