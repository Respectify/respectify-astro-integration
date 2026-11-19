import { afterEach, describe, expect, it } from 'vitest';
import { InitError, runInit } from '../../src/cli/init';
import { NodeProjectFiles } from '../../src/cli/project-files';
import type { InitOptions, InitResult, InitStepStatus } from '../../src/cli/types';
import { FakePrompter, createBareAstroProject, createSampleProject, defaultConfigJson } from './helpers';
import type { SampleProject } from './helpers';

const projects: SampleProject[] = [];

function track(project: SampleProject): SampleProject {
  projects.push(project);
  return project;
}

afterEach(() => {
  for (const project of projects.splice(0)) project.remove();
});

function init(project: SampleProject, options: InitOptions = {}, prompter = new FakePrompter()): Promise<InitResult> {
  return runInit(options, { files: new NodeProjectFiles(project.root), prompter, defaultConfigJson });
}

function statusOf(result: InitResult, path: string): InitStepStatus | undefined {
  return result.steps.find((step) => step.path === path)?.status;
}

describe('init in a project with nothing set up', () => {
  it('writes the runtime module, config, actions, schema and drizzle config for Postgres', async () => {
    const project = track(createBareAstroProject());

    const result = await init(project, { database: 'postgres' });

    expect(result.steps.map((step) => [step.status, step.path])).toEqual([
      ['created', 'src/respectify.runtime.ts'],
      ['created', 'respectify.config.json'],
      ['created', 'src/actions/index.ts'],
      ['created', 'src/db/schema.ts'],
      ['created', 'drizzle.config.ts'],
    ]);
    expect(project.read('src/respectify.runtime.ts')).toContain("createPostgresCommentStore } from '@respectify/astro/postgres'");
    expect(project.read('src/respectify.runtime.ts')).toContain("from 'drizzle-orm/node-postgres'");
    expect(project.read('src/db/schema.ts')).toContain("export { respectifyComments } from '@respectify/astro/postgres';");
    expect(project.read('drizzle.config.ts')).toContain("dialect: 'postgresql'");
    expect(project.read('drizzle.config.ts')).toContain("schema: './src/db/schema.ts'");
    expect(project.read('src/actions/index.ts')).toContain('comments: respectifyCommentActions');
    expect(project.read('respectify.config.json')).toBe(defaultConfigJson);
  });

  it('writes the libSQL versions for SQLite', async () => {
    const project = track(createBareAstroProject());

    await init(project, { database: 'sqlite' });

    expect(project.read('src/respectify.runtime.ts')).toContain("createSqliteCommentStore } from '@respectify/astro/sqlite'");
    expect(project.read('src/respectify.runtime.ts')).toContain("from 'drizzle-orm/libsql'");
    expect(project.read('src/db/schema.ts')).toContain("export { respectifyComments } from '@respectify/astro/sqlite';");
    expect(project.read('drizzle.config.ts')).toContain("dialect: 'turso'");
  });

  it('treats an empty database token as none, because drizzle-kit and a local file reject an empty one', async () => {
    const project = track(createBareAstroProject());

    await init(project, { database: 'sqlite' });

    expect(project.read('drizzle.config.ts')).toContain('authToken: process.env.DATABASE_AUTH_TOKEN || undefined');
    expect(project.read('src/respectify.runtime.ts')).toContain("getSecret('DATABASE_AUTH_TOKEN') || undefined");
  });

  it('lists what is left: packages, the integration, an adapter, environment variables, the migration and the component', async () => {
    const project = track(createBareAstroProject());

    const { nextSteps } = await init(project, { database: 'postgres' });

    expect(nextSteps).toHaveLength(6);
    expect(nextSteps[0]).toContain('npm install @respectify/client drizzle-orm pg');
    expect(nextSteps[0]).toContain('npm install -D drizzle-kit @types/pg');
    expect(nextSteps[1]).toContain('npx astro add @respectify/astro');
    expect(nextSteps[2]).toContain('npx astro add node');
    expect(nextSteps[3]).toContain('RESPECTIFY_API_KEY=');
    expect(nextSteps[3]).toContain('DATABASE_URL=');
    expect(nextSteps[4]).toContain('npx drizzle-kit migrate');
    expect(nextSteps[5]).toContain('<CommentSection postSlug={post.id} />');
  });
});

