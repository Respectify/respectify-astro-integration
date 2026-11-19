import { afterEach, describe, expect, it } from 'vitest';
import { NodeProjectFiles } from '../../src/cli/project-files';
import { createSampleProject } from './helpers';
import type { SampleProject } from './helpers';

const projects: SampleProject[] = [];

function sampleProject(files: Record<string, string>): SampleProject {
  const project = createSampleProject(files);
  projects.push(project);
  return project;
}

afterEach(() => {
  for (const project of projects.splice(0)) project.remove();
});

describe('NodeProjectFiles', () => {
  it('creates a file and the folders above it', () => {
    const project = sampleProject({});

    new NodeProjectFiles(project.root).create('src/db/schema.ts', 'export {};\n');

    expect(project.read('src/db/schema.ts')).toBe('export {};\n');
  });

  it('refuses to create a file that exists, leaving it as it was', () => {
    const project = sampleProject({ 'respectify.config.json': 'mine' });

    expect(() => new NodeProjectFiles(project.root).create('respectify.config.json', 'theirs')).toThrow('EEXIST');
    expect(project.read('respectify.config.json')).toBe('mine');
  });

  it('refuses to read, create or append outside the project', () => {
    const project = sampleProject({});
    const files = new NodeProjectFiles(project.root);

    expect(files.exists('../elsewhere.ts')).toBe(false);
    expect(() => files.read('../elsewhere.ts')).toThrow('outside the project folder');
    expect(() => files.create('../elsewhere.ts', '')).toThrow('outside the project folder');
    expect(() => files.append('/etc/hosts', '')).toThrow('outside the project folder');
  });

  it('does not count a folder as a file', () => {
    const project = sampleProject({ 'src/actions/index.ts': '' });

    expect(new NodeProjectFiles(project.root).exists('src/actions')).toBe(false);
  });
});
