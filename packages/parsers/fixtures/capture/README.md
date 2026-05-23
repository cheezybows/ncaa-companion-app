# Capture Layouts

Universal layout references for OCR/template parser work.

`universal-layouts.json` describes reusable screen structure only: roster columns by position family, schedule columns, Top 25 columns, and detail-panel fields.

## Top 25 golden fixtures (CFP 2026)

| File | Purpose |
|------|---------|
| `top25-cfp-2026-page1.png` | Screenshot ranks 1–14 |
| `top25-cfp-2026-page2.png` | Screenshot ranks 12–25 |
| `top25-cfp-2026-page*.ocr.txt` | Saved Tesseract output after table + team-card preprocessing (regenerate when OCR pipeline changes) |
| `top25-cfp-2026-page*.expected.json` | Typed expected ranks for parser regression tests |
| `top25-cfp-2026.merged.expected.json` | Full 25-team poll after merging both pages |

To refresh OCR text after changing `apps/desktop/src/ocr-preprocess.ts`:

```bash
npm run build:main -w @ncaa/desktop
node --input-type=module -e "
import { recognizeScreenshot, terminateOcrWorker } from './apps/desktop/dist/ocr-service.js';
import { writeFileSync } from 'node:fs';
for (const page of ['page1','page2']) {
  const path = 'packages/parsers/fixtures/capture/top25-cfp-2026-' + page + '.png';
  const result = await recognizeScreenshot(path, { screenKind: 'top25_rankings' });
  writeFileSync('packages/parsers/fixtures/capture/top25-cfp-2026-' + page + '.ocr.txt', result.text);
}
await terminateOcrWorker();
"
```

Do not use universal layout data as an import payload. Team names, player names, ratings, opponents, scores, records, and rankings are upload-specific values and must come from OCR/manual entry for each selected team.
