import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  ACTIONS_MANUAL_INSTRUCTIONS,
  COMPONENT_SNIPPET,
  actionsTemplate,
  drizzleConfigTemplate,
  runtimeTemplate,
  schemaTemplate,
} from '../../src/cli/templates';
import { DATABASE_KINDS } from '../../src/cli/types';
import { packageRoot } from './helpers';

const PACKAGE_NAME = '@respectify/astro';

const exportsMap = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).exports as Record<string, string>;

/** A named import or re-export a generated file takes from this package. */
interface PackageImport {
  subpath: string;
  names: string[];
}

/** What a generated source file imports or re-exports from this package, and any syntax errors in it. */
function inspect(source: string): { imports: PackageImport[]; syntaxErrors: string[] } {
  const result = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const syntaxErrors = (result.diagnostics ?? []).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));

  const file = ts.createSourceFile('generated.ts', source, ts.ScriptTarget.Latest, true);
  const imports: PackageImport[] = [];
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (specifier === undefined || !ts.isStringLiteral(specifier) || !specifier.text.startsWith(PACKAGE_NAME)) continue;

    const bindings = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : statement.exportClause;
    const names =
      bindings !== undefined && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))
        ? bindings.elements.map((element) => (element.propertyName ?? element.name).text)
        : [];
    imports.push({ subpath: `.${specifier.text.slice(PACKAGE_NAME.length)}`, names });
  }
  return { imports, syntaxErrors };
}

/** Assert that every name a generated file takes from this package is really exported there. */
async function expectImportsToExist(source: string): Promise<void> {
  const { imports, syntaxErrors } = inspect(source);
  expect(syntaxErrors).toEqual([]);
  expect(imports.length).toBeGreaterThan(0);

  for (const { subpath, names } of imports) {
    const target = exportsMap[subpath];
    expect(target, `${PACKAGE_NAME}${subpath.slice(1)} is not in the package's exports`).toBeDefined();
    const module = (await import(path.join(packageRoot, target ?? ''))) as Record<string, unknown>;
    for (const name of names) {
      expect(module[name], `${subpath} does not export ${name}`).toBeDefined();
    }
  }
}

describe.each(DATABASE_KINDS)('files generated for %s', (database) => {
  it('the runtime module imports only what the package exports', async () => {
    await expectImportsToExist(runtimeTemplate(database));
  });

  it('the schema re-exports a table the package exports', async () => {
    await expectImportsToExist(schemaTemplate(database));
  });

  it('the drizzle config is valid TypeScript using a dialect drizzle-kit knows', () => {
    const source = drizzleConfigTemplate(database);

    expect(inspect(source).syntaxErrors).toEqual([]);
    expect(source).toMatch(/dialect: '(postgresql|turso)'/);
  });
});

describe('files generated for every database', () => {
  it('the actions file imports only what the package exports', async () => {
    await expectImportsToExist(actionsTemplate());
  });

  it('the hand-edit instructions name the same export as the generated actions file', () => {
    expect(ACTIONS_MANUAL_INSTRUCTIONS).toContain("import { respectifyCommentActions } from '@respectify/astro/actions';");
  });

  it('the component snippet points at a component the package ships', () => {
    const specifier = /from '@respectify\/astro(\/[^']+)'/.exec(COMPONENT_SNIPPET)?.[1];

    expect(exportsMap[`.${specifier}`]).toBeDefined();
  });
});
