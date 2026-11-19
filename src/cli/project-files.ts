import fs from 'node:fs';
import path from 'node:path';
import type { IProjectFiles } from './types.js';

/** The files of a project on disk. */
export class NodeProjectFiles implements IProjectFiles {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  exists(relativePath: string): boolean {
    const resolved = this.tryResolve(relativePath);
    return resolved !== undefined && fs.existsSync(resolved) && fs.statSync(resolved).isFile();
  }

  read(relativePath: string): string {
    return fs.readFileSync(this.resolve(relativePath), 'utf8');
  }

  create(relativePath: string, content: string): void {
    const resolved = this.resolve(relativePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    // 'wx' fails when the file exists, so a file is never overwritten even in a race
    fs.writeFileSync(resolved, content, { encoding: 'utf8', flag: 'wx' });
  }

  append(relativePath: string, content: string): void {
    fs.appendFileSync(this.resolve(relativePath), content, 'utf8');
  }

  /** The absolute path, or undefined when it would leave the project. */
  private tryResolve(relativePath: string): string | undefined {
    const resolved = path.resolve(this.root, relativePath);
    const inside = resolved === this.root || resolved.startsWith(`${this.root}${path.sep}`);
    return inside ? resolved : undefined;
  }

  private resolve(relativePath: string): string {
    const resolved = this.tryResolve(relativePath);
    if (resolved === undefined) {
      throw new Error(`${relativePath} is outside the project folder`);
    }
    return resolved;
  }
}
