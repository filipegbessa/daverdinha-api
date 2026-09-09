import * as fs from 'fs';
import * as readline from 'readline';

// ⚠️ IBGE's CNEFE 2022 release ships as semicolon-delimited files with a header row.
// Confirm the exact header names for the CEP and bairro/locality columns against the
// real downloaded file's accompanying data dictionary ("CNEFE - Comentários - v.dicionário
// de dados" or similar) before running this script against real data. These two constants
// are the lines to adjust if they don't match.
const CEP_COLUMN = 'CEP';
const BAIRRO_COLUMN = 'NOM_LOCALIDADE';
const DELIMITER = ';';

export async function computeCepRangesFromCnefe(
  filePath: string,
): Promise<Record<string, { start: number; end: number }[]>> {
  const rangeByBairro: Record<string, { min: number; max: number }> = {};

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let columns: string[] | null = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const fields = line.split(DELIMITER);

    if (!columns) {
      columns = fields;
      continue;
    }

    const cepIndex = columns.indexOf(CEP_COLUMN);
    const bairroIndex = columns.indexOf(BAIRRO_COLUMN);
    if (cepIndex === -1 || bairroIndex === -1) {
      throw new Error(
        `CNEFE column not found: expected "${CEP_COLUMN}" and "${BAIRRO_COLUMN}" in header, got: ${columns.join(', ')}`,
      );
    }

    const rawCep = fields[cepIndex]?.trim();
    const bairro = fields[bairroIndex]?.trim();
    if (!bairro || !rawCep || !/^\d{8}$/.test(rawCep)) continue;
    const cep = Number(rawCep);

    const current = rangeByBairro[bairro];
    if (!current) {
      rangeByBairro[bairro] = { min: cep, max: cep };
    } else {
      current.min = Math.min(current.min, cep);
      current.max = Math.max(current.max, cep);
    }
  }

  const result: Record<string, { start: number; end: number }[]> = {};
  for (const [bairro, { min, max }] of Object.entries(rangeByBairro)) {
    result[bairro] = [{ start: min, end: max }];
  }
  return result;
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: ts-node scripts/generate-cep-ranges.ts <path-to-cnefe-file>');
    process.exit(1);
  }

  const ranges = await computeCepRangesFromCnefe(inputPath);
  const output = Object.entries(ranges).map(([bairro, ranges]) => ({ bairro, ranges }));

  const outputPath = require('path').join(__dirname, '..', 'prisma', 'data', 'cep-ranges.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${output.length} bairros to ${outputPath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
