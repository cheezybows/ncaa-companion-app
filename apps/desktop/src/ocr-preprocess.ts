import sharp from 'sharp';
import type { CaptureScreenKind } from '@ncaa/parsers';

export type OcrPreprocessRegion =
  | 'full'
  | 'top25_table'
  | 'top25_team_card'
  | 'top25_precropped'
  | 'schedule_selected_row'
  | 'schedule_table'
  | 'schedule_precropped'
  | 'roster_selected_row'
  | 'roster_table'
  | 'roster_table_threshold'
  | 'roster_player_card'
  | 'roster_precropped';

export interface OcrPreprocessResult {
  regions: OcrPreprocessRegion[];
  /** PNG buffers in the same order as `regions`. */
  images: Buffer[];
}

/** Full game screenshots are usually wide (e.g. 1024x579). Pre-cropped table strips are narrower/taller. */
export function isLikelyPreCroppedTop25Table(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const aspect = width / height;
  return width < 900 || aspect < 1.1;
}

/** Calibrated from top25-1.png (2560x1440) vs top25-1-cropped.PNG (801x954). */
const TOP25_TABLE_CROP = {
  left: 95 / 2560,
  top: 323 / 1440,
  width: 801 / 2560,
  height: 954 / 1440,
} as const;

function top25TableCrop(width: number, height: number): sharp.Region {
  return {
    left: Math.round(width * TOP25_TABLE_CROP.left),
    top: Math.round(height * TOP25_TABLE_CROP.top),
    width: Math.round(width * TOP25_TABLE_CROP.width),
    height: Math.round(height * TOP25_TABLE_CROP.height),
  };
}

function top25TeamCardCrop(width: number, height: number): sharp.Region {
  return {
    left: Math.round(width * 0.6),
    top: Math.round(height * 0.12),
    width: Math.round(width * 0.38),
    height: Math.round(height * 0.5),
  };
}

/** Calibrated from schedule-1.png (2560x1440) vs schedule-1-cropped.PNG (1183x807). */
const SCHEDULE_TABLE_CROP = {
  left: 95 / 2560,
  top: 526 / 1440,
  width: 1183 / 2560,
  height: 807 / 1440,
} as const;

function scheduleTableCrop(width: number, height: number): sharp.Region {
  return {
    left: Math.round(width * SCHEDULE_TABLE_CROP.left),
    top: Math.round(height * SCHEDULE_TABLE_CROP.top),
    width: Math.round(width * SCHEDULE_TABLE_CROP.width),
    height: Math.round(height * SCHEDULE_TABLE_CROP.height),
  };
}

function scheduleSelectedRowCrop(tableCrop: sharp.Region): sharp.Region {
  return {
    ...tableCrop,
    top: tableCrop.top + Math.round(tableCrop.height * 0.07),
    height: Math.max(1, Math.round(tableCrop.height * 0.12)),
  };
}

/** Calibrated from roster-qb.png (2560x1440) vs roster-qb-cropped.PNG (1779x805). */
const ROSTER_TABLE_CROP = {
  left: 91 / 2560,
  top: 530 / 1440,
  width: 1779 / 2560,
  height: 805 / 1440,
} as const;

function rosterTableCrop(width: number, height: number): sharp.Region {
  return {
    left: Math.round(width * ROSTER_TABLE_CROP.left),
    top: Math.round(height * ROSTER_TABLE_CROP.top),
    width: Math.round(width * ROSTER_TABLE_CROP.width),
    height: Math.round(height * ROSTER_TABLE_CROP.height),
  };
}

function rosterSelectedRowCrop(tableCrop: sharp.Region): sharp.Region {
  return {
    ...tableCrop,
    height: Math.max(1, Math.round(tableCrop.height * 0.21)),
  };
}

function rosterPlayerCardCrop(width: number, height: number): sharp.Region {
  return {
    left: Math.round(width * 0.72),
    top: Math.round(height * 0.12),
    width: Math.round(width * 0.25),
    height: Math.round(height * 0.45),
  };
}

function isLikelyPreCroppedRosterTable(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  return width / height > 2;
}

function preCroppedTop25TableCrop(width: number, height: number): sharp.Region {
  return {
    left: 0,
    top: 0,
    width,
    height,
  };
}

async function enhanceRegion(input: Buffer, crop: sharp.Region, scale = 2, minWidth = 640): Promise<Buffer> {
  return sharp(input)
    .extract(crop)
    .grayscale()
    .normalize()
    .resize({ width: Math.max(crop.width * scale, minWidth) })
    .png()
    .toBuffer();
}

/** Highlighted roster rows use a lighter background; darken before OCR so names/ratings read reliably. */
async function enhanceRosterSelectedRow(
  input: Buffer,
  crop: sharp.Region,
  scale = 2,
  minWidth = 1800
): Promise<Buffer> {
  return sharp(input)
    .extract(crop)
    .grayscale()
    .modulate({ brightness: 0.7 })
    .linear(2, -80)
    .normalize()
    .resize({ width: Math.max(crop.width * scale, minWidth) })
    .png()
    .toBuffer();
}

