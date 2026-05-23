import { describe, expect, it } from 'vitest';

import { loadUniversalCaptureLayouts } from './fixtures.js';

describe('universal capture layouts', () => {
  const layouts = loadUniversalCaptureLayouts();

  it('defines reusable roster columns without player values', () => {
    expect(layouts.rosterByPosition.sharedColumns.map((column) => column.header)).toEqual([
      'RS',
      'NAME',
      'YEAR',
      'POS',
      'OVR',
    ]);
    expect(layouts.rosterByPosition.ratingColumnSets.qb?.map((column) => column.ratingCode)).toEqual([
      'SPD',
      'ACC',
      'AGI',
      'COD',
      'STR',
      'AWR',
      'THP',
      'SAC',
    ]);
    expect(layouts.rosterByPosition.detailPanelFields).toContain('developmentTrait');
  });

  it('defines schedule and Top 25 table structure', () => {
    expect(layouts.teamSchedule.columns.map((column) => column.header)).toEqual([
      'WEEK',
      'DATE',
      'SITE',
      'OPPONENT',
      'TIME(ET)/RESULT',
      'OPP W-L',
      'TV',
      'FORCE WIN',
    ]);
    expect(layouts.top25Rankings.columns.map((column) => column.header)).toEqual([
      'RANK',
      'LW',
      'NAME/VOTES',
      'W-L',
      'LAST WEEK',
      'THIS WEEK',
    ]);
  });
});
