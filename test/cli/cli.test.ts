import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/cli';
import { NodeProjectFiles } from '../../src/cli/project-files';
import { FakePrompter, RecordingLogger, createBareAstroProject, createSampleProject, defaultConfigJson } from './helpers';
import type { SampleProject } from './helpers';

const projects: SampleProject[] = [];

function track(project: SampleProject): SampleProject {
  projects.push(project);
  return project;
}

afterEach(() => {
  for (const project of projects.splice(0)) project.remove();
});

async function run(argv: string[], prompter = new FakePrompter()): Promise<{ exitCode: number; logger: RecordingLogger }> {
  const logger = new RecordingLogger();
  const exitCode = await runCli(argv, {
    logger,
    prompter,
    openProject: (folder) => new NodeProjectFiles(folder),
    defaultConfigJson,
  });
  return { exitCode, logger };
}

describe('respectify-astro init', () => {
  it('sets the project up and reports each file and the numbered steps left', async () => {
    const project = track(createBareAstroProject());

    const { exitCode, logger } = await run(['init', '--database', 'postgres', '--cwd', project.root]);

    expect(exitCode).toBe(0);
    expect(logger.errors).toEqual([]);
    expect(project.has('src/respectify.runtime.ts')).toBe(true);
    expect(logger.output).toContain('Created   src/respectify.runtime.ts');
    expect(logger.output).toContain('Created   drizzle.config.ts');
    expect(logger.output).toContain('1. Install the database packages');
    expect(logger.output).toContain('6. Put comments on a page');
  });

  it('lists hand edits before the other remaining steps', async () => {
    const project = track(createBareAstroProject({ 'src/actions/index.ts': 'export const server = {};\n' }));

    const { logger } = await run(['init', '--database', 'sqlite', '--cwd', project.root]);

    expect(logger.output).toContain('By hand   src/actions/index.ts');
    expect(logger.output).toContain('1. Add the comment actions to your existing actions');
  });

  it('marks files it left alone', async () => {
    const project = track(createBareAstroProject({ 'respectify.config.json': '{}' }));

    const { logger } = await run(['init', '--database', 'postgres', '--cwd', project.root]);

    expect(logger.output).toContain('Kept      respectify.config.json (already there)');
  });

  it('exits 1 with the reason outside an Astro project', async () => {
    const project = track(createSampleProject({}));

    const { exitCode, logger } = await run(['init', '--database', 'postgres', '--cwd', project.root]);

    expect(exitCode).toBe(1);
    expect(logger.errors.join('\n')).toContain('root folder of an Astro project');
  });
});

describe('respectify-astro arguments', () => {
  it('prints usage and exits 0 for --help', async () => {
    const { exitCode, logger } = await run(['--help']);

    expect(exitCode).toBe(0);
    expect(logger.output).toContain('Usage: npx @respectify/astro init');
  });

  it('prints usage and exits 1 with no command', async () => {
    const { exitCode, logger } = await run([]);

    expect(exitCode).toBe(1);
    expect(logger.output).toContain('Usage: npx @respectify/astro init');
  });

  it('rejects an unknown command', async () => {
    const { exitCode, logger } = await run(['deploy']);

    expect(exitCode).toBe(1);
    expect(logger.errors.join('\n')).toContain('The only command is "init"');
  });

  it('rejects a database it cannot scaffold, writing nothing', async () => {
    const project = track(createBareAstroProject());

    const { exitCode, logger } = await run(['init', '--database', 'mysql', '--cwd', project.root]);

    expect(exitCode).toBe(1);
    expect(logger.errors.join('\n')).toContain('--database must be one of: postgres, sqlite');
    expect(project.has('respectify.config.json')).toBe(false);
  });

  it('rejects an unknown option', async () => {
    const { exitCode, logger } = await run(['init', '--force']);

    expect(exitCode).toBe(1);
    expect(logger.errors.join('\n')).toContain('--force');
  });
});
