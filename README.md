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
- **Your database** — Postgres or SQLite/libSQL (Turso) through your own [Drizzle](https://orm.drizzle.team) connection, or any store you write against `ICommentStore`
- **Never touches your schema** — the package ships table definitions and drizzle-kit migrations; you decide when they run
- **Self-contained CSS** — no Tailwind required; customize via CSS variables
- **Fail-closed** — rejects comments when Respectify is unavailable

## Requirements

- Astro 5, 6 or 7 with **`output: 'server'`** (or hybrid) and a server adapter (Vercel, Node, etc.)
- A database you reach through Drizzle ORM (`drizzle-orm` 0.45): Postgres (node-postgres, postgres.js, Neon, PGlite, …) or SQLite (libSQL/Turso, better-sqlite3, Cloudflare D1, …)
- A [Respectify](https://respectify.ai) account (`RESPECTIFY_EMAIL` + `RESPECTIFY_API_KEY`)

> Upgrading from 0.x, which stored comments through Astro DB? See [Migrating from 0.x (Astro DB)](#migrating-from-0x-astro-db).
>
> Prefer API-only moderation without a comment UI or database? Use [`@respectify/astro-moderation`](https://www.npmjs.com/package/@respectify/astro-moderation) or [`@respectify/client`](https://www.npmjs.com/package/@respectify/client).

## Quick start

### 1. Install

Install the package, Drizzle, and the driver for your database. For Postgres with node-postgres:

```bash
npm install @respectify/astro @respectify/client drizzle-orm pg
npm install -D drizzle-kit @types/pg
```

For libSQL/Turso, install `@libsql/client` instead of `pg`. The package never installs a driver itself: `pg` and `@libsql/client` are optional peer dependencies, so you only get the one you use.

### 2. Add the comment table and migrate

Add the table to your Drizzle schema:

```ts
// src/db/schema.ts
export { respectifyComments } from '@respectify/astro/postgres'; // or '@respectify/astro/sqlite'
```

Then generate and run the migration with drizzle-kit, the way you migrate the rest of your schema:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

The tables are named `respectify_comment` (Postgres) and `Comment` (SQLite). For another name, use `createPostgresCommentTable('my_comments')` or `createSqliteCommentTable('my_comments')` and pass the table to the store. If you manage your schema some other way, the SQL drizzle-kit generates for the default tables is in [`migrations/postgres`](./migrations/postgres) and [`migrations/sqlite`](./migrations/sqlite).

The integration never creates, alters or migrates a table.

### 3. Write the runtime module

The store, and any functions, live in a module that runs inside your server bundle, so they use the connection your site already has:

```ts
// src/respectify.runtime.ts
import { defineRespectifyRuntime } from '@respectify/astro';
import { createPostgresCommentStore } from '@respectify/astro/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { DATABASE_URL } from 'astro:env/server';

const db = drizzle({ client: new Pool({ connectionString: DATABASE_URL }) });

export default defineRespectifyRuntime({
  store: createPostgresCommentStore(db),
  // Optional: the canonical URL Respectify reads a post from for topic context
  getPostUrl: (slug, site) => `${site}/blog/${slug}/`,
});
```

For SQLite, use `createSqliteCommentStore(db)` from `@respectify/astro/sqlite` with your Drizzle SQLite database (for libSQL/Turso, `drizzle({ client: createClient({ url, authToken }) })` from `drizzle-orm/libsql`).

### 4. Add the integration

```ts
// astro.config.ts
import { defineConfig, envField } from 'astro/config';
import respectify from '@respectify/astro';

export default defineConfig({
  site: 'https://yoursite.com',
  output: 'server',
  adapter: vercel(), // or node, netlify, etc.
  env: {
    schema: {
      DATABASE_URL: envField.string({ context: 'server', access: 'secret' }),
    },
  },
  integrations: [
    respectify({
      runtime: './src/respectify.runtime.ts',
    }),
  ],
});
```

### 5. Configure Respectify

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
DATABASE_URL=postgres://...
```

### 6. Wire up Astro Actions

```ts
// src/actions/index.ts
import { respectifyCommentActions } from '@respectify/astro/actions';

export const server = {
  comments: respectifyCommentActions,
};
```

### 7. Add comments to your layout

```astro
---
import CommentSection from '@respectify/astro/components/CommentSection.astro';
---

<CommentSection postSlug={post.id} />
```

That's it. Comments are moderated by Respectify before they appear.

## Storage

The actions, the comments API route and the moderation service depend only on the `ICommentStore` interface:

```ts
interface ICommentStore {
  findById(id: number): Promise<CommentRecord | undefined>;
  listApproved(postSlug: string): Promise<PublicComment[]>; // oldest first, ties by id
  create(input: NewComment): Promise<CommentRecord>; // validates with newCommentSchema
  delete(id: number): Promise<boolean>; // replies are kept, with parentId null
}
```

| Store | Import | Works with |
| --- | --- | --- |
| `createPostgresCommentStore(db, { table? })` | `@respectify/astro/postgres` | Any Drizzle Postgres database: node-postgres, postgres.js, Neon, PGlite, … |
| `createSqliteCommentStore(db, { table? })` | `@respectify/astro/sqlite` | Any Drizzle SQLite database: libSQL/Turso, better-sqlite3, Cloudflare D1, … |

Both take your Drizzle database instance and never open a connection of their own.

### Writing your own store

Implement `ICommentStore` (types from `@respectify/astro`) and run the shared contract suite, which every built-in store passes, against it with Vitest:

```ts
// test/my-comment-store.test.ts
import { describeCommentStoreContract } from '@respectify/astro/testing';

describeCommentStoreContract('my store', async () => ({
  store: createMyCommentStore(await createEmptyTestDatabase()),
  dispose: () => closeTestDatabase(),
}));
```

The factory must return a store on a new, empty table each time.

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

`respectify()` takes only values that can be serialized, because Astro runs `astro.config` apart from your server bundle. Functions go in the runtime module. Any `@respectify/client` option can be set via `client` and `megacall`. Values in `astro.config` override the same keys in `respectify.config.json`.

```ts
respectify({
  // Required: the module whose default export is defineRespectifyRuntime({ store, ... })
  runtime: './src/respectify.runtime.ts',

  configPath: './respectify.config.json',
  commentsApiPath: '/api/respectify/comments',
  showBranding: true,

  // Per-IP submission limit, enforced in the `comments.submit` action.
  // In-memory per server process — not shared across multiple instances/regions.
  rateLimit: { windowMs: 300_000, maxRequests: 10 },

  // Forwarded to RespectifyClient. Credentials are not accepted here, since these options are
  // written into the server bundle: use RESPECTIFY_EMAIL / RESPECTIFY_API_KEY
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

  // Comment-health tolerances sent with every megacall, merged per item over the
  // JSON config's `tolerances` (these win). See "Comment health and tolerances" below.
  tolerances: { insult: 'relaxed', threat: 'zero_tolerance', quality: 'strict' },
});
```

The runtime module takes the store and the two optional post functions:

```ts
export default defineRespectifyRuntime({
  store,
  // The canonical URL for a post, used to initialize Respectify topics (default: `${site}/posts/${slug}/`)
  getPostUrl: (slug, site) => `${site}/posts/${slug}/`,
  // Alternative to getPostUrl: hand Respectify the post body directly instead of having it
  // fetch getPostUrl. Useful for staged/preview/auth-gated content, or when the URL isn't
  // live yet right after deploy. Takes priority over getPostUrl.
  getPostContent: async (slug) => loadPostBody(slug),
});
```

`showBranding` and `commentsApiPath` set here become the defaults for `<CommentSection>` — you can still override either per-instance via props.

### Checking Respectify credentials

```ts
import { verifyRespectifyCredentials } from '@respectify/astro/credentials';

const isConnected = await verifyRespectifyCredentials();
```

Useful for an admin health-check page — returns `true` when `RESPECTIFY_EMAIL`/`RESPECTIFY_API_KEY` (or `client.email`/`client.apiKey` in `respectify.config.json`) are valid and the subscription is active.

### `respectify.config.json`

Moderation policy lives in the JSON file. You can also put `client` / `megacall` there (same shapes as above). Integration options win on conflicts.

For a field-by-field walkthrough with comments, see [`respectify.config.sample.jsonc`](./respectify.config.sample.jsonc).

Replies automatically pass the parent comment text as `replyToComment` to Respectify.

### Comment health and tolerances

Comment health has ten items: the nine problem categories and `quality`. `tolerances` (in `respectify.config.json` or the integration options) sets a level per item; items not named are `standard`. Nothing is stored on the API key.

```json
{
  "tolerances": { "insult": "relaxed", "profanity": "off", "threat": "zero_tolerance", "quality": "strict" }
}
```

- Items: `threat`, `identity_attack`, `sexual_content`, `harassment`, `insult`, `profanity`, `dismissive_tone`, `logical_fallacy`, `low_effort`, `quality`
- Levels, loosest to strictest: `off`, `permissive`, `relaxed`, `standard` (default), `strict`, `zero_tolerance`
- A problem category fails on its worst finding (severity 1 minor, 2 clear, 3 severe, 4 extreme): `permissive` filters only the very worst, failing extreme findings alone; `relaxed` fails severe and extreme findings; `standard` fails clear, severe and extreme ones; `strict` and `zero_tolerance` fail any. `quality` sets the lowest 1-5 quality score accepted: `permissive` and `relaxed` 2, `standard` 3, `strict` 4, `zero_tolerance` 5. `off` leaves the item out of comment health.
- `threat`, `identity_attack`, `sexual_content` and `harassment` are floored: they can be made stricter but never `permissive`, `relaxed` or `off`. The config fails to load if you try (and the integration throws at setup for the `tolerances` option).

Tolerances shape the comment score, so they are only sent when a comment score runs (which needs topic context). When the API returns them, the analysis result carries `healthScore` (1.0-5.0) and `healthItems` (per item: `score`, `minimum`, `is_acceptable`).

### How comments are approved, warned or blocked

Spam, off-topic (`blockOffTopic`) and dogwhistle (`blockDogwhistles`) rejections come first. Suspected spam is not spam: the comment is sent back to the commenter (never approved, even with `allowOverride`) with the server's suggestion as `feedback`, such as "This looks like spam. How about removing the link?", while any comment-health coaching stays in `suggestion`. The analysis result carries `suspectedSpam` and `spamSuggestion` (and `isSpam: false`) whenever a spam check ran; `suspectedSpam` is `false` when an older API omits it, and the `comments.submit` action returns `suspectedSpam` for a comment it did not publish. Then, on content:

| Comment score says | Respectfulness (`1 - toxicity_score`) | Result |
| --- | --- | --- |
| `exceeds_tolerance: false` | any | Approved (`feedback.approved`) |
| `exceeds_tolerance: true` | `< thresholds.block` and `blockDisrespectful` | Blocked (`feedback.blocked`) |
| `exceeds_tolerance: true` | otherwise | Warning (`feedback.warning`), approved only when `allowOverride` |
| no comment score | — | Approved |

`exceeds_tolerance` decides whether a comment has a problem at all, because it reflects your site's comment-health tolerances (any item below its minimum, or severe toxicity); `toxicity_score` does not, so it only chooses between warning and blocking. `thresholds.autoApprove` applies only when the API returns a comment score without `exceeds_tolerance` (an API older than tolerances), where the previous bands are used. The returned `exceedsTolerance` field carries the verdict.

### Admin delete (optional)

Set `enableDelete` on `CommentSection` and implement auth so `context.locals.isAuthenticated` is true. See the [Nick-Blog](https://github.com/NickHodges/Nick-Blog) repo for a full admin auth example.

## How it works

```text
Visitor submits comment
  → Astro Action (comments.submit)
  → Respectify megacall (configured checks: spam, score, relevance, dogwhistle, …)
  → If approved: store.create() saves it through your ICommentStore
  → Client refreshes comment list via GET /api/respectify/comments (store.listApproved())
```

Post pages can stay `prerender = true`. Only the API route and actions need server runtime.

## Migrating from 0.x (Astro DB)

1.0 removes Astro DB, which Astro deprecated in 6.4 and removed in 7.0, so it is a breaking release. What changes:

| 0.x | 1.0 |
| --- | --- |
| `@astrojs/db` peer dependency, `db()` integration, `db/config.ts` | Your own Drizzle database, passed to a store in a runtime module |
| `@respectify/astro/schema` | `@respectify/astro/sqlite` or `@respectify/astro/postgres` (`respectifyComments`) |
| `getPostUrl` / `getPostContent` in `respectify({...})` | In `defineRespectifyRuntime({...})`; passing them to `respectify()` now fails at startup |
| `astro db push`, `astro build --remote` | drizzle-kit (or your own migrations); plain `astro build` |
| `ASTRO_DB_REMOTE_URL`, `ASTRO_DB_APP_TOKEN` | Your own variables, declared with `astro:env` |
| `client.email` / `client.apiKey` in `respectify({...})` | `RESPECTIFY_EMAIL` / `RESPECTIFY_API_KEY` (or `respectify.config.json`); in `astro.config` they now fail at startup |
| `comments.delete` of a missing comment succeeded | Fails with `NOT_FOUND`; a reply to a missing comment, or one on another post, fails with `BAD_REQUEST` |
| Comments API returns `id, author, content, createdAt` | Adds `parentId` |

0.x also lost every `respectify()` option at runtime in production builds (they were kept in module state that never reached the server bundle), so `getPostUrl`, `tolerances`, `rateLimit`, `client` and `megacall` silently fell back to their defaults. 1.0 passes them to the server bundle through a virtual module. If you had set them, review them: they now take effect.

### Keep your Turso database (no data to move)

The SQLite store's default table is exactly the `Comment` table Astro DB created (same columns, defaults, index names and date format), so your existing comments are used as they are.

1. `npm uninstall @astrojs/db` and `npm install drizzle-orm @libsql/client`.
2. Remove `db()` from `astro.config` and delete `db/config.ts`. Drop `--remote` from your build script.
3. Declare the Turso URL and token in `astro.config`'s `env.schema` (they can keep their names), and write the runtime module:

   ```ts
   // src/respectify.runtime.ts
   import { defineRespectifyRuntime } from '@respectify/astro';
   import { createSqliteCommentStore } from '@respectify/astro/sqlite';
   import { createClient } from '@libsql/client';
   import { drizzle } from 'drizzle-orm/libsql';
   import { ASTRO_DB_REMOTE_URL, ASTRO_DB_APP_TOKEN } from 'astro:env/server';

   const db = drizzle({ client: createClient({ url: ASTRO_DB_REMOTE_URL, authToken: ASTRO_DB_APP_TOKEN }) });

   export default defineRespectifyRuntime({ store: createSqliteCommentStore(db) });
   ```

4. Change `respectify({ ... })` to `respectify({ runtime: './src/respectify.runtime.ts', ... })`, moving any `getPostUrl` / `getPostContent` into the runtime module.

Do **not** run the reference migration in `migrations/sqlite` against this database: the table already exists. If you manage the rest of the database with drizzle-kit, take the table in with `drizzle-kit pull` first, or mark the migration as applied. drizzle-kit marks the `id` column `NOT NULL` where Astro DB did not; for an `INTEGER PRIMARY KEY` in SQLite that makes no difference, so there is nothing to change.

### Move your comments to Postgres

1. Create the table in Postgres: add `respectifyComments` from `@respectify/astro/postgres` to your Drizzle schema and run drizzle-kit (or apply [`migrations/postgres`](./migrations/postgres)).
2. Copy the rows from Turso with Drizzle, reading through `respectifyComments` from `@respectify/astro/sqlite` (which reads Astro DB's text dates as UTC) and inserting through the Postgres table, keeping `id`, `parentId`, `approved` and `createdAt`. Insert in one transaction, parents before replies (order by `id`), and set any `parentId` whose parent no longer exists to null, since the Postgres table has a foreign key.
3. Explicit ids leave the identity sequence at 1, so set it after the highest id copied: `select setval(pg_get_serial_sequence('respectify_comment', 'id'), <max id>, true)`.
4. Read the rows back and compare them field by field before switching the site over.
5. Point the runtime module at `createPostgresCommentStore(db)`, then remove `@astrojs/db` as above.

Run the copy as a dry run first, and have it check the target host and database before it writes.

## License

MIT
