const assert = require('node:assert/strict');
const achievements = require('../achievements.js');
const economy = require('../economy.js');

assert.deepEqual(
  achievements.AUTO_ACHIEVEMENTS.map(item => [item.id, item.name, item.threshold]),
  [
    ['first_coin', 'Первый финкоин', 1],
    ['balance_50', 'Копилка', 50],
    ['balance_100', 'Состоятельный пират', 100],
    ['balance_300', 'Адмиральские амбиции', 300],
    ['first_purchase', 'Первая покупка', 1],
    ['five_purchases', 'Шоппинг', 5]
  ]
);

const student = { id: 'student-1', balance: 7, lifetimeEarned: 50, achievements: [] };
const cls = { id: 'class-1', students: [student], transactions: [], achievements: [] };

const firstAward = achievements.reconcileStudent(student, cls);
assert.deepEqual(firstAward.map(item => item.id), ['first_coin', 'balance_50']);
assert.deepEqual(student.achievements, ['first_coin', 'balance_50']);
assert.equal(student.balance, 7, 'автоматические достижения не меняют баланс');
assert.equal(student.lifetimeEarned, 50, 'автоматические достижения не меняют общий заработок');

assert.deepEqual(achievements.reconcileStudent(student, cls), [], 'повторная проверка идемпотентна');
assert.equal(new Set(student.achievements).size, student.achievements.length);

student.balance = 0;
assert.deepEqual(achievements.getEligibleAutoIds(student, cls), ['first_coin', 'balance_50'], 'накопительные пороги используют lifetimeEarned, а не баланс');

cls.transactions.push({ id: 'purchase-1', student_id: student.id, type: 'expense', category: 'purchase', description: 'Покупка: Карта' });
assert.deepEqual(achievements.reconcileStudent(student, cls).map(item => item.id), ['first_purchase']);
assert.equal(student.balance, 0, 'покупка не вызывает награду в финкоинах');

for (let index = 2; index <= 5; index += 1) {
  cls.transactions.push({ id: `purchase-${index}`, student_id: student.id, type: 'expense', category: 'purchase', description: `Покупка: Награда ${index}` });
}
assert.deepEqual(achievements.reconcileStudent(student, cls).map(item => item.id), ['five_purchases']);

const serialized = JSON.parse(JSON.stringify({ classes: [cls] }));
assert.equal(achievements.reconcileData(serialized).changed, false, 'перезагрузка не создаёт повторные достижения');

const manual = { id: 'manual-1', name: 'Отважный пират', awarded_to: [student.id, student.id] };
cls.achievements.push(manual);
student.achievements.push('manual_manual-1', 'manual_manual-1');
student.awardedAchievements = [
  { id: 'snapshot-1', achievementId: 'manual-1', titleSnapshot: 'Отважный пират' },
  { id: 'snapshot-2', achievementId: 'manual-1', titleSnapshot: 'Отважный пират' }
];
assert.deepEqual(achievements.getStudentManualIds(student, cls), ['manual-1']);
assert.equal(achievements.countStudentAchievements(student, cls), 5, 'ручное достижение считается один раз при трёх местах хранения');
assert.equal(achievements.countClassAchievements(cls), 5);
assert.equal(achievements.getStudentManualAchievements(student, cls).length, 1);

student.lifetimeEarned = 0;
student.balance = 0;
assert.equal(achievements.reconcileData({ classes: [cls] }).changed, false, 'после смены сезона ранее полученные достижения сохраняются без повторной выдачи');

const legacyStudent = { id: 'legacy-student', lifetimeEarned: 0, achievements: [] };
const legacyClass = {
  students: [legacyStudent],
  transactions: [{ id: 'legacy-purchase', student_id: legacyStudent.id, type: 'expense', description: 'Покупка: Сундук' }],
  achievements: []
};
assert.deepEqual(achievements.reconcileStudent(legacyStudent, legacyClass).map(item => item.id), ['first_purchase'], 'старые подтверждённые операции покупки учитываются');
assert.equal(achievements.getPurchaseCount('missing', legacyClass), 0, 'покупки другого ученика не предполагаются');

const integratedStudent = { id: 'integrated', balance: 0, fincoins_balance: 0, lifetimeEarned: 0, achievements: [] };
const integratedClass = { id: 'integrated-class', currentSeasonId: 'season-1', students: [integratedStudent], transactions: [], achievements: [] };
economy.applyTransaction(integratedStudent, integratedClass, { id: 'earning', balanceDelta: 100, lifetimeDelta: 100, category: 'earning', timestamp: '2026-10-15T10:00:00.000Z' });
assert.deepEqual(achievements.reconcileStudent(integratedStudent, integratedClass).map(item => item.id), ['first_coin', 'balance_50', 'balance_100']);
economy.applyTransaction(integratedStudent, integratedClass, { id: 'purchase', balanceDelta: -10, lifetimeDelta: 0, category: 'purchase', description: 'Покупка: Карта', timestamp: '2026-10-15T10:01:00.000Z' });
const balanceAfterPurchase = integratedStudent.balance;
assert.deepEqual(achievements.reconcileStudent(integratedStudent, integratedClass).map(item => item.id), ['first_purchase']);
assert.equal(integratedStudent.balance, balanceAfterPurchase, 'выдача после покупки не начисляет финкоины');

const correctionStudent = { id: 'correction-student', lifetimeEarned: 0, achievements: [] };
const correctionClass = { students: [correctionStudent], transactions: [{ student_id: correctionStudent.id, type: 'expense', category: 'balance_correction', description: 'Покупка: текст комментария' }], achievements: [] };
assert.deepEqual(achievements.reconcileStudent(correctionStudent, correctionClass), [], 'комментарий коррекции не считается подтверждённой покупкой');

console.log('Achievement tests passed');
