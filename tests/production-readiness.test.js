const { test } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../firebase-config.js');
const safety = require('../scripts/production-migration-safety.js');

test('production config keeps the existing Firebase project and URL mode', () => {
  const runtime = config.forLocation({ hostname: 'kseniiaandreevnaboiko-commits.github.io', search: '' });
  assert.equal(runtime.useEmulators, false);
  assert.equal(runtime.projectId, 'tracker-progress-2b682');
  assert.equal(runtime.firebase.projectId, 'tracker-progress-2b682');
});

test('emulators can only be selected explicitly on localhost', () => {
  assert.equal(config.forLocation({ hostname: '127.0.0.1', search: '?emulator=1' }).useEmulators, true);
  assert.equal(config.forLocation({ hostname: 'example.com', search: '?emulator=1' }).useEmulators, false);
  assert.equal(config.forLocation({ hostname: 'localhost', search: '' }).useEmulators, false);
});

test('backup checksum detects any legacy-data change', () => {
  const source = { state: { classes: [] }, schemaVersion: 1 };
  const backup = { format: 'finzozh-legacy-backup-v1', projectId: safety.PRODUCTION_PROJECT_ID, sourcePath: 'trackerApps/main', source, sourceSha256: safety.sha256(source) };
  assert.equal(safety.verifyBackup(backup), true);
  backup.source.state.classes.push({ id: 'changed' });
  assert.throws(() => safety.verifyBackup(backup), /Контрольная сумма/);
});

test('production write requires every independent confirmation', () => {
  const valid = {
    projectId: safety.PRODUCTION_PROJECT_ID, confirmProject: safety.PRODUCTION_PROJECT_ID,
    sourceSha: 'abc', confirmSourceSha: 'abc', execute: true,
    envConfirmation: safety.WRITE_CONFIRMATION
  };
  assert.equal(safety.assertProductionWrite(valid), true);
  for (const key of ['confirmProject', 'confirmSourceSha', 'execute', 'envConfirmation']) {
    assert.throws(() => safety.assertProductionWrite({ ...valid, [key]: key === 'execute' ? false : 'wrong' }));
  }
});
