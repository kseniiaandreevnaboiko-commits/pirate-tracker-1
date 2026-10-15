const { test } = require('node:test');
const assert = require('node:assert/strict');
const { transformLegacyData } = require('../scripts/migration-core.js');

const source = { classes: [{ id: 'c1', name: 'Class', currentSeasonId: 's1', students: [{ id: 'u1', name: 'Ada', balance: 40, achievements: ['manual_a1'], awardedAchievements: [{ achievementId: 'a1', fincoinsSnapshot: 5 }] }], transactions: [{ id: 't1', student_id: 'u1', amount: 50, lifetimeDelta: 50, category: 'earning' }], rewards: [{ id: 'r1', name: 'Map', price: 10 }], requests: [{ id: 'q1', student_id: 'u1', reward_id: 'r1', status: 'approved' }], achievements: [{ id: 'a1', name: 'Helper', fincoins: 5, awarded_to: ['u1'] }] }] };

test('migration preserves class, student, reward, and transaction IDs', () => {
  const result = transformLegacyData(source);
  ['classes/c1', 'classes/c1/students/u1', 'classes/c1/rewards/r1', 'classes/c1/transactions/t1'].forEach(path => assert.ok(result.writes.some(write => write.path === path)));
});

test('migration deduplicates one manual award stored in multiple legacy places', () => {
  const result = transformLegacyData(source);
  assert.equal(result.writes.filter(write => write.path === 'classes/c1/studentAchievements/manual_u1_a1').length, 1);
});

test('migration derives cumulative automatic achievements from lifetimeEarned', () => {
  const result = transformLegacyData(source);
  assert.ok(result.writes.some(write => write.path === 'classes/c1/studentAchievements/auto_u1_first_coin'));
  assert.ok(result.writes.some(write => write.path === 'classes/c1/studentAchievements/auto_u1_balance_50'));
});

test('migration reports an approved request without authoritative purchase transaction', () => {
  const result = transformLegacyData(source);
  assert.ok(result.discrepancies.some(item => item.type === 'approved_request_without_purchase_transaction'));
  assert.equal(result.summary.purchases, 0);
});
