import * as fs from 'fs';
import * as path from 'path';
import { PluginMetadataGenerator } from '@nestjs/cli/lib/compiler/plugins/plugin-metadata-generator';
import { ReadonlyVisitor } from '@nestjs/swagger/plugin';

// Produção não passa pelo `nest build`: a Vercel compila `api/index.ts` por
// conta própria, então o plugin do @nestjs/swagger nunca rodaria lá e todo DTO
// sairia vazio no OpenAPI. Este script roda o mesmo plugin em modo leitura e
// grava o que ele inferiu (tipos, class-validator, JSDoc) em
// `src/metadata.ts`, que vai commitado e é carregado em runtime pelo
// `OpenApiService`. Local e produção leem o mesmo arquivo.
//
// Rode `npm run openapi:metadata` sempre que mexer em DTO ou controller. O CI
// regenera e falha se o arquivo commitado estiver desatualizado.
const SRC_DIR = path.resolve(__dirname, '../src');
const OUTPUT_FILE = path.join(SRC_DIR, 'metadata.ts');

/**
 * O gerador emite `import("./x")` dinâmico, que com `moduleResolution:
 * nodenext` não compila sem extensão — e com extensão `.js` passaria a
 * depender de cada ferramenta (ts-jest, ts-node, o bundler da Vercel) mapear
 * `.js` de volta para `.ts`. Imports estáticos funcionam em todas. O
 * `MetadataLoader` aceita tanto a promise quanto o módulo já resolvido.
 */
export function toStaticImports(source: string): string {
  const aliases = new Map<string, string>();
  const body = source.replace(/import\("(\.[^"]+)"\)/g, (_, specifier: string) => {
    if (!aliases.has(specifier)) aliases.set(specifier, `m${aliases.size}`);
    return aliases.get(specifier)!;
  });
  const imports = [...aliases]
    .map(([specifier, alias]) => `import * as ${alias} from '${specifier}';`)
    .join('\n');
  return body.replace('/* eslint-disable */\n', `/* eslint-disable */\n// Gerado por scripts/generate-openapi-metadata.ts — não edite à mão.\n${imports}\n\n`);
}

if (require.main === module) {
  new PluginMetadataGenerator().generate({
    visitors: [
      new ReadonlyVisitor({
        introspectComments: true,
        pathToSource: SRC_DIR,
        // `PaginationQueryDto` mora em `common/pagination.ts`, fora da
        // convenção `.dto.ts`.
        dtoFileNameSuffix: ['.dto.ts', 'pagination.ts'],
      }),
    ],
    outputDir: SRC_DIR,
    filename: 'metadata.ts',
    // Passar o programa pronto pula o diagnóstico do gerador, que abortaria
    // por causa do próprio arquivo de saída (ausente ou desatualizado). O
    // `tsc` do build continua sendo quem garante que o projeto compila.
    tsProgramRef: ReadonlyVisitor.createTsProgram('tsconfig.build.json'),
  });

  fs.writeFileSync(OUTPUT_FILE, toStaticImports(fs.readFileSync(OUTPUT_FILE, 'utf8')));
}
