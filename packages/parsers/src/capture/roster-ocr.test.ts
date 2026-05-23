import { describe, expect, it } from 'vitest';
import { buildRosterCaptureExpectedFromOcr, mergeRosterRows, parseRosterRowsFromOcrText } from './roster-ocr.js';

describe('roster OCR parsing', () => {
  it('parses roster table lines with class and overall', () => {
    const text = ['J.Braxton JR CB 87', 'D.Biggums FR CB 76 SPD 93 ACC 93'].join('\n');
    const rows = parseRosterRowsFromOcrText(text, 'CB');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.displayName).toBe('J.Braxton');
    expect(rows[1]?.ratings.speed).toBe(93);
  });

  it('merges duplicate players by name and position', () => {
    const { rows, warnings } = mergeRosterRows([
      [{ index: 0, displayName: 'J.Braxton', position: 'CB', ratings: { overall: 87 } }],
      [{ index: 0, displayName: 'J.Braxton', position: 'CB', ratings: { overall: 88 } }],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ratings.overall).toBe(88);
    expect(warnings).toEqual([]);
  });

  it('dedupes near-match OCR names for the same player', () => {
    const { rows } = mergeRosterRows([
      [{ index: 0, displayName: 'S.Terrell', classYear: 'FR', position: 'HB', ratings: { overall: 81, carry: 87 } }],
      [{ index: 0, displayName: 'S.Teirell', classYear: 'FR', position: 'HB', ratings: { overall: 81, ballCarrierVision: 72 } }],
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.displayName).toBe('S.Terrell');
    expect(rows[0]?.ratings).toMatchObject({
      carry: 87,
      ballCarrierVision: 72,
    });
  });

  it('parses roster OCR token streams with redshirt classes and rating columns', () => {
    const text = [
      '[[OCR_REGION:roster_table]] RS NAME YEAR POS *OVR SPD ACC AGI CoD STR AWR THP SAC',
      'L.Melvin JR(RS) QB 84 84 85 95 85 60 77 95 87',
      'C.Brock SO (RS) QB 79+ 89 90 89 86 63 A 85 59',
      'E.Fasano FR (RS) QB 70~ 79 87 87 83 58 57 90 76',
    ].join(' ');

    const rows = parseRosterRowsFromOcrText(text, 'QB');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      displayName: 'L.Melvin',
      classYear: 'JR (RS)',
      position: 'QB',
      ratings: {
        overall: 84,
        speed: 84,
        acceleration: 85,
        throwPower: 95,
        shortAccuracy: 87,
      },
    });
    expect(rows[1]).toMatchObject({
      displayName: 'C.Brock',
      classYear: 'SO (RS)',
      ratings: {
        overall: 79,
        awareness: 71,
      },
    });
  });

  it('parses highlighted selected-row OCR text for tight ends', () => {
    const text = [
      '[[OCR_REGION:roster_selected_row]] RS NAME YEAR POS *OVR SPD ACC AGI CoD STR AWR CTH CIT',
      'K.Fatinikun JR(RS) TE 90 85 87 86 79 79 79 87 80',
      '[[OCR_REGION:roster_table]] RS NAME YEAR POS *OVR SPD ACC AGI CoD STR AWR CTH CIT',
      'M.Cobb JR TE 84 85 87 90 79 72 73 86 84',
      'D.Maijeh JR (RS) TE 74 73 74 71 72 76 76 77 72',
      'N.Woodside SO TE 72 86 83 80 78 65 66 84 81',
    ].join(' ');

    const { expected } = buildRosterCaptureExpectedFromOcr(
      [{ imagePath: 'roster-te.png', text, words: [], confidence: 90 }],
      { teamKey: 'iowa', teamName: 'Iowa', selectedPosition: 'TE' }
    );

    expect(expected.table.rows).toHaveLength(4);
    expect(expected.table.rows.some((row) => row.displayName === 'K.Fatinikun')).toBe(true);
    const fatinikun = expected.table.rows.find((row) => row.displayName === 'K.Fatinikun');
    expect(fatinikun?.ratings.overall).toBe(90);
    expect(fatinikun?.focused).toBe(true);
  });

  it('uses offensive position rating groups for backs, receivers, and linemen', () => {
    const hbRows = parseRosterRowsFromOcrText(
      'S.Hurley SO HB 85 92 87 92 88 81 74 92 77',
      'HB'
    );
    expect(hbRows[0]?.ratings).toMatchObject({
      overall: 85,
      carry: 92,
      ballCarrierVision: 77,
    });

    const wrRows = parseRosterRowsFromOcrText(
      'M.Python JR(RS) WR 90 93 96 89 82 67 84 88 95',
      'WR'
    );
    expect(wrRows[0]?.ratings).toMatchObject({
      catching: 88,
      catchInTraffic: 95,
    });

    const lineRows = parseRosterRowsFromOcrText(
      'M.Money SR (RS) RG 88 65 84 89 73 92 83 83 87',
      'RG'
    );
    expect(lineRows[0]?.ratings).toMatchObject({
      passBlock: 83,
      passBlockPower: 87,
    });
  });

  it('uses defensive position rating groups for linebackers, defensive backs, and linemen', () => {
    const linebackerRows = parseRosterRowsFromOcrText(
      'K.Bulaga FR WILL 82 81 89 77 81 81 76 78 79',
      'WILL'
    );
    expect(linebackerRows[0]?.ratings).toMatchObject({
      overall: 82,
      playRecognition: 78,
      tackle: 79,
    });
    expect(linebackerRows[0]?.ratings.throwPower).toBeUndefined();

    const dbRows = parseRosterRowsFromOcrText(
      'J.Cross SR (RS) FS 85 91 88 86 84 65 79 75 83',
      'FS'
    );
    expect(dbRows[0]?.ratings).toMatchObject({
      playRecognition: 75,
      manCoverage: 83,
    });

    const edgeRows = parseRosterRowsFromOcrText(
      'A.Carlyle SO (RS) REDG 81 85 87 81 67 86 80 66 76',
      'REDG'
    );
    expect(edgeRows[0]?.ratings).toMatchObject({
      playRecognition: 66,
      powerMoves: 76,
    });
  });

  it('normalizes noisy roster positions and removes fallback-position duplicates', () => {
    const ledgRows = parseRosterRowsFromOcrText(
      'M.Sharga SR(RS) EOS 91 73 84 73 66 92 91 87 88',
      'ATH'
    );
    expect(ledgRows[0]?.position).toBe('LEDG');

    const { rows } = mergeRosterRows([
      [
        { index: 0, displayName: 'M.Haywood', position: 'ATH', ratings: { overall: 76, speed: 87 } },
        { index: 1, displayName: 'M.Haywood', position: 'CB', ratings: { overall: 76, manCoverage: 71 } },
      ],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      displayName: 'M.Haywood',
      position: 'CB',
      ratings: {
        overall: 76,
        manCoverage: 71,
      },
    });
  });

  it('uses special-teams rating groups for kickers and punters', () => {
    const kickerRows = parseRosterRowsFromOcrText(
      'B.Wentz FR K 78 70 85 85 67 46 47 68 33',
      'K'
    );
    expect(kickerRows[0]?.ratings).toMatchObject({
      overall: 78,
      awareness: 70,
      kickPower: 85,
      kickAccuracy: 85,
      speed: 67,
      tackle: 46,
      hitPower: 47,
      acceleration: 68,
      pursuit: 33,
    });

    const punterRows = parseRosterRowsFromOcrText(
      'M.Shudak FR P 78 86 85 68 48 70 41 70 28',
      'P'
    );
    expect(punterRows[0]?.ratings).toMatchObject({
      kickPower: 86,
      kickAccuracy: 85,
      awareness: 70,
      hitPower: 41,
      pursuit: 28,
    });

    const noisyPunterRows = parseRosterRowsFromOcrText(
      'M.Shudak FR P 78 86 85 68 48 70 4 70 28',
      'P'
    );
    expect(noisyPunterRows[0]?.ratings.hitPower).toBe(41);
  });

  it('keeps rating columns aligned when OCR misses an offensive rating token', () => {
    const rows = parseRosterRowsFromOcrText(
      'T.Salaam FR C 78 68 Ra Sy 52 90 68 72 60',
      'C'
    );

    expect(rows[0]?.ratings).toMatchObject({
      overall: 78,
      speed: 68,
      changeOfDirection: 52,
      strength: 90,
      awareness: 68,
      passBlock: 72,
      passBlockPower: 60,
    });
    expect(rows[0]?.ratings.acceleration).toBeUndefined();
    expect(rows[0]?.ratings.agility).toBeUndefined();
  });

  it('parses separated first-initial names and common class OCR mistakes', () => {
    const rows = parseRosterRowsFromOcrText(
      'S. Hurley 50 HB 85 92 87 92 88 81 74 92 77',
      'HB'
    );

    expect(rows[0]).toMatchObject({
      displayName: 'S.Hurley',
      classYear: 'SO',
      position: 'HB',
      ratings: {
        carry: 92,
        ballCarrierVision: 77,
      },
    });
  });
});