describe('init never overwrites what is already there', () => {
  it('leaves every existing file byte for byte and reports it as unchanged', async () => {
    const existing = {
      'src/respectify.runtime.ts': '// my runtime\n',
      'respectify.config.json': '{ "enabled": false }\n',
      'src/actions/index.ts': "import { respectifyCommentActions } from '@respectify/astro/actions';\nexport const server = { comments: respectifyCommentActions };\n",
      'src/db/schema.ts': "export { respectifyComments } from '@respectify/astro/postgres';\n",
      'drizzle.config.ts': "export default { dialect: 'postgresql', schema: './src/db/schema.ts' };\n",
    };
    const project = track(createBareAstroProject(existing));

    const result = await init(project);

    expect(result.steps.every((step) => step.status === 'unchanged')).toBe(true);
    for (const [path, content] of Object.entries(existing)) {
      expect(project.read(path)).toBe(content);
    }
  });

  it('running it twice changes nothing the second time', async () => {
    const project = track(createBareAstroProject());
    await init(project, { database: 'sqlite' });
    const firstRun = Object.fromEntries(
      ['src/respectify.runtime.ts', 'src/db/schema.ts', 'drizzle.config.ts', 'src/actions/index.ts'].map((path) => [path, project.read(path)]),
    );

    const second = await init(project);

    expect(second.database).toBe('sqlite');
    expect(second.steps.every((step) => step.status === 'unchanged')).toBe(true);
    for (const [path, content] of Object.entries(firstRun)) {
      expect(project.read(path)).toBe(content);
    }
  });

  it('gives the lines to add when the site already has actions, without touching the file', async () => {
    const actions = "export const server = { newsletter: {} };\n";
    const project = track(createBareAstroProject({ 'src/actions/index.ts': actions }));

    const result = await init(project, { database: 'postgres' });

    const step = result.steps.find((candidate) => candidate.path === 'src/actions/index.ts');
    expect(step?.status).toBe('manual');
    expect(step?.instructions).toContain('comments: respectifyCommentActions');
    expect(project.read('src/actions/index.ts')).toBe(actions);
  });

  it('recognises actions kept in src/actions.ts', async () => {
    const project = track(createBareAstroProject({ 'src/actions.ts': 'export const server = {};\n' }));

    const result = await init(project, { database: 'postgres' });

    expect(statusOf(result, 'src/actions.ts')).toBe('manual');
    expect(project.has('src/actions/index.ts')).toBe(false);
  });
});

describe('init in a project that already uses Drizzle', () => {
  it('takes the database from drizzle.config and adds the table to the schema it names', async () => {
    const project = track(
      createBareAstroProject({
        'drizzle.config.ts': "import { defineConfig } from 'drizzle-kit';\nexport default defineConfig({ dialect: \"turso\", schema: './db/tables.ts', out: './migrations' });\n",
        'db/tables.ts': "export const posts = 'posts';",
      }),
    );
    const prompter = new FakePrompter('postgres');

    const result = await init(project, {}, prompter);

    expect(result.database).toBe('sqlite');
    expect(prompter.questions).toEqual([]);
    expect(statusOf(result, 'db/tables.ts')).toBe('updated');
    expect(project.read('db/tables.ts')).toBe(
      "export const posts = 'posts';\nexport { respectifyComments } from '@respectify/astro/sqlite';\n",
    );
    expect(project.has('src/db/schema.ts')).toBe(false);
    expect(statusOf(result, 'drizzle.config.ts')).toBeUndefined();
  });

  it('gives the line to add when the schema is a folder or a glob', async () => {
    const config = "export default { dialect: 'postgresql', schema: './src/db/schema/*' };\n";
    const project = track(createBareAstroProject({ 'drizzle.config.ts': config }));

    const result = await init(project);

    const step = result.steps.find((candidate) => candidate.path === 'drizzle.config.ts');
    expect(step?.status).toBe('manual');
    expect(step?.instructions).toContain("export { respectifyComments } from '@respectify/astro/postgres';");
    expect(project.read('drizzle.config.ts')).toBe(config);
  });

  it('does not add the table to a schema for a different database', async () => {
    const schema = "export const posts = 'posts';\n";
    const project = track(
      createBareAstroProject({
        'drizzle.config.ts': "export default { dialect: 'mysql', schema: './src/db/schema.ts' };\n",
        'src/db/schema.ts': schema,
      }),
    );

    const result = await init(project, { database: 'postgres' });

    const step = result.steps.find((candidate) => candidate.path === 'drizzle.config.ts');
    expect(step?.status).toBe('manual');
    expect(step?.instructions).toContain('"mysql"');
    expect(project.read('src/db/schema.ts')).toBe(schema);
  });

  it('gives the line to add, and writes no schema, when the schema is outside the project', async () => {
    const project = track(
      createBareAstroProject({
        'drizzle.config.ts': "export default { dialect: 'postgresql', schema: '../outside/schema.ts' };\n",
      }),
    );

    const result = await init(project);

    expect(statusOf(result, 'drizzle.config.ts')).toBe('manual');
    expect(result.steps.some((step) => step.path.includes('outside'))).toBe(false);
  });
});

