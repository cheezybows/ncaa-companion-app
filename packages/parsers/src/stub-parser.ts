import type { Roster } from '@ncaa/domain';
import { PLACEHOLDER_ROSTERS } from '@ncaa/domain';
import type { GameFileParser } from './parser-registry.js';

/**
 * Stub parser used until real NCAA PC file formats are documented.
 * Activates on JSON fixtures in packages/parsers/fixtures/
 */
export const stubRosterParser: GameFileParser<Roster> = {
  id: 'stub-roster-json',
  name: 'Stub Roster JSON',
  supportedKinds: ['json', 'roster'],
  canParse(fileName, extension) {
    return extension.toLowerCase() === '.json' && fileName.toLowerCase().includes('roster');
  },
  async parse(buffer) {
    try {
      const text = buffer.toString('utf-8');
      const data = JSON.parse(text) as { teamId?: string; roster?: Roster };
      if (data.roster) {
        return { success: true, data: data.roster, errors: [] };
      }
      if (data.teamId && PLACEHOLDER_ROSTERS[data.teamId]) {
        return { success: true, data: PLACEHOLDER_ROSTERS[data.teamId], errors: [] };
      }
      return { success: false, errors: ['JSON does not contain roster or teamId'] };
    } catch (e) {
      return {
        success: false,
        errors: [e instanceof Error ? e.message : 'Parse failed'],
      };
    }
  },
};
