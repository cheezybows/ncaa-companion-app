import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stubRosterParser } from './stub-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('stubRosterParser', () => {
  it('parses fixture with teamId', async () => {
    const fixturePath = join(__dirname, '../fixtures/sample-roster.json');
    const buffer = readFileSync(fixturePath);
    const result = await stubRosterParser.parse(buffer, 'sample-roster.json');
    expect(result.success).toBe(true);
    expect(result.data?.teamId).toBe('team-alabama');
  });
});
