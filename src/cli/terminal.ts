import { createInterface } from 'node:readline/promises';
import type { ICliLogger, IPrompter, PromptChoice } from './types.js';

/** Writes messages to the terminal: information to stdout, warnings and errors to stderr. */
export class TerminalLogger implements ICliLogger {
  info(message: string): void {
    process.stdout.write(`${message}\n`);
  }

  warn(message: string): void {
    process.stderr.write(`Warning: ${message}\n`);
  }

  error(message: string): void {
    process.stderr.write(`Error: ${message}\n`);
  }
}

/** Asks questions on the terminal, when there is one. */
export class TerminalPrompter implements IPrompter {
  get interactive(): boolean {
    return process.stdin.isTTY === true && process.stdout.isTTY === true;
  }

  async choose<Value extends string>(question: string, choices: readonly PromptChoice<Value>[]): Promise<Value> {
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const menu = choices.map((choice, index) => `  ${index + 1}. ${choice.label}`).join('\n');
      for (;;) {
        const answer = (await readline.question(`${question}\n${menu}\n> `)).trim().toLowerCase();
        const picked = choices[Number(answer) - 1] ?? choices.find((choice) => choice.value === answer);
        if (picked !== undefined) return picked.value;
        process.stdout.write(`Enter a number from 1 to ${choices.length}.\n`);
      }
    } finally {
      readline.close();
    }
  }
}
