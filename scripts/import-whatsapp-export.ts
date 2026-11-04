/**
 * Imports conversation history from WhatsApp's own "Exportar conversa" text
 * files into `conversations` / `messages`.
 *
 * Why a text parser and not the API: the Cloud API has no endpoint for past
 * conversations — the webhook only delivers what arrives after the number was
 * subscribed. Everything that happened on the phone before that exists only
 * in the per-chat `.txt` the app exports, so that file is the only possible
 * source for backfilled history.
 *
 * What the export cannot give us, and is therefore lost on import:
 *  - Media. Exports either hide it (`<Mídia oculta>`) or reference a filename
 *    we have nowhere to store — there is no attachment column. Those lines
 *    come in as `invalid_content`, which the admin renders in italics.
 *  - Catalog orders. They appear as plain text, so `Order`/`OrderItem` can't
 *    be reconstructed; the line is imported as an ordinary message.
 *  - The customer's phone number, for any contact saved on the phone — the
 *    export shows the contact's *name*. See `resolvePhone`.
 *
 * Usage (dry-run by default — nothing is written without --commit):
 *
 *   npx ts-node scripts/import-whatsapp-export.ts <arquivo-ou-pasta>... \
 *     --me "Da Verdinha" [--phone 5521984448130] [--map mapa.json] \
 *     [--date-order dmy|mdy] [--include-system] [--status bot_active] [--commit]
 */
import * as fs from 'fs';
import * as path from 'path';
import { normalizeText } from '../src/common/normalize-text';

/**
 * `@prisma/client` is loaded lazily, inside `main`, so that importing the
 * parser from a test doesn't drag in the generated client (and its demand for
 * a readable `.env`) just to check a regex.
 */
type ConversationStatus = 'bot_active' | 'paused_human';
type Prisma = import('@prisma/client').PrismaClient;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Both export dialects in one pattern:
 *   Android: `08/09/2026 14:32 - Autor: corpo`
 *   iOS:     `[08/09/2026, 14:32:11] Autor: corpo`
 * Seconds and AM/PM are optional (locale-dependent), and the trailing
 * `]` / ` -` separator is whichever one the platform used.
 */
const LINE_START =
  /^\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([APap])\.?[Mm]\.?)?\]?(?:\s+-)?\s+(.*)$/;

/**
 * Splits `Autor: corpo`. The author is barred from containing a colon, which
 * is what keeps a bodiless system line ("As mensagens ... são criptografadas")
 * and a body that merely contains a URL from being mistaken for an author.
 */
const AUTHOR_AND_BODY = /^([^:\n]{1,80}): ([\s\S]*)$/;

/**
 * Lines with no content behind them. They still belong in the transcript —
 * the operator needs to see that *something* was sent at that point — but as
 * `invalid_content`, the same bucket the bot uses for media it can't read.
 */
const CONTENTLESS_PATTERNS = [
  /<\s*m[íi]dia\s+oculta\s*>/i,
  /<\s*media\s+omitted\s*>/i,
  /\b(imagem|[áa]udio|v[íi]deo|figurinha|gif|documento|contato|localiza[çc][ãa]o|mensagem)\s+(ocultad[oa]|omitid[oa])\b/i,
  /\b(image|audio|video|sticker|gif|document|contact card|location)\s+omitted\b/i,
  /\((arquivo anexado|file attached)\)/i,
  /<\s*(anexado|attached)\s*:/i,
  /\besta mensagem foi apagada\b/i,
  /\bvoc[êe] apagou esta mensagem\b/i,
  /\bthis message was deleted\b/i,
];

export type DateOrder = 'dmy' | 'mdy';

export interface ParsedMessage {
  timestamp: Date;
  /** `null` for a WhatsApp system notice, which has no sender. */
  author: string | null;
  body: string;
  /** True when the line stands in for content we cannot import. */
  contentless: boolean;
}

