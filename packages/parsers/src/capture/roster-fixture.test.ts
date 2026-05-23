import { describe, expect, it } from 'vitest';
import { loadRosterCaptureFixture } from './fixtures.js';

describe('roster capture fixture', () => {
  const fixture = loadRosterCaptureFixture();

  it('loads matching meta and expected payloads', () => {
    expect(fixture.meta.fixtureId).toBe('roster-cb-oregon-state-partial');
    expect(fixture.expected.fixtureId).toBe(fixture.meta.fixtureId);
    expect(fixture.meta.partial).toBe(true);
    expect(fixture.meta.screenKind).toBe('roster_by_position');
    expect(fixture.expected.screenKind).toBe(fixture.meta.screenKind);
  });

  it('points to the checked-in roster screenshot', () => {
    expect(fixture.meta.imageFile).toBe('roster-cb-oregon-state.partial.jpg');
    expect(fixture.imagePresent).toBe(true);
    expect(fixture.imagePath).toMatch(/roster-cb-oregon-state\.partial\.jpg$/);
  });

  it('marks a partial roster view with one focused row', () => {
    const { table } = fixture.expected;

    expect(table.rows).toHaveLength(fixture.meta.table.visibleRowCount);
    expect(table.focusedRowIndex).toBe(fixture.meta.table.focusedRowIndex);
    expect(fixture.meta.table.hasMoreRows).toBe(true);
    expect(fixture.meta.table.hasHorizontalScroll).toBe(true);

    const focused = table.rows[table.focusedRowIndex];
    expect(focused?.focused).toBe(true);
    expect(focused?.displayName).toBe('D.Biggums');
    expect(focused?.ratings).toMatchObject({
      overall: 76,
      speed: 93,
      acceleration: 93,
      agility: 89,
      changeOfDirection: 88,
      strength: 67,
      awareness: 71,
      playRecognition: 69,
      manCoverage: 74,
    });
  });

  it('aligns detail panel data with the focused table row', () => {
    const { detailPanel } = fixture.expected;

    expect(detailPanel.displayName).toBe('DEMARQUIS BIGGUMS');
    expect(detailPanel.lastName).toBe('Biggums');
    expect(detailPanel.position).toBe('CB');
    expect(detailPanel.jerseyNumber).toBe(2);
    expect(detailPanel.ratings.overall).toBe(76);
    expect(detailPanel.archetype).toBe('Boundary');
    expect(detailPanel.developmentTrait).toBe('Star');
    expect(detailPanel.abilities).toEqual([
      { name: 'Quick Jump', type: 'physical' },
      { name: 'Road Dog', type: 'mental' },
    ]);
  });

  it('defines table columns that map to existing rating codes', () => {
    const codes = fixture.meta.table.columns
      .map((column) => column.ratingCode)
      .filter((code): code is string => Boolean(code));

    expect(codes).toEqual(['SPD', 'ACC', 'AGI', 'COD', 'STR', 'AWR', 'PRC', 'MCV']);
  });
});
