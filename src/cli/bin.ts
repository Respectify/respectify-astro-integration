#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runCli } from './cli.js';
import { NodeProjectFiles } from './project-files.js';
import { TerminalLogger, TerminalPrompter } from './terminal.js';

// The package root is two folders up from both src/cli and the compiled dist/cli
const defaultConfigJson = readFileSync(new URL('../../default-respectify.config.json', import.meta.url), 'utf8');

process.exitCode = await runCli(process.argv.slice(2), {
  logger: new TerminalLogger(),
  prompter: new TerminalPrompter(),
  openProject: (folder) => new NodeProjectFiles(folder),
  defaultConfigJson,
});
