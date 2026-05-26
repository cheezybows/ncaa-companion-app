#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_METADATA_URL =
  'https://raw.githubusercontent.com/sportsdataverse/cfbfastR-data/main/themes/logos.csv';

const options = parseArgs(process.argv.slice(2));

const sourceDir = path.resolve(ROOT, options.source ?? 'apps/portal/public/logos');
const destinations = [
  path.resolve(ROOT, options.webDest ?? 'apps/web/public/teams'),
  path.resolve(ROOT, options.portalDest ?? 'apps/portal/public/teams'),
];
const reportPath = path.resolve(ROOT, options.report ?? 'scripts/team-logo-import-report.json');

const cfbdAliases = new Map([
  ['app state', 'appalachian state'],
  ['cal', 'california'],
  ['fau', 'florida atlantic'],
  ['fiu', 'florida international'],
  ['hawaii', "hawai'i"],
  ['pitt', 'pittsburgh'],
  ['sam houston', 'sam houston state'],
  ['san jose state', 'san jose state'],
  ['ulm', 'ul monroe'],
  ['umass', 'massachusetts'],
]);

const catalogAliases = new Map([...cfbdAliases.entries()].map(([catalogName, cfbdName]) => [
  normalize(cfbdName),
  normalize(catalogName),
]));

async function main() {
  const catalog = await readCatalog();
  const metadata = parseCsv(await readMetadata());
  const metadataByName = indexMetadata(metadata);
  const unmatched = [];
  const copied = [];

  for (const team of catalog) {
    const metadataTeam = findMetadataTeam(team, metadataByName);
    if (!metadataTeam) {
      unmatched.push({ teamId: team.id, name: team.name, reason: 'No metadata match' });
      continue;
    }

    const sourceLogo = path.join(sourceDir, `${metadataTeam.team_id}.png`);
    const destinationName = `${team.id}.png`;
    const copiedTo = [];

    if (!(await exists(sourceLogo))) {
      unmatched.push({
        teamId: team.id,
        name: team.name,
        cfbdTeamId: metadataTeam.team_id,
        cfbdSchool: metadataTeam.school,
        reason: `Missing source logo ${path.relative(ROOT, sourceLogo)}`,
      });
      continue;
    }

    for (const destinationDir of destinations) {
      await fs.mkdir(destinationDir, { recursive: true });
      const destinationLogo = path.join(destinationDir, destinationName);
      await fs.copyFile(sourceLogo, destinationLogo);
      copiedTo.push(path.relative(ROOT, destinationLogo).replaceAll(path.sep, '/'));
    }

    copied.push({
      teamId: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      cfbdTeamId: metadataTeam.team_id,
      cfbdSchool: metadataTeam.school,
      logoUrl: `/teams/${destinationName}`,
      copiedTo,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    metadataSource: options.metadata ?? DEFAULT_METADATA_URL,
    sourceDir: path.relative(ROOT, sourceDir).replaceAll(path.sep, '/'),
    matchedCount: copied.length,
    unmatchedCount: unmatched.length,
    copied,
    unmatched,
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Copied ${copied.length} team logos.`);
  if (unmatched.length > 0) {
    console.warn(`Unmatched or missing logos: ${unmatched.length}. See ${path.relative(ROOT, reportPath)}.`);
  }
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = args[index + 1]?.startsWith('--') ? undefined : args[index + 1];
    parsed[key] = value ?? 'true';
    if (value) index += 1;
  }
  return parsed;
}

async function readCatalog() {
  const catalogPath = path.join(ROOT, 'packages/domain/src/team-catalog.ts');
  const source = await fs.readFile(catalogPath, 'utf8');
  const seedsBlock = source.match(/const TEAM_SEEDS: TeamSeed\[] = \[([\s\S]*?)\];/)?.[1] ?? '';
  const objectPattern = /\{([\s\S]*?)\}/g;
  const seeds = [];
  let match;

  while ((match = objectPattern.exec(seedsBlock)) !== null) {
    const body = match[1];
    const name = readLiteralProperty(body, 'name');
    const abbreviation = readLiteralProperty(body, 'abbreviation');
    const conferenceId = readLiteralProperty(body, 'conferenceId');
    if (!name || !abbreviation || !conferenceId) continue;
    seeds.push({
      id: `team-${slugify(name)}`,
      name,
      abbreviation,
      conferenceId,
    });
  }

  return seeds;
}

function readLiteralProperty(source, property) {
  return source.match(new RegExp(`${property}: '([^']+)'`))?.[1];
}

async function readMetadata() {
  if (options.metadata) {
    return fs.readFile(path.resolve(ROOT, options.metadata), 'utf8');
  }

  const response = await fetch(DEFAULT_METADATA_URL);
  if (!response.ok) {
    throw new Error(`Unable to fetch metadata: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function parseCsv(csv) {
  const rows = csv.trim().split(/\r?\n/).map(parseCsvLine);
  const headers = rows.shift();
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
  );
}

function parseCsvLine(line) {
  const values = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && quoted && nextChar === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += char;
    }
  }

  values.push(value);
  return values;
}

function indexMetadata(metadata) {
  const byName = new Map();
  for (const row of metadata) {
    const schoolKey = normalize(row.school);
    if (schoolKey && !byName.has(schoolKey)) {
      byName.set(schoolKey, row);
    }

    for (const value of [row.school, row.alt_name1, row.alt_name2, row.alt_name3]) {
      if (!value) continue;
      const key = normalize(value);
      if (!byName.has(key)) {
        byName.set(key, row);
      }
    }
  }
  return byName;
}

function findMetadataTeam(team, metadataByName) {
  const names = [
    cfbdAliases.get(normalize(team.name)),
    team.name,
    team.abbreviation,
  ].filter(Boolean);

  for (const name of names) {
    const metadataTeam = metadataByName.get(normalize(name));
    if (metadataTeam) return metadataTeam;
  }

  return metadataByName.get(catalogAliases.get(normalize(team.name)));
}

function slugify(value) {
  return value
    .toLowerCase()
    .replaceAll('&', 'and')
    .replaceAll('(', '')
    .replaceAll(')', '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll('&', 'and')
    .replace(/\bthe\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
