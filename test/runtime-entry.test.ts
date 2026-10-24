import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * A runtime module (`respectify({ runtime })`) is bundled into the server. Adapters such as
 * Vercel bundle dependencies into the function, so anything a runtime module imports must not
 * reach Astro itself: `astro/config` pulls in Astro's compiler and the build fails. These are
 * the entries a runtime module imports.
 */
const RUNTIME_ENTRIES = ['./runtime', './postgres', './sqlite'];

const root = fileURLToPath(new URL('..', import.meta.url));
const exportsMap = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).exports as Record<string, string>;

/** The value (not type-only) import specifiers of one source file. */
function valueImports(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      const typeOnly =
        clause !== undefined &&
        (clause.isTypeOnly ||
          (clause.name === undefined &&
            clause.namedBindings !== undefined &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.every((element) => element.isTypeOnly)));
      if (!typeOnly && ts.isStringLiteral(statement.moduleSpecifier)) specifiers.push(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      specifiers.push(statement.moduleSpecifier.text);
    }
  }
  return specifiers;
}

/** Every bare (package) specifier reachable through value imports from an entry file. */
function reachablePackages(entry: string): Set<string> {
  const packages = new Set<string>();
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of valueImports(file)) {
      if (!specifier.startsWith('.')) {
        packages.add(specifier);
        continue;
      }
      const base = path.resolve(path.dirname(file), specifier);
      const resolved = [base, `${base}.ts`, path.join(base, 'index.ts')].find((candidate) => existsSync(candidate) && candidate.endsWith('.ts'));
      if (!resolved) throw new Error(`Cannot resolve ${specifier} from ${file}`);
      pending.push(resolved);
    }
  }
  return packages;
}

describe('runtime entries', () => {
  it('exports @respectify/astro/runtime', () => {
    expect(exportsMap['./runtime']).toBeDefined();
  });

  it.each(RUNTIME_ENTRIES)('%s never imports Astro', (entry) => {
    const target = exportsMap[entry];
    expect(target, `${entry} is not exported`).toBeDefined();
    const astroImports = [...reachablePackages(path.join(root, target as string))].filter((specifier) => specifier === 'astro' || specifier.startsWith('astro/') || specifier.startsWith('astro:'));
    expect(astroImports).toEqual([]);
  });

  it('defineRespectifyRuntime from /runtime returns the runtime it is given', async () => {
    const target = exportsMap['./runtime'];
    expect(target).toBeDefined();
    const runtimeEntry = (await import(path.join(root, target as string))) as typeof import('../src/define-runtime');
    const runtime = { store: { findById: async () => undefined, listApproved: async () => [], create: async () => Promise.reject(new Error('unused')), delete: async () => false } };
    expect(runtimeEntry.defineRespectifyRuntime(runtime)).toBe(runtime);
  });
});
