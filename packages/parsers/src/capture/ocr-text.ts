/** Normalize OCR output for line-based table parsing. */
export function normalizeOcrText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ocrTextToLines(text: string): string[] {
  const normalized = normalizeOcrText(text);
  const byNewline = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (byNewline.length > 1) return byNewline;

  return normalized
    .split(/\s{2,}/)
    .map((line) => line.trim())
    .filter((line) => line.length > 2);
}

export function parseRecord(value: string): { wins: number; losses: number } | undefined {
  const match = value.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
  if (!match) return undefined;
  return { wins: Number(match[1]), losses: Number(match[2]) };
}

export function parseClassYear(token: string): string | undefined {
  const upper = token.toUpperCase();
  if (/^RS_(FR|SO|JR|SR)$/.test(upper)) return upper;
  if (['FR', 'SO', 'JR', 'SR'].includes(upper)) return upper;
  return undefined;
}
