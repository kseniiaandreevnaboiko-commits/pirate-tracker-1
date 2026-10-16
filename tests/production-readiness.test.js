const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const config = require('../firebase-config.js');
const safety = require('../scripts/production-migration-safety.js');

test('production config keeps the existing Firebase project and URL mode', () => {
  const runtime = config.forLocation({ hostname: 'kseniiaandreevnaboiko-commits.github.io', search: '' });
  assert.equal(runtime.useEmulators, false);
  assert.equal(runtime.studentPinLoginEnabled, true);
  assert.equal(runtime.projectId, 'tracker-progress-2b682');
  assert.equal(runtime.firebase.projectId, 'tracker-progress-2b682');
});

test('emulators can only be selected explicitly on localhost', () => {
  assert.equal(config.forLocation({ hostname: '127.0.0.1', search: '?emulator=1' }).useEmulators, true);
  assert.equal(config.forLocation({ hostname: '127.0.0.1', search: '?emulator=1.' }).useEmulators, true);
  assert.equal(config.forLocation({ hostname: 'example.com', search: '?emulator=1' }).useEmulators, false);
  assert.equal(config.forLocation({ hostname: 'example.com', search: '?emulator=1.' }).useEmulators, false);
  assert.equal(config.forLocation({ hostname: 'localhost', search: '' }).useEmulators, false);
  assert.equal(config.forLocation({ hostname: 'localhost', search: '' }).studentPinLoginEnabled, true);
});

test('production enables PIN login without routing its secondary Auth session to Emulator', () => {
  const source = readFileSync('secure-auth.js', 'utf8');
  assert.match(source, /studentPinLoginEnabled/);
  assert.match(source, /if \(runtime\.useEmulators\) \{\s*authModule\.connectAuthEmulator\(provisioningAuth/);
  assert.match(source, /authModule\.validatePassword\(secondaryAuth, pin\)/);
  assert.doesNotMatch(source, /ПИН доступен только в локальном прототипе/);
});

test('browser runtime files contain no emulator teacher credentials', () => {
  const runtimeFiles = ['index.html', 'firebase-config.js', 'secure-auth.js', 'secure-data.js', 'teacher.js', 'student-dashboard.js'];
  const source = runtimeFiles.map(file => readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /teacher@example\.test|Pirate123|change-this-test-password|Restart-Test/);
});

test('secure pupil login uses avatar selection and a six-digit keypad', () => {
  const source = readFileSync('secure-auth.js', 'utf8');
  assert.match(source, /Выбери своего героя/);
  assert.match(source, /id="secure-student-grid"/);
  assert.match(source, /id="secure-student-keypad"/);
  assert.match(source, /Array\.from\(\{ length: 6 \}/);
  assert.match(source, /enteredPin\.length !== 6/);
  assert.doesNotMatch(source, /id="secure-student-pin"/);
  assert.doesNotMatch(source, /<select id="secure-student-name"/);
});

test('reward shop filters use the same categories as the teacher reward form', () => {
  const source = readFileSync('index.html', 'utf8');
  const categoryBlock = source.match(/const SHOP_CATEGORIES = \[([\s\S]*?)\];/)?.[1] || '';
  assert.match(categoryBlock, /label: 'Вкусняшки'/);
  assert.match(categoryBlock, /label: 'Учёба'/);
  assert.match(categoryBlock, /label: 'Призы'/);
  assert.match(categoryBlock, /label: 'Привилегии'/);
  assert.doesNotMatch(categoryBlock, /Внешний вид|Подсказки/);
  assert.match(source, /return getRewardCategoryUi\(reward && reward\.category\)\.type;/);
});

test('student achievement cards use the same image catalog as the teacher cabin', () => {
  const dashboard = readFileSync('student-dashboard.js', 'utf8');
  const catalog = readFileSync('achievements.js', 'utf8');
  assert.match(dashboard, /a\.iconPath \|\| 'assets\/achievements\/12-star\.webp'/);
  assert.match(dashboard, /class="sd-achievement-icon"/);
  assert.doesNotMatch(dashboard, /safe\(a\.emoji \|\| '★'\)/);
  assert.match(catalog, /iconPath:'assets\/achievements\/03-coins\.webp'/);
  assert.match(catalog, /iconPath:'assets\/achievements\/09-crown\.webp'/);
});

test('archiving a pupil removes the public login card and revokes its binding', () => {
  const source = readFileSync('secure-data.js', 'utf8');
  const archive = source.slice(source.indexOf('async function archiveStudent'), source.indexOf('async function reconcileArchivedStudentCatalogs'));
  assert.match(archive, /studentLoginClasses/);
  assert.match(archive, /active: false/);
  assert.match(archive, /studentBindings/);
  assert.match(source, /if \(session\.role === 'teacher'\) await reconcileArchivedStudentCatalogs\(\);/);
});

test('student PIN keypad keeps enlarged touch targets', () => {
  const source = readFileSync('pin-login.css', 'utf8');
  assert.match(source, /\.pin-student-auth \.pin-keypad button \{ width:48px; height:42px; font-size:18px; \}/);
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
