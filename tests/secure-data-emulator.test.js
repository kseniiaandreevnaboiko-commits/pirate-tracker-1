const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const firestore = require('firebase/firestore');
const economy = require('../economy.js');
const achievements = require('../achievements.js');

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

test('normalized economy, shop, achievements, idempotency, and season work atomically', { skip: !enabled }, async () => {
  const projectId = 'demo-pirate-auth';
  const environment = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  const teacherUid = 'economy-teacher';
  await environment.withSecurityRulesDisabled(async context => {
    await firestore.setDoc(firestore.doc(context.firestore(), 'authorizedTeachers', teacherUid), { active: true });
  });
  const db = environment.authenticatedContext(teacherUid).firestore();
  global.window = {
    PirateEconomy: economy,
    PirateAchievements: achievements,
    PirateSecureBridge: { hydrateTeacher() {}, hydrateStudent() {} },
    dispatchEvent() {}
  };
  global.CustomEvent ||= class CustomEvent { constructor(type) { this.type = type; } };
  const source = readFileSync('secure-data.js', 'utf8');
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const service = module.configure({ db, auth: { currentUser: { uid: teacherUid } }, storeModule: firestore });
  try {
    await service.startRealtime({ role: 'teacher', uid: teacherUid }, { listen: false });
    const classId = await service.createClass('Test crew');
    const definitions = await firestore.getDocs(firestore.collection(db, 'classes', classId, 'automaticAchievementDefinitions'));
    assert.equal(definitions.size, 6);
    const studentId = await service.createStudentWithInvite(classId, { displayName: 'Ada' }, 'integration-invitation-token-1234567890', firestore.Timestamp.fromMillis(Date.now() + 60_000));

    const first = await service.applyTeacherTransaction({ classId, studentId, balanceDelta: 50, lifetimeDelta: 50, category: 'earning', operationId: 'earning-1' });
    assert.equal(first.duplicate, false);
    const duplicate = await service.applyTeacherTransaction({ classId, studentId, balanceDelta: 50, lifetimeDelta: 50, category: 'earning', operationId: 'earning-1' });
    assert.equal(duplicate.duplicate, true);
    let profile = (await firestore.getDoc(firestore.doc(db, 'classes', classId, 'students', studentId))).data();
    assert.equal(profile.balance, 50);
    assert.equal(profile.lifetimeEarned, 50);

    const rewardId = await service.saveReward(classId, { name: 'Map', category: 'privilege', price: 10, limit: 1 });
    await environment.withSecurityRulesDisabled(async context => {
      await firestore.setDoc(firestore.doc(context.firestore(), 'classes', classId, 'purchaseRequests', 'request-1'), {
        teacherUid, classId, requestId: 'request-1', studentId, student_id: studentId,
        rewardId, reward_id: rewardId, status: 'pending', createdAt: new Date(), processedAt: null
      });
    });
    assert.equal((await service.approvePurchase(classId, 'request-1')).duplicate, false);
    assert.equal((await service.approvePurchase(classId, 'request-1')).duplicate, true);
    profile = (await firestore.getDoc(firestore.doc(db, 'classes', classId, 'students', studentId))).data();
    assert.equal(profile.balance, 40);
    assert.equal(profile.lifetimeEarned, 50);
    assert.equal(profile.purchaseCount, 1);

    const manualId = await service.saveManualAchievement(classId, { name: 'Helper', description: 'Helped crew', iconId: 'anchor', iconPath: 'anchor.webp', rarity: 'common', fincoins: 5, active: true });
    assert.equal((await service.awardManualAchievement(classId, studentId, manualId)).duplicate, false);
    assert.equal((await service.awardManualAchievement(classId, studentId, manualId)).duplicate, true);
    profile = (await firestore.getDoc(firestore.doc(db, 'classes', classId, 'students', studentId))).data();
    assert.equal(profile.balance, 45);
    assert.equal(profile.lifetimeEarned, 55);

    const awards = await firestore.getDocs(firestore.collection(db, 'classes', classId, 'studentAchievements'));
    assert.equal(awards.docs.filter(item => item.data().type === 'manual').length, 1);
    assert.ok(awards.docs.some(item => item.data().achievementId === 'first_purchase'));
    assert.ok(awards.docs.filter(item => item.data().type === 'automatic').every(item => item.data().fincoins === 0));

    await service.startNewSeason(classId);
    profile = (await firestore.getDoc(firestore.doc(db, 'classes', classId, 'students', studentId))).data();
    assert.equal(profile.balance, 0);
    assert.equal(profile.lifetimeEarned, 0);
    assert.equal((await firestore.getDocs(firestore.collection(db, 'classes', classId, 'studentAchievements'))).size, awards.size);
    await new Promise(resolve => setTimeout(resolve, 250));
  } finally {
    service.stopRealtime();
    await environment.cleanup();
    delete global.window;
  }
});
