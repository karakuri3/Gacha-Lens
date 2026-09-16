import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflowPath = '.github/workflows/gacha-other-data-bulk-recovery-once.yml';
const markerPath = '.github/ops/gacha-other-data-bulk-recovery-20260917.token';
const workflow = fs.readFileSync(workflowPath, 'utf8');
const marker = fs.readFileSync(markerPath, 'utf8').trim();

test('other-data recovery is a one-time main-push workflow with an exact marker', () => {
  assert.equal(marker, 'APPROVE_GACHA_OTHER_DATA_BULK_RECOVERY_20260917');
  assert.match(workflow, /push:/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /gacha-other-data-bulk-recovery-20260917\.token/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
});

test('official recovery has enough bounded capacity for the current provisional backlog', () => {
  assert.match(workflow, /OFFICIAL_DETAIL_FETCH_LIMIT: 500/);
  assert.match(workflow, /OFFICIAL_DETAIL_FETCH_DELAY_MS: 200/);
  assert.match(workflow, /seq 1 16/);
  assert.match(workflow, /npm run ingest:official/);
});

test('stock and social lanes only use preconfigured sources and never force X paid access on', () => {
  assert.match(workflow, /STOCK_RAW_FEED_SOURCES_JSON: \$\{\{ secrets\.STOCK_RAW_FEED_SOURCES_JSON \}\}/);
  assert.match(workflow, /X_FETCH_ENABLED: \$\{\{ secrets\.X_FETCH_ENABLED \}\}/);
  assert.match(workflow, /No approved stock\/restock feed or enabled stock X search is configured/);
  assert.match(workflow, /No reviewed X feed or pre-enabled X API lane is configured/);
  assert.doesNotMatch(workflow, /X_FETCH_ENABLED: true/);
});

test('recovery records before and after counts for reviewable postflight', () => {
  for (const table of ['series', 'variants', 'stock_reports', 'restock_events', 'x_reactions', 'import_issues']) {
    assert.match(workflow, new RegExp(table));
  }
  assert.match(workflow, /summary\.json/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});