export interface ParsedExport {
  messages: ParsedMessage[];
  /** Distinct authors in first-seen order — used to work out who is who. */
  authors: string[];
  /** Count of WhatsApp system notices (excluded from `messages`). */
  systemLines: number;
  /** Lines that matched no timestamp and belonged to no preceding message. */
  unparsedLines: number;
  dateOrder: DateOrder;
}

/**
 * iOS sprinkles bidirectional marks through exports (notably before every
 * hidden-media label) and uses a narrow no-break space ahead of AM/PM. Left
 * in, they defeat every pattern above and end up inside message bodies.
 */
function stripInvisibles(content: string): string {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/[\u200E\u200F\u2066-\u2069]/g, '')
    .replace(/[\u202F\u00A0]/g, ' ');
}

/**
 * `08/09` is the 8th of September in a pt-BR export and the 9th of August in
 * an en-US one, and nothing in the file says which. Any component above 12 is
 * unambiguous, so one pass over the file usually settles it; a chat whose every
 * date is ambiguous falls back to the caller's choice (default pt-BR).
 */
export function detectDateOrder(
  content: string,
  fallback: DateOrder,
): DateOrder {
  let sawHighSecond = false;
  for (const line of stripInvisibles(content).split(/\r?\n/)) {
    const match = LINE_START.exec(line);
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first > 12) return 'dmy';
    if (second > 12) sawHighSecond = true;
  }
  return sawHighSecond ? 'mdy' : fallback;
}

/**
 * Timestamps are built in the running machine's timezone, because that is the
 * only reading of them that is true: the export writes the phone's wall clock
 * with no offset attached. Import from a machine set to the shop's timezone.
 */
function buildTimestamp(
  match: RegExpExecArray,
  dateOrder: DateOrder,
): Date | null {
  const first = Number(match[1]);
  const second = Number(match[2]);
  const day = dateOrder === 'dmy' ? first : second;
  const month = dateOrder === 'dmy' ? second : first;

  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;

  let hours = Number(match[4]);
  const minutes = Number(match[5]);
  const seconds = match[6] ? Number(match[6]) : 0;

  const meridiem = match[7]?.toUpperCase();
  if (meridiem === 'P' && hours < 12) hours += 12;
  if (meridiem === 'A' && hours === 12) hours = 0;

  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  // Guards against a line like `31/02/2026` sliding silently into March.
  const roundTrips =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return roundTrips ? date : null;
}

function isContentless(body: string): boolean {
  return CONTENTLESS_PATTERNS.some((pattern) => pattern.test(body));
}

export function parseWhatsAppExport(
  content: string,
  options: { dateOrder?: DateOrder } = {},
): ParsedExport {
  const dateOrder = options.dateOrder ?? detectDateOrder(content, 'dmy');

  const messages: ParsedMessage[] = [];
  const authors: string[] = [];
  let systemLines = 0;
  let unparsedLines = 0;

  // A message with line breaks in it is exported as a first line carrying the
  // timestamp followed by bare continuation lines. `last` is where they go.
  let last: ParsedMessage | null = null;

  for (const line of stripInvisibles(content).split(/\r?\n/)) {
    const match = LINE_START.exec(line);

    if (!match) {
      if (!line.trim()) continue;
      if (last) {
        last.body += `\n${line}`;
        // A continuation can be the part that reveals the media label.
        last.contentless = last.contentless || isContentless(line);
      } else {
        unparsedLines += 1;
      }
      continue;
    }

    const timestamp = buildTimestamp(match, dateOrder);
    if (!timestamp) {
      unparsedLines += 1;
      continue;
    }

    const rest = match[8];
    const split = AUTHOR_AND_BODY.exec(rest);

    if (!split) {
      // No author: a WhatsApp notice (encryption banner, "você criou o
      // grupo", security-code change). Counted, never imported by default.
      systemLines += 1;
      last = null;
      continue;
    }

    const author = split[1].trim();
    const body = split[2];
    if (!authors.includes(author)) authors.push(author);

    last = { timestamp, author, body, contentless: isContentless(body) };
    messages.push(last);
  }

  return { messages, authors, systemLines, unparsedLines, dateOrder };
}

