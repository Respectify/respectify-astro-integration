import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createBareAstroProject, packageRoot } from './helpers';
import type { SampleProject } from './helpers';

/**
 * The published package runs the compiled command, because Node will not run TypeScript from
 * inside node_modules. These tests build it the way `npm publish` does and run the result.
 */
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
  bin: Record<string, string>;
  files: string[];
  scripts: Record<string, string>;
};
const binPath = path.join(packageRoot, manifest.bin['respectify-astro'] ?? '');

const projects: SampleProject[] = [];

beforeAll(() => {
  execFileSync('npm', ['run', 'build:cli'], { cwd: packageRoot, stdio: 'pipe' });
}, 60_000);

afterEach(() => {
  for (const project of projects.splice(0)) project.remove();
});

describe('the published command', () => {
  it('is built before packing and shipped in the package', () => {
    expect(manifest.scripts.prepack).toContain('build:cli');
    expect(manifest.files).toContain('dist');
    expect(readFileSync(binPath, 'utf8').startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('sets up a project when run with node', () => {
    const project = createBareAstroProject();
    projects.push(project);

    const run = spawnSync(process.execPath, [binPath, 'init', '--database', 'postgres'], { cwd: project.root, encoding: 'utf8' });

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('Created   src/respectify.runtime.ts');
    expect(project.read('respectify.config.json')).toBe(readFileSync(path.join(packageRoot, 'default-respectify.config.json'), 'utf8'));
  });

  it('exits 1 and asks for --database when it cannot ask', () => {
    const project = createBareAstroProject();
    projects.push(project);

    const run = spawnSync(process.execPath, [binPath, 'init'], { cwd: project.root, encoding: 'utf8' });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('--database postgres');
    expect(project.has('src/respectify.runtime.ts')).toBe(false);
  });
});