describe('choosing the database', () => {
  it('asks when nothing says which, and uses the answer', async () => {
    const project = track(createBareAstroProject());
    const prompter = new FakePrompter('sqlite');

    const result = await init(project, {}, prompter);

    expect(prompter.questions).toHaveLength(1);
    expect(result.database).toBe('sqlite');
  });

  it('fails with the flag to use when there is no terminal to ask on, writing nothing', async () => {
    const project = track(createBareAstroProject());

    await expect(init(project)).rejects.toThrow(InitError);
    await expect(init(project)).rejects.toThrow('--database postgres');
    expect(project.has('src/respectify.runtime.ts')).toBe(false);
    expect(project.has('respectify.config.json')).toBe(false);
  });
});

describe('what is left to do depends on the project', () => {
  it('skips the steps already done and uses the project package manager', async () => {
    const project = track(
      createSampleProject({
        'package.json': JSON.stringify({
          dependencies: { astro: '^7.0.0', '@respectify/astro': '^1.2.0', '@respectify/client': '^0.8.0', 'drizzle-orm': '^0.45.0', pg: '^8.0.0' },
          devDependencies: { 'drizzle-kit': '^0.31.0', '@types/pg': '^8.0.0' },
        }),
        'pnpm-lock.yaml': '',
        'astro.config.ts':
          "import respectify from '@respectify/astro';\nimport node from '@astrojs/node';\nexport default { adapter: node({ mode: 'standalone' }), integrations: [respectify()] };\n",
      }),
    );

    const { nextSteps } = await init(project, { database: 'postgres' });

    expect(nextSteps).toHaveLength(3);
    expect(nextSteps.join('\n')).not.toContain('astro add');
    expect(nextSteps.join('\n')).not.toContain('pnpm add');
    expect(nextSteps[1]).toContain('pnpm exec drizzle-kit migrate');
  });

  it('names only the packages that are missing', async () => {
    const project = track(
      createSampleProject({
        'package.json': JSON.stringify({ dependencies: { astro: '^6.0.0', 'drizzle-orm': '^0.45.0', '@libsql/client': '^0.18.0' } }),
        'astro.config.mjs': 'export default {};\n',
      }),
    );

    const { nextSteps } = await init(project, { database: 'sqlite' });

    expect(nextSteps[0]).toContain('npm install @respectify/client\n');
    expect(nextSteps[0]).toContain('npm install -D drizzle-kit');
  });
});

describe('init outside an Astro project', () => {
  it('says so and writes nothing', async () => {
    const project = track(createSampleProject({ 'package.json': '{}' }));

    await expect(init(project, { database: 'postgres' })).rejects.toThrow('root folder of an Astro project');
    expect(project.has('respectify.config.json')).toBe(false);
  });

  it('reports a package.json that cannot be read, writing nothing', async () => {
    const project = track(createSampleProject({ 'package.json': '{ not json', 'astro.config.mjs': 'export default {};\n' }));

    await expect(init(project, { database: 'postgres' })).rejects.toThrow('Could not read package.json');
    expect(project.has('src/respectify.runtime.ts')).toBe(false);
  });
});