// ---------------------------------------------------------------------------
// Mapping onto our rows
// ---------------------------------------------------------------------------

export interface MessageRow {
  direction: 'inbound' | 'outbound';
  kind: 'text' | 'invalid_content';
  body: string;
  createdAt: Date;
}

/**
 * `me` is the shop's own name as it appears in the export — the side whose
 * messages become `outbound`. It's matched loosely (accent- and case-blind)
 * because the exporting phone writes it however the contact is saved.
 */
export function toMessageRows(
  parsed: ParsedExport,
  options: { me: string },
): MessageRow[] {
  const me = normalizeText(options.me);

  return parsed.messages.map((message) => ({
    direction:
      normalizeText(message.author ?? '') === me ? 'outbound' : 'inbound',
    kind: message.contentless ? 'invalid_content' : 'text',
    body: message.body,
    createdAt: message.timestamp,
  }));
}

/**
 * Normalises to the exact shape the webhook stores: country code and digits,
 * no `+` and no separators (`5521984448130`). This has to match, because
 * `BotEngineService.resolveConversation` finds a conversation by an equality
 * check on `phone` — a number stored as `+55 21 98444-8130` would leave the
 * imported history stranded and the bot creating a second conversation for
 * the same customer on their next message.
 */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  // A number copied straight out of a pt-BR export usually lacks the country
  // code: `(21) 98444-8130`. DDD + 8 or 9 digits is unambiguous enough.
  if (/^\d{10,11}$/.test(digits)) digits = `55${digits}`;
  return /^\d{12,15}$/.test(digits) ? digits : null;
}

/** `Conversa do WhatsApp com João Silva.txt` -> `João Silva`. */
export function contactFromFilename(filePath: string): string | null {
  const base = path.basename(filePath).replace(/\.txt$/i, '');
  const match =
    /^(?:Conversa do WhatsApp com|WhatsApp Chat with|Chat do WhatsApp com)\s+(.+)$/i.exec(
      base,
    );
  return match ? match[1].trim() : null;
}

interface ChatMapping {
  phone?: string;
  name?: string;
}

/**
 * The phone is the one field the export genuinely cannot supply for a saved
 * contact, and it is required and load-bearing. Resolution order: the mapping
 * file, then `--phone`, then the filename on the chance the contact was never
 * saved (WhatsApp then names the file after the raw number). A chat with no
 * phone is reported and skipped rather than imported under a placeholder,
 * which would fragment the customer's history across two conversations.
 */
function resolvePhone(
  filePath: string,
  mapping: ChatMapping | undefined,
  cliPhone: string | undefined,
): { phone: string | null; source: string } {
  if (mapping?.phone) {
    const phone = normalizePhone(mapping.phone);
    if (phone) return { phone, source: 'mapa' };
  }
  if (cliPhone) {
    const phone = normalizePhone(cliPhone);
    if (phone) return { phone, source: '--phone' };
  }
  const fromName = contactFromFilename(filePath);
  if (fromName && /\d/.test(fromName)) {
    const phone = normalizePhone(fromName);
    if (phone) return { phone, source: 'nome do arquivo' };
  }
  return { phone: null, source: '-' };
}

/**
 * The contact's display name, for `Conversation.name`. The export's own
 * author string is the best source — it's what the shop had the customer
 * saved as — with the filename as a fallback for a chat that is pure media.
 */
