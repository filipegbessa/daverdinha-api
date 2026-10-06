import { toStaticImports } from './generate-openapi-metadata';

describe('toStaticImports', () => {
  const generated = [
    '/* eslint-disable */',
    'export default async () => {',
    '    return { "@nestjs/swagger": { "models": [[import("./a/x.dto"), {}], [import("./b/y.dto"), {}]], "controllers": [[import("./a/x.dto"), {}]] } };',
    '};',
    '',
  ].join('\n');

  it('hoists each dynamic import into one static import, reusing the alias for repeats', () => {
    const result = toStaticImports(generated);

    expect(result).toContain("import * as m0 from './a/x.dto';");
    expect(result).toContain("import * as m1 from './b/y.dto';");
    expect(result).toContain('"models": [[m0, {}], [m1, {}]], "controllers": [[m0, {}]]');
    expect(result).not.toMatch(/import\(/);
  });

  it('keeps the eslint-disable header first and marks the file as generated', () => {
    const lines = toStaticImports(generated).split('\n');

    expect(lines[0]).toBe('/* eslint-disable */');
    expect(lines[1]).toMatch(/não edite à mão/);
  });
});
