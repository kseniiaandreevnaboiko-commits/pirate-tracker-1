const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');
const { WRITE_CONFIRMATION } = require('../scripts/production-migration-safety.js');

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let environment;
const temporary = mkdtempSync(join(tmpdir(), 'finzozh-production-tool-'));
after(async () => {
  if (environment) await environment.cleanup();
  const resolved = resolve(temporary);
  if (resolved.startsWith(resolve(tmpdir()))) rmSync(resolved, { recursive: true, force: true });
});

function run(command, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, ['scripts/production-data-tool.js', command, ...args], {
    cwd: resolve(__dirname, '..'), encoding: 'utf8',
    env: { ...process.env, ...extraEnv }
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test('backup, dry-run, guarded apply, and verification preserve trackerApps/main', { skip: !emulatorAvailable }, async () => {
  const projectId = 'tracker-progress-2b682';
  const teacherUid = 'existing-teacher-uid';
  environment = await initializeTestEnvironment({ projectId });
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'authorizedTeachers', teacherUid), { active: true });
    await setDoc(doc(db, 'trackerApps', 'main'), { schemaVersion: 1, state: { classes: [{
      id: 'same-app-class', name: 'Existing class', currentSeasonId: 'course-2026',
      seasons: [{ id: 'course-2026', startedAt: '2026-09-01T00:00:00.000Z' }],
      students: [{ id: 'same-student', name: 'Ada', balance: 250, lifetimeEarned: 350, achievements: ['first_coin', 'balance_50', 'balance_100', 'balance_300'] }],
      transactions: [], rewards: [], requests: [], achievements: []
    }] } });
  });

  const backupPath = join(temporary, 'backup.json');
  const planPath = join(temporary, 'plan.json');
  run('backup', [`--project=${projectId}`, `--teacher-uid=${teacherUid}`, `--output=${backupPath}`]);
  run('plan', [`--project=${projectId}`, `--input=${backupPath}`, `--output=${planPath}`]);
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));

  const rejected = spawnSync(process.execPath, ['scripts/production-data-tool.js', 'apply', `--project=${projectId}`, `--input=${planPath}`], {
    cwd: resolve(__dirname, '..'), encoding: 'utf8', env: process.env
  });
  assert.notEqual(rejected.status, 0);

  run('apply', [
    `--project=${projectId}`, `--confirm-project=${projectId}`, `--confirm-source-sha=${plan.sourceSha256}`,
    `--input=${planPath}`, '--execute'
  ], { PIRATE_PRODUCTION_WRITE_CONFIRMATION: WRITE_CONFIRMATION });
  run('verify', [`--project=${projectId}`, `--input=${planPath}`]);

  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    assert.equal((await getDoc(doc(db, 'trackerApps', 'main'))).exists(), true);
    assert.equal((await getDoc(doc(db, 'classes', 'same-app-class', 'students', 'same-student'))).data().lifetimeEarned, 350);
  });
});