function resolveName(
  filePath: string,
  parsed: ParsedExport,
  mapping: ChatMapping | undefined,
  me: string,
): string | null {
  if (mapping?.name) return mapping.name;
  const meNormalized = normalizeText(me);
  const other = parsed.authors.find(
    (author) => normalizeText(author) !== meNormalized,
  );
  return other ?? contactFromFilename(filePath);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Options {
  inputs: string[];
  me?: string;
  phone?: string;
  mapPath?: string;
  dateOrder?: DateOrder;
  includeSystem: boolean;
  status: ConversationStatus;
  commit: boolean;
  /**
   * Reads the files and reports, without opening a database connection. This
   * is the first run you want: it's what prints the author names, so you know
   * what to pass to `--me`, and it's the only mode that works before the
   * database is reachable.
   */
  parseOnly: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    inputs: [],
    includeSystem: false,
    parseOnly: false,
    // Imported history is by definition a conversation a human was handling,
    // so it lands paused rather than pretending the bot owns it.
    status: 'paused_human',
    commit: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--me':
        options.me = argv[++i];
        break;
      case '--phone':
        options.phone = argv[++i];
        break;
      case '--map':
        options.mapPath = argv[++i];
        break;
      case '--date-order': {
        const value = argv[++i];
        if (value !== 'dmy' && value !== 'mdy') {
          throw new Error(
            `--date-order deve ser dmy ou mdy, recebi "${value}"`,
          );
        }
        options.dateOrder = value;
        break;
      }
      case '--status': {
        const value = argv[++i];
        if (value !== 'bot_active' && value !== 'paused_human') {
          throw new Error(
            `--status deve ser bot_active ou paused_human, recebi "${value}"`,
          );
        }
        options.status = value;
        break;
      }
      case '--include-system':
        options.includeSystem = true;
        break;
      case '--parse-only':
        options.parseOnly = true;
        break;
      case '--commit':
        options.commit = true;
        break;
      default:
        if (arg.startsWith('--')) throw new Error(`Opção desconhecida: ${arg}`);
        options.inputs.push(arg);
    }
  }

  return options;
}

/** Every `.txt` under the given files and directories. */
function collectFiles(inputs: string[]): string[] {
  const files: string[] = [];
  for (const input of inputs) {
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(input).sort()) {
        if (/\.txt$/i.test(entry)) files.push(path.join(input, entry));
      }
    } else {
      files.push(input);
    }
  }
  return files;
}

/**
 * `Message` has no natural unique key, so re-running the import is made safe
 * by comparing against what the conversation already holds in the window the
 * file covers: same second, same direction, same body is the same message.
 */
async function existingFingerprints(
  prisma: Prisma,
  conversationId: string,
  from: Date,
  to: Date,
): Promise<Set<string>> {
  const rows = await prisma.message.findMany({
    where: { conversationId, createdAt: { gte: from, lte: to } },
    select: { createdAt: true, direction: true, body: true },
  });
  return new Set(
    rows.map((row) => fingerprint(row.createdAt, row.direction, row.body)),
  );
}

function fingerprint(
  createdAt: Date,
  direction: string,
  body: string | null,
): string {
  return `${createdAt.getTime()}|${direction}|${body ?? ''}`;
}

/**
 * Restores the two fields the insert above necessarily got wrong.
 *
 * `Conversation.updatedAt` is `@updatedAt`, so Prisma stamps it with "now" on
 * any write — which would shove every freshly imported chat, however old, to
 * the top of the admin list (it sorts by `updatedAt desc`). `unread` is the
 * denormalised "the last message is the customer's" the schema documents.
 * Both are derived here from the conversation's actual last message, in raw
 * SQL because that is the only way past `@updatedAt`.
 */