async function enhanceScheduleSelectedRow(input: Buffer, crop: sharp.Region): Promise<Buffer> {
  return sharp(input)
    .extract(crop)
    .grayscale()
    .modulate({ brightness: 0.7 })
    .linear(2, -80)
    .normalize()
    .resize({ width: Math.max(crop.width * 3, 1600) })
    .png()
    .toBuffer();
}

async function enhanceRosterTableThreshold(input: Buffer, crop: sharp.Region): Promise<Buffer> {
  return sharp(input)
    .extract(crop)
    .grayscale()
    .normalize()
    .threshold(160)
    .resize({ width: Math.max(crop.width * 2, 1500) })
    .png()
    .toBuffer();
}

async function preprocessScheduleForOcr(raw: Buffer, width: number, height: number): Promise<OcrPreprocessResult> {
  if (isLikelyPreCroppedTop25Table(width, height)) {
    const tableCrop = preCroppedTop25TableCrop(width, height);
    const [selectedRow, table] = await Promise.all([
      enhanceScheduleSelectedRow(raw, scheduleSelectedRowCrop(tableCrop)),
      enhanceRegion(raw, tableCrop, 2, 1100),
    ]);
    return {
      regions: ['schedule_selected_row', 'schedule_precropped'],
      images: [selectedRow, table],
    };
  }

  const tableCrop = scheduleTableCrop(width, height);
  const [selectedRow, table] = await Promise.all([
    enhanceScheduleSelectedRow(raw, scheduleSelectedRowCrop(tableCrop)),
    enhanceRegion(raw, tableCrop, 2, 1200),
  ]);
  return {
    regions: ['schedule_selected_row', 'schedule_table'],
    images: [selectedRow, table],
  };
}

async function preprocessRosterForOcr(raw: Buffer, width: number, height: number): Promise<OcrPreprocessResult> {
  if (isLikelyPreCroppedRosterTable(width, height)) {
    const tableCrop = preCroppedTop25TableCrop(width, height);
    const [selectedRow, table, thresholdTable] = await Promise.all([
      enhanceRosterSelectedRow(raw, rosterSelectedRowCrop(tableCrop)),
      enhanceRegion(raw, tableCrop, 2, 1400),
      enhanceRosterTableThreshold(raw, tableCrop),
    ]);
    return {
      regions: ['roster_selected_row', 'roster_precropped', 'roster_table_threshold'],
      images: [selectedRow, table, thresholdTable],
    };
  }

  const tableCrop = rosterTableCrop(width, height);
  const [selectedRow, table, thresholdTable, playerCard] = await Promise.all([
    enhanceRosterSelectedRow(raw, rosterSelectedRowCrop(tableCrop)),
    enhanceRegion(raw, tableCrop, 2, 1500),
    enhanceRosterTableThreshold(raw, tableCrop),
    enhanceRegion(raw, rosterPlayerCardCrop(width, height), 3, 800),
  ]);
  return {
    regions: ['roster_selected_row', 'roster_table', 'roster_table_threshold', 'roster_player_card'],
    images: [selectedRow, table, thresholdTable, playerCard],
  };
}

export async function preprocessScreenshotForOcr(
  imagePath: string,
  screenKind?: CaptureScreenKind
): Promise<OcrPreprocessResult> {
  if (screenKind !== 'top25_rankings' && screenKind !== 'team_schedule' && screenKind !== 'roster_by_position') {
    const full = await sharp(imagePath).png().toBuffer();
    return { regions: ['full'], images: [full] };
  }

  const source = sharp(imagePath);
  const metadata = await source.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    const full = await source.png().toBuffer();
    return { regions: ['full'], images: [full] };
  }

  const raw = await source.toBuffer();

  if (screenKind === 'team_schedule') {
    return preprocessScheduleForOcr(raw, width, height);
  }

  if (screenKind === 'roster_by_position') {
    return preprocessRosterForOcr(raw, width, height);
  }

  if (isLikelyPreCroppedTop25Table(width, height)) {
    const crop = preCroppedTop25TableCrop(width, height);
    const table = await enhanceRegion(raw, crop, 2, 960);
    return {
      regions: ['top25_precropped'],
      images: [table],
    };
  }

  const tableCrop = top25TableCrop(width, height);
  const cardCrop = top25TeamCardCrop(width, height);

  const [table, card] = await Promise.all([
    enhanceRegion(raw, tableCrop, 2, 900),
    enhanceRegion(raw, cardCrop, 2, 480),
  ]);

  return {
    regions: ['top25_table', 'top25_team_card'],
    images: [table, card],
  };
}
