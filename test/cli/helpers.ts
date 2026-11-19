import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ICliLogger, IPrompter, PromptChoice } from '../../src/cli/types';

export const packageRoot = fileURLToPath(new URL('../..', import.meta.url));

export const defaultConfigJson = readFileSync(path.join(packageRoot, 'default-respectify.config.json'), 'utf8');

/** A throwaway project folder on disk. */
export interface SampleProject {
  root: string;
  write(relativePath: string, content: string): void;
  read(relativePath: string): string;
  has(relativePath: string): boolean;
  remove(): void;
}

export const BARE_ASTRO_CONFIG = `import { defineConfig } from 'astro/config';

export default defineConfig({});
`;

/** Create a project folder holding the given files. */
export function createSampleProject(files: Record<string, string>): SampleProject {
  const root = mkdtempSync(path.join(tmpdir(), 'respectify-init-'));
  const project: SampleProject = {
    root,
    write: (relativePath, content) => {
      const target = path.join(root, relativePath);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    },
    read: (relativePath) => readFileSync(path.join(root, relativePath), 'utf8'),
    has: (relativePath) => existsSync(path.join(root, relativePath)),
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
  for (const [relativePath, content] of Object.entries(files)) project.write(relativePath, content);
  return project;
}

/** An Astro project with nothing set up: a package.json and an empty astro.config. */
export function createBareAstroProject(extraFiles: Record<string, string> = {}): SampleProject {
  return createSampleProject({
    'package.json': JSON.stringify({ name: 'sample-site', dependencies: { astro: '^6.0.0' } }),
    'astro.config.mjs': BARE_ASTRO_CONFIG,
    ...extraFiles,
  });
}

/** A prompter that gives a fixed answer, or has no terminal when given none. */
export class FakePrompter implements IPrompter {
  readonly questions: string[] = [];

  constructor(private readonly answer?: string) {}

  get interactive(): boolean {
    return this.answer !== undefined;
  }

  async choose<Value extends string>(question: string, choices: readonly PromptChoice<Value>[]): Promise<Value> {
    this.questions.push(question);
    const picked = choices.find((choice) => choice.value === this.answer);
    if (picked === undefined) throw new Error(`FakePrompter has no answer among: ${choices.map((c) => c.value).join(', ')}`);
    return picked.value;
  }
}

/** A logger that keeps what it is given. */
export class RecordingLogger implements ICliLogger {
  readonly infos: string[] = [];
  readonly warnings: string[] = [];
  readonly errors: string[] = [];

  info(message: string): void {
    this.infos.push(message);
  }

  warn(message: string): void {
    this.warnings.push(message);
  }

  error(message: string): void {
    this.errors.push(message);
  }

  get output(): string {
    return this.infos.join('\n');
  }
}