async function realignConversation(
  prisma: Prisma,
  conversationId: string,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE conversations
    SET updated_at = latest.created_at,
        unread = (latest.direction = 'inbound'::"MessageDirection")
    FROM (
      SELECT created_at, direction
      FROM messages
      WHERE conversation_id = ${conversationId}::uuid
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) AS latest
    WHERE conversations.id = ${conversationId}::uuid
  `;
}

interface FileReport {
  file: string;
  phone: string | null;
  phoneSource: string;
  name: string | null;
  authors: string[];
  total: number;
  inbound: number;
  outbound: number;
  contentless: number;
  systemLines: number;
  unparsedLines: number;
  first?: Date;
  last?: Date;
  action: 'criar' | 'mesclar' | 'pular' | 'a definir';
  inserted: number;
  skippedDuplicates: number;
  note?: string;
}

async function importFile(
  prisma: Prisma | null,
  filePath: string,
  options: Options,
  mappings: Record<string, ChatMapping>,
): Promise<FileReport> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseWhatsAppExport(content, { dateOrder: options.dateOrder });
  const mapping = mappings[path.basename(filePath)];
  const { phone, source } = resolvePhone(filePath, mapping, options.phone);
  const name = resolveName(filePath, parsed, mapping, options.me ?? '');

  let rows = toMessageRows(parsed, { me: options.me ?? '' });
  if (!options.includeSystem) {
    // System notices are parsed as authorless and already excluded; this
    // keeps the flag meaningful if that ever changes.
    rows = rows.filter((row) => row.body.trim().length > 0);
  }

  const report: FileReport = {
    file: path.basename(filePath),
    phone,
    phoneSource: source,
    name,
    authors: parsed.authors,
    total: rows.length,
    inbound: rows.filter((row) => row.direction === 'inbound').length,
    outbound: rows.filter((row) => row.direction === 'outbound').length,
    contentless: rows.filter((row) => row.kind === 'invalid_content').length,
    systemLines: parsed.systemLines,
    unparsedLines: parsed.unparsedLines,
    first: rows[0]?.createdAt,
    last: rows[rows.length - 1]?.createdAt,
    action: 'pular',
    inserted: 0,
    skippedDuplicates: 0,
  };

  if (!rows.length) {
    report.note = 'nenhuma mensagem reconhecida';
    return report;
  }
  // `--me` is checked before the phone because it's the one that invalidates
  // the rest of the report: with the wrong `--me` every message reads as
  // inbound, so the shop's own replies would be imported as the customer's.
  if (!report.outbound) {
    report.note = options.me
      ? `--me "${options.me}" não casa com nenhum autor (${parsed.authors.join(', ')})`
      : `informe --me com um destes autores: ${parsed.authors.join(', ')}`;
    return report;
  }
  if (!phone) {
    report.note = 'sem telefone — use --phone ou --map';
    return report;
  }

  if (!prisma) {
    report.action = 'a definir';
    report.inserted = rows.length;
    return report;
  }

  const existing = await prisma.conversation.findFirst({ where: { phone } });
  report.action = existing ? 'mesclar' : 'criar';

  // Explicitly min/max rather than first/last row: these two bound the
  // duplicate check's window, and a file out of chronological order would
  // otherwise narrow it and let duplicates through.
  const times = rows.map((row) => row.createdAt.getTime());
  const first = new Date(Math.min(...times));
  const last = new Date(Math.max(...times));

  const seen = existing
    ? await existingFingerprints(prisma, existing.id, first, last)
    : new Set<string>();
  const fresh = rows.filter(
    (row) => !seen.has(fingerprint(row.createdAt, row.direction, row.body)),
  );
  report.skippedDuplicates = rows.length - fresh.length;

  if (!options.commit) {
    report.inserted = fresh.length;
    return report;
  }

  const conversationId =
    existing?.id ??
    (
      await prisma.conversation.create({
        data: {
          phone,
          name,
          status: options.status,
          createdAt: first,
        },
        select: { id: true },
      })
    ).id;

  if (existing) {
    // Backfilled history can predate the conversation row itself; the "since"
    // the admin shows should be the oldest message we know about.
    if (first < existing.createdAt) {
      await prisma.conversation.update({
        where: { id: existing.id },
        data: { createdAt: first, name: existing.name ?? name },
      });
    } else if (!existing.name && name) {
      await prisma.conversation.update({
        where: { id: existing.id },
        data: { name },
      });
    }
  }

  if (fresh.length) {
    await prisma.message.createMany({
      data: fresh.map((row) => ({ ...row, conversationId })),
    });
    report.inserted = fresh.length;
  }

  await realignConversation(prisma, conversationId);
  return report;
}

/**
 * Local time, deliberately: the timestamps were built from the export's wall
 * clock, so printing them in UTC would show a 14:32 message as 17:32 and read
 * as if the import had shifted every time.
 */
function formatDate(date?: Date): string {
  if (!date) return '-';
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function printReport(reports: FileReport[], options: Options): void {
  for (const report of reports) {
    console.log(`\n${report.file}`);
    console.log(`  autores          ${report.authors.join(' | ') || '-'}`);
    console.log(
      `  telefone         ${report.phone ?? '-'} (${report.phoneSource})`,
    );
    console.log(`  nome             ${report.name ?? '-'}`);
    console.log(
      `  mensagens        ${report.total} (${report.inbound} recebidas, ${report.outbound} enviadas, ${report.contentless} sem conteúdo)`,
    );
    console.log(
      `  período          ${formatDate(report.first)} → ${formatDate(report.last)}`,
    );
    console.log(`  avisos do sistema ${report.systemLines} (ignorados)`);
    if (report.unparsedLines) {
      console.log(`  linhas ilegíveis ${report.unparsedLines}`);
    }
    console.log(
      `  ação             ${report.action}${report.note ? ` — ${report.note}` : ''}`,
    );
    console.log(
      `  a gravar         ${report.inserted}${report.skippedDuplicates ? ` (${report.skippedDuplicates} já existiam)` : ''}`,
    );
  }

  const inserted = reports.reduce((sum, report) => sum + report.inserted, 0);
  const skipped = reports.filter((report) => report.action === 'pular').length;

  const mode = options.commit
    ? 'Gravado'
    : options.parseOnly
      ? 'Leitura'
      : 'Simulação';

  console.log(
    `\n${mode}: ${inserted} mensagens em ${
      reports.length - skipped
    } conversa(s); ${skipped} arquivo(s) ignorado(s).`,
  );
  if (options.parseOnly) {
    console.log(
      'Nada foi gravado e o banco não foi consultado — rode sem --parse-only para ver o que seria criado ou mesclado.',
    );
  } else if (!options.commit) {
    console.log('Nada foi gravado. Rode de novo com --commit para aplicar.');
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  // `--me` is the one flag you can't know in advance, so `--parse-only` is
  // allowed without it: that run is what prints the author names.
  if (!options.inputs.length || (!options.me && !options.parseOnly)) {
    console.error(
      [
        'Uso: npx ts-node scripts/import-whatsapp-export.ts <arquivo-ou-pasta>... --me "<nome do negócio no export>"',
        '',
        '  --me <nome>           autor cujas mensagens são outbound (obrigatório)',
        '  --phone <e164>        telefone da conversa (use com um único arquivo)',
        '  --map <arquivo.json>  { "nome-do-arquivo.txt": { "phone": "5521...", "name": "..." } }',
        '  --date-order dmy|mdy  ordem das datas (padrão: detectada, com fallback dmy)',
        '  --status <status>     bot_active | paused_human (padrão: paused_human)',
        '  --include-system      importa também os avisos do WhatsApp',
        '  --parse-only          só lê os arquivos e relata; não acessa o banco',
        '  --commit              grava no banco (sem isso, apenas simula)',
        '',
        'Comece por: --parse-only (mostra os autores para preencher --me).',
      ].join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  const mappings: Record<string, ChatMapping> = options.mapPath
    ? (JSON.parse(fs.readFileSync(options.mapPath, 'utf-8')) as Record<
        string,
        ChatMapping
      >)
    : {};

  const files = collectFiles(options.inputs);
  if (!files.length) {
    console.error('Nenhum arquivo .txt encontrado nos caminhos informados.');
    process.exitCode = 1;
    return;
  }

  const { PrismaClient } = options.parseOnly
    ? { PrismaClient: null }
    : await import('@prisma/client');
  const prisma = PrismaClient ? new PrismaClient() : null;

  try {
    const reports: FileReport[] = [];
    // Sequentially: a dry-run's report reads as a checklist in file order,
    // and two files for the same phone must not race to create the row.
    for (const file of files) {
      reports.push(await importFile(prisma, file, options, mappings));
    }
    printReport(reports, options);
  } finally {
    await prisma?.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
