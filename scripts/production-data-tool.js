'use strict';

const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const { applicationDefault, deleteApp, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { transformLegacyData } = require('./migration-core.js');
const {
  PRODUCTION_PROJECT_ID, assertProductionWrite, sha256, stable, verifyBackup
} = require('./production-migration-safety.js');

const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const match = value.match(/^--([^=]+)(?:=(.*))?$/);
  return match ? [match[1], match[2] ?? true] : [value, true];
}));
const command = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '';
const projectId = String(args.project || process.env.GCLOUD_PROJECT || '');
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || '';
let adminApp = null;

function requirePath(name) {
  if (!args[name] || args[name] === true) throw new Error(`Требуется --${name}=<путь>.`);
  return resolve(String(args[name]));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
}

function database() {
  if (!projectId) throw new Error('Требуется --project=<project-id>.');
  if (emulatorHost && !/^(127\.0\.0\.1|localhost):\d+$/.test(emulatorHost)) throw new Error('Разрешён только локальный FIRESTORE_EMULATOR_HOST.');
  if (!emulatorHost && projectId !== PRODUCTION_PROJECT_ID) throw new Error(`Production-инструмент привязан только к ${PRODUCTION_PROJECT_ID}.`);
  adminApp = getApps()[0] || initializeApp(emulatorHost ? { projectId } : { credential: applicationDefault(), projectId });
  return getFirestore(adminApp);
}

async function backup() {
  const output = requirePath('output');
  const teacherUid = String(args['teacher-uid'] || '');
  if (!teacherUid) throw new Error('Требуется --teacher-uid=<uid>.');
  const db = database();
  const [sourceSnapshot, teacherSnapshot] = await Promise.all([
    db.doc('trackerApps/main').get(), db.doc(`authorizedTeachers/${teacherUid}`).get()
  ]);
  if (!sourceSnapshot.exists) throw new Error('Документ trackerApps/main не найден.');
  const source = sourceSnapshot.data();
  const envelope = {
    format: 'finzozh-legacy-backup-v1', projectId, createdAt: new Date().toISOString(),
    sourcePath: 'trackerApps/main', source, sourceSha256: sha256(source),
    teacher: { uid: teacherUid, roleExists: teacherSnapshot.exists, active: teacherSnapshot.data()?.active === true }
  };
  writeJson(output, envelope);
  console.log(JSON.stringify({ mode: 'read-only-backup', output, projectId, sourceSha256: envelope.sourceSha256, teacher: envelope.teacher }, null, 2));
}

async function plan() {
  const input = requirePath('input');
  const output = requirePath('output');
  const backupData = JSON.parse(readFileSync(input, 'utf8'));
  verifyBackup(backupData, projectId || PRODUCTION_PROJECT_ID);
  if (!backupData.teacher?.roleExists || !backupData.teacher.active) throw new Error('Документ authorizedTeachers/{uid} отсутствует или неактивен.');
  const transformed = transformLegacyData(backupData.source.state, backupData.teacher.uid);
  const migrationPlan = {
    format: 'finzozh-migration-plan-v1', projectId: backupData.projectId,
    createdAt: new Date().toISOString(), sourcePath: backupData.sourcePath,
    sourceSha256: backupData.sourceSha256, teacherUid: backupData.teacher.uid,
    summary: transformed.summary, discrepancies: transformed.discrepancies, writes: transformed.writes
  };
  migrationPlan.planSha256 = sha256({ ...migrationPlan, planSha256: undefined });
  writeJson(output, migrationPlan);
  console.log(JSON.stringify({ mode: 'dry-run', output, projectId: migrationPlan.projectId, sourceSha256: migrationPlan.sourceSha256, planSha256: migrationPlan.planSha256, summary: migrationPlan.summary, discrepancies: migrationPlan.discrepancies }, null, 2));
}

function loadPlan() {
  const value = JSON.parse(readFileSync(requirePath('input'), 'utf8'));
  if (value?.format !== 'finzozh-migration-plan-v1') throw new Error('Неверный формат плана миграции.');
  const expected = sha256({ ...value, planSha256: undefined });
  if (value.planSha256 !== expected) throw new Error('Контрольная сумма плана миграции не совпадает.');
  if (value.projectId !== projectId) throw new Error('План относится к другому Firebase-проекту.');
  if (value.discrepancies.length && !args['allow-discrepancies']) throw new Error('В плане есть расхождения; применение остановлено.');
  return value;
}

async function inspectTargets(db, migrationPlan) {
  const snapshots = [];
  for (let offset = 0; offset < migrationPlan.writes.length; offset += 100) {
    snapshots.push(...await db.getAll(...migrationPlan.writes.slice(offset, offset + 100).map(item => db.doc(item.path))));
  }
  const missing = [];
  const matching = [];
  const conflicts = [];
  snapshots.forEach((snapshot, index) => {
    const expected = migrationPlan.writes[index];
    if (!snapshot.exists) missing.push(expected);
    else if (JSON.stringify(stable(snapshot.data())) === JSON.stringify(stable(expected.data))) matching.push(expected.path);
    else conflicts.push(expected.path);
  });
  return { missing, matching, conflicts };
}

async function apply() {
  const migrationPlan = loadPlan();
  assertProductionWrite({
    projectId, confirmProject: args['confirm-project'], sourceSha: migrationPlan.sourceSha256,
    confirmSourceSha: args['confirm-source-sha'], execute: args.execute === true,
    envConfirmation: process.env.PIRATE_PRODUCTION_WRITE_CONFIRMATION
  });
  const db = database();
  const state = await inspectTargets(db, migrationPlan);
  if (state.conflicts.length) throw new Error(`Обнаружены конфликтующие документы (${state.conflicts.length}); запись не выполнена.`);
  for (let offset = 0; offset < state.missing.length; offset += 400) {
    const batch = db.batch();
    state.missing.slice(offset, offset + 400).forEach(item => batch.create(db.doc(item.path), item.data));
    await batch.commit();
  }
  console.log(JSON.stringify({ mode: 'execute', created: state.missing.length, alreadyMatching: state.matching.length, sourcePreserved: 'trackerApps/main' }, null, 2));
}

async function verify() {
  const migrationPlan = loadPlan();
  const state = await inspectTargets(database(), migrationPlan);
  console.log(JSON.stringify({ mode: 'read-only-verify', expected: migrationPlan.writes.length, missing: state.missing.map(item => item.path), conflicts: state.conflicts, matching: state.matching.length }, null, 2));
  if (state.missing.length || state.conflicts.length) process.exitCode = 2;
}

Promise.resolve().then(() => ({ backup, plan, apply, verify }[command] || (() => { throw new Error('Команда: backup, plan, apply или verify.'); }))())
  .catch(error => { console.error(error.message || error); process.exitCode = 1; })
  .finally(async () => { if (adminApp) await deleteApp(adminApp); });
