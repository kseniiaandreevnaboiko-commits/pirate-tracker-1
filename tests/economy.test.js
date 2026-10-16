const assert = require('node:assert/strict');
const economy = require('../economy.js');

assert.deepEqual(economy.RANKS.map(rank => rank.min), [0, 50, 120, 220, 340, 570]);

const cls = { id: 'class-1', currentSeasonId: 'season-1', seasons: [{ id: 'season-1', startedAt: '2026-09-01T00:00:00.000Z' }], transactions: [] };
const student = { id: 'student-1', balance: 0, fincoins_balance: 0, lifetimeEarned: 0 };
cls.students = [student];
let sequence = 0;
const apply = input => economy.applyTransaction(student, cls, {
  id: `txn-${++sequence}`,
  timestamp: `2026-10-15T10:00:0${sequence}.000Z`,
  ...input
});

apply({ balanceDelta: 350, lifetimeDelta: 350, category: 'earning' });
assert.equal(economy.getBalance(student), 350);
assert.equal(economy.getLifetimeEarned(student), 350);
assert.equal(economy.getRank(student.lifetimeEarned).name, 'Адмирал');

apply({ balanceDelta: -100, lifetimeDelta: 0, category: 'purchase', idempotencyKey: 'purchase:req-1' });
assert.equal(economy.getBalance(student), 250);
assert.equal(economy.getLifetimeEarned(student), 350);
assert.equal(economy.getRank(student.lifetimeEarned).name, 'Адмирал');

const repeatedPurchase = apply({ balanceDelta: -100, lifetimeDelta: 0, category: 'purchase', idempotencyKey: 'purchase:req-1' });
assert.equal(repeatedPurchase.duplicate, true);
assert.equal(economy.getBalance(student), 250);
assert.equal(cls.transactions.filter(transaction => transaction.idempotencyKey === 'purchase:req-1').length, 1);

apply({ balanceDelta: 220, lifetimeDelta: 220, category: 'earning' });
assert.equal(economy.getLifetimeEarned(student), 570);
assert.equal(economy.getRank(student.lifetimeEarned).name, 'Король пиратов');

apply({ balanceDelta: 25, lifetimeDelta: 25, category: 'achievement_bonus', idempotencyKey: 'achievement:a1:student-1' });
assert.equal(economy.getBalance(student), 495);
assert.equal(economy.getLifetimeEarned(student), 595);
const repeatedAchievementBonus = apply({ balanceDelta: 25, lifetimeDelta: 25, category: 'achievement_bonus', idempotencyKey: 'achievement:a1:student-1' });
assert.equal(repeatedAchievementBonus.duplicate, true);
assert.equal(economy.getBalance(student), 495);
assert.equal(economy.getLifetimeEarned(student), 595);

apply({ balanceDelta: 5, lifetimeDelta: 0, category: 'balance_correction' });
assert.equal(economy.getBalance(student), 500);
assert.equal(economy.getLifetimeEarned(student), 595);

apply({ balanceDelta: -20, lifetimeDelta: -20, category: 'earning_correction' });
assert.equal(economy.getBalance(student), 480);
assert.equal(economy.getLifetimeEarned(student), 575);

const serialized = JSON.parse(JSON.stringify({ classes: [{ ...cls, students: [student] }] }));
assert.equal(serialized.classes[0].students[0].balance, 480);
assert.equal(serialized.classes[0].students[0].lifetimeEarned, 575);

const legacy = {
  classes: [{ id: 'legacy', createdAt: '2025-09-01', transactions: [
    { student_id: 'old', amount: 100 },
    { student_id: 'old', amount: -40 },
    { student_id: 'old', amount: 20 }
  ], students: [{ id: 'old', fincoins_balance: 80 }] }]
};
const legacyTransactionsBefore = JSON.stringify(legacy.classes[0].transactions);
assert.equal(economy.migrateData(legacy), true);
assert.equal(legacy.classes[0].students[0].balance, 80);
assert.equal(legacy.classes[0].students[0].lifetimeEarned, 120);
assert.equal(JSON.stringify(legacy.classes[0].transactions), legacyTransactionsBefore);
assert.equal(economy.migrateData(legacy), false);

const unresolvedLegacy = {
  classes: [{ id: 'legacy-reset', transactions: [
    { student_id: 'old-reset', amount: 100 },
    { student_id: 'old-reset', amount: -20 }
  ], students: [{ id: 'old-reset', fincoins_balance: 10 }] }]
};
economy.migrateData(unresolvedLegacy);
assert.equal(unresolvedLegacy.classes[0].students[0].lifetimeEarned, 0);
assert.equal(unresolvedLegacy.classes[0].students[0].economyMigration.needsReview, true);
assert.equal(unresolvedLegacy.classes[0].students[0].economyMigration.suggestedLifetimeEarned, 100);
economy.applyTransaction(unresolvedLegacy.classes[0].students[0], unresolvedLegacy.classes[0], {
  id: 'migration-correction',
  balanceDelta: 0,
  lifetimeDelta: 60,
  category: 'lifetime_correction',
  timestamp: '2026-10-15T12:00:00.000Z'
});
assert.equal(unresolvedLegacy.classes[0].students[0].balance, 10);
assert.equal(unresolvedLegacy.classes[0].students[0].lifetimeEarned, 60);
assert.equal(unresolvedLegacy.classes[0].students[0].economyMigration.needsReview, false);

const insufficient = economy.applyTransaction(student, cls, {
  id: 'txn-insufficient',
  balanceDelta: -1000,
  lifetimeDelta: 0,
  category: 'purchase',
  timestamp: '2026-10-15T11:00:00.000Z'
});
assert.equal(insufficient.ok, false);
assert.equal(economy.getBalance(student), 480);

const achievementsBeforeSeason = ['first_coin', 'manual_a1'];
student.achievements = [...achievementsBeforeSeason];
const transactionCountBeforeSeason = cls.transactions.length;
assert.equal(economy.startNewSeason(cls, 'season-2', '2026-10-16T00:00:00.000Z').ok, true);
assert.equal(economy.getBalance(student), 0);
assert.equal(economy.getLifetimeEarned(student), 0);
assert.deepEqual(student.achievements, achievementsBeforeSeason);
assert.equal(cls.transactions.length, transactionCountBeforeSeason);
assert.equal(cls.seasons.at(-1).id, 'season-2');
assert.equal(cls.seasons[0].studentSummary[0].lifetimeEarned, 575);

console.log('Economy tests passed');
