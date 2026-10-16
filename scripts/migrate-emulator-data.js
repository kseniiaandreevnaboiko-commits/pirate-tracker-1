'use strict';

const { readFileSync } = require('node:fs');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, writeBatch } = require('firebase/firestore');
const { transformLegacyData } = require('./migration-core.js');

const host = process.env.FIRESTORE_EMULATOR_HOST || '';
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Миграция разрешена только при FIRESTORE_EMULATOR_HOST=127.0.0.1:<порт>.');
const projectId = process.env.GCLOUD_PROJECT || 'demo-pirate-auth';
if (!projectId.startsWith('demo-')) throw new Error('Защита остановила запуск: projectId должен начинаться с demo-.');

const sample = { classes: [{ id: 'sample-class', name: 'Тестовый класс', currentSeasonId: 'sample-season', seasons: [{ id: 'sample-season', startedAt: new Date().toISOString() }], students: [{ id: 'sample-student', name: 'Тестовый ученик', balance: 50, lifetimeEarned: 50, achievements: ['first_coin', 'balance_50'] }], transactions: [], rewards: [{ id: 'sample-reward', name: 'Тестовая награда', category: 'privilege', price: 10, limit: 1 }], requests: [], achievements: [] }] };
const inputArg = process.argv.find(value => value.startsWith('--input='));
const source = inputArg ? JSON.parse(readFileSync(inputArg.slice(8), 'utf8')) : sample;
const result = transformLegacyData(source, process.env.MIGRATION_TEACHER_UID || 'emulator-teacher');

(async () => {
  const environment = await initializeTestEnvironment({ projectId });
  try {
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      for (let offset = 0; offset < result.writes.length; offset += 400) {
        const batch = writeBatch(db);
        result.writes.slice(offset, offset + 400).forEach(write => batch.set(doc(db, write.path), write.data));
        await batch.commit();
      }
    });
    console.log(JSON.stringify({ emulator: host, projectId, ...result.summary, discrepancies: result.discrepancies }, null, 2));
  } finally { await environment.cleanup(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
