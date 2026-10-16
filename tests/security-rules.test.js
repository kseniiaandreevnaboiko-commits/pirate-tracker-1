const { readFileSync } = require('node:fs');
const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} = require('@firebase/rules-unit-testing');
const {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch
} = require('firebase/firestore');

const projectId = 'demo-pirate-tests';
const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let environment;

before(async () => {
  if (!emulatorAvailable) return;
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') }
  });
});

after(async () => {
  if (environment) await environment.cleanup();
});

beforeEach(async () => {
  if (environment) await environment.clearFirestore();
});

async function seedBase({ bound = false, expired = false } = {}) {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'authorizedTeachers', 'teacher-1'), { active: true });
    await setDoc(doc(db, 'authorizedTeachers', 'teacher-2'), { active: true });
    await setDoc(doc(db, 'authorizedTeachers', 'teacher-inactive'), { active: false });
    await setDoc(doc(db, 'classes', 'class-1'), { teacherUid: 'teacher-1', name: '7A', createdAt: new Date() });
    await setDoc(doc(db, 'classes', 'class-2'), { teacherUid: 'teacher-2', name: '7B', createdAt: new Date() });
    await setDoc(doc(db, 'classes', 'class-1', 'students', 'student-1'), {
      teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', displayName: 'Ada',
      ownerUid: bound ? 'student-old' : null, balance: 75, lifetimeEarned: 120, rank: 'Navigator', achievements: []
    });
    await setDoc(doc(db, 'studentInvites', 'abcdefghijklmnopqrstuvwxyz123456'), {
      teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1',
      expiresAt: new Date(Date.now() + (expired ? -60_000 : 60_000)), claimedBy: null, createdAt: new Date()
    });
  });
}

test('only an authorized teacher can create and manage own classes', { skip: !emulatorAvailable }, async () => {
  await seedBase();
  const teacherDb = environment.authenticatedContext('teacher-1').firestore();
  const strangerDb = environment.authenticatedContext('plain-user').firestore();
  await assertSucceeds(setDoc(doc(teacherDb, 'classes', 'class-new'), {
    teacherUid: 'teacher-1', name: '8A', createdAt: new Date()
  }));
  await assertFails(setDoc(doc(strangerDb, 'classes', 'class-bad'), {
    teacherUid: 'plain-user', name: 'Bad', createdAt: new Date()
  }));
  await assertFails(setDoc(doc(strangerDb, 'authorizedTeachers', 'plain-user'), { active: true }));
  await assertFails(getDoc(doc(teacherDb, 'classes', 'class-2')));
});

test('teacher profile is private to its authorized Firebase UID and rejects secret fields', { skip: !emulatorAvailable }, async () => {
  await seedBase();
  const ownerDb = environment.authenticatedContext('teacher-1').firestore();
  const otherTeacherDb = environment.authenticatedContext('teacher-2').firestore();
  const inactiveTeacherDb = environment.authenticatedContext('teacher-inactive').firestore();
  const anonymousDb = environment.authenticatedContext('anonymous-1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  const profile = {
    teacherUid: 'teacher-1',
    name: 'Анна',
    displayName: 'Анна Сергеевна',
    organization: 'Школа № 1',
    avatarId: 'captain-redhead',
    avatarSrc: 'teacher-avatar-captain-redhead.webp',
    updatedAt: new Date()
  };
  const ownRef = doc(ownerDb, 'teacherProfiles', 'teacher-1');
  await assertSucceeds(setDoc(ownRef, profile));
  assert.equal((await assertSucceeds(getDoc(ownRef))).data().displayName, profile.displayName);
  await assertSucceeds(updateDoc(ownRef, { organization: 'Лицей' }));
  await assertFails(getDoc(doc(otherTeacherDb, 'teacherProfiles', 'teacher-1')));
  await assertFails(getDocs(collection(ownerDb, 'teacherProfiles')));
  await assertFails(getDoc(doc(anonymousDb, 'teacherProfiles', 'teacher-1')));
  await assertFails(setDoc(doc(inactiveTeacherDb, 'teacherProfiles', 'teacher-inactive'), { ...profile, teacherUid: 'teacher-inactive' }));
  await assertFails(setDoc(doc(otherTeacherDb, 'teacherProfiles', 'teacher-1'), { ...profile, teacherUid: 'teacher-2' }));
  await assertFails(setDoc(ownRef, { ...profile, password: 'must-never-be-stored' }));
});

test('teacher can atomically create an unbound pupil and a 24-hour invitation', { skip: !emulatorAvailable }, async () => {
  await seedBase();
  const db = environment.authenticatedContext('teacher-1').firestore();
  const inviteId = 'new-student-invitation-1234567890123456';
  const batch = writeBatch(db);
  batch.set(doc(db, 'classes', 'class-1', 'students', 'student-new'), {
    teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-new', displayName: 'New pupil',
    ownerUid: null, balance: 0, lifetimeEarned: 0, achievements: [], createdAt: new Date()
  });
  batch.set(doc(db, 'studentInvites', inviteId), {
    teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-new',
    expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000), claimedBy: null, createdAt: new Date()
  });
  await assertSucceeds(batch.commit());
});

test('an unbound anonymous user cannot enumerate or read class data', { skip: !emulatorAvailable }, async () => {
  await seedBase();
  const db = environment.authenticatedContext('anonymous-1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await assertFails(getDocs(collection(db, 'classes')));
  await assertFails(getDoc(doc(db, 'classes', 'class-1')));
  await assertFails(getDoc(doc(db, 'classes', 'class-1', 'students', 'student-1')));
});

test('PIN login directory exposes only aliases while teacher exclusively creates password bindings', { skip: !emulatorAvailable }, async () => {
  await seedBase();
  const teacherDb = environment.authenticatedContext('teacher-1').firestore();
  const batch = writeBatch(teacherDb);
  batch.set(doc(teacherDb, 'studentLoginCatalogOwners', 'catalog-1'), {
    teacherUid: 'teacher-1', classId: 'class-1', createdAt: new Date()
  });
  batch.set(doc(teacherDb, 'studentLoginClasses', 'catalog-1'), {
    displayName: '7А — Пираты', active: true, updatedAt: new Date()
  });
  batch.set(doc(teacherDb, 'studentLoginClasses', 'catalog-1', 'students', 'entry-1'), {
    displayName: 'Алый Парус', avatarId: 'captain-boy', avatarSrc: 'student-avatar-captain-boy.webp',
    authLogin: 'opaque-login@students.finzozh.invalid', active: true, updatedAt: new Date()
  });
  batch.update(doc(teacherDb, 'classes', 'class-1', 'students', 'student-1'), {
    ownerUid: 'password-student', authMode: 'pin-password', loginCatalogId: 'catalog-1',
    loginEntryId: 'entry-1', credentialVersion: 1
  });
  batch.set(doc(teacherDb, 'studentBindings', 'password-student'), {
    teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', loginCatalogId: 'catalog-1',
    loginEntryId: 'entry-1', credentialVersion: 1, createdAt: new Date()
  });
  await assertSucceeds(batch.commit());

  const anonymousDb = environment.authenticatedContext('catalog-reader', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  const publicClass = await assertSucceeds(getDoc(doc(anonymousDb, 'studentLoginClasses', 'catalog-1')));
  const publicStudent = await assertSucceeds(getDoc(doc(anonymousDb, 'studentLoginClasses', 'catalog-1', 'students', 'entry-1')));
  assert.deepEqual(Object.keys(publicClass.data()).sort(), ['active', 'displayName', 'updatedAt']);
  assert.deepEqual(Object.keys(publicStudent.data()).sort(), ['active', 'authLogin', 'avatarId', 'avatarSrc', 'displayName', 'updatedAt']);
  await assertFails(getDoc(doc(anonymousDb, 'studentLoginCatalogOwners', 'catalog-1')));

  const pupilDb = environment.authenticatedContext('password-student', { firebase: { sign_in_provider: 'password' } }).firestore();
  await assertSucceeds(getDoc(doc(pupilDb, 'classes', 'class-1', 'students', 'student-1')));
  await assertFails(updateDoc(doc(pupilDb, 'classes', 'class-1', 'students', 'student-1'), { balance: 999999 }));
  await setDoc(doc(teacherDb, 'classes', 'class-1', 'students', 'student-2'), {
    teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-2', displayName: 'Синий Кит',
    ownerUid: null, balance: 0, lifetimeEarned: 0, createdAt: new Date()
  });
  await updateDoc(doc(teacherDb, 'classes', 'class-1', 'students', 'student-2'), { ownerUid: 'other-password-student' });
  await assertFails(getDoc(doc(pupilDb, 'classes', 'class-1', 'students', 'student-2')));
  await setDoc(doc(teacherDb, 'classes', 'class-1', 'rewards', 'pin-reward'), {
    teacherUid: 'teacher-1', classId: 'class-1', rewardId: 'pin-reward', name: 'Карта',
    price: 10, limit: 1, active: true
  });
  await assertSucceeds(setDoc(doc(pupilDb, 'classes', 'class-1', 'purchaseRequests', 'pin-request'), {
    teacherUid: 'teacher-1', classId: 'class-1', requestId: 'pin-request', studentId: 'student-1',
    student_id: 'student-1', rewardId: 'pin-reward', reward_id: 'pin-reward', status: 'pending',
    createdAt: new Date(), processedAt: null
  }));
  await assertFails(setDoc(doc(pupilDb, 'studentBindings', 'attacker-binding'), {
    teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', loginCatalogId: 'catalog-1',
    loginEntryId: 'entry-1', credentialVersion: 1, createdAt: new Date()
  }));
});

test('teacher PIN reset revokes every old session without changing pupil economy', { skip: !emulatorAvailable }, async () => {
  await seedBase();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await updateDoc(doc(db, 'classes', 'class-1', 'students', 'student-1'), {
      ownerUid: 'old-password-uid', authMode: 'pin-password', credentialVersion: 1,
      loginCatalogId: 'catalog-1', loginEntryId: 'entry-1'
    });
    await setDoc(doc(db, 'studentBindings', 'old-password-uid'), {
      teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', loginCatalogId: 'catalog-1',
      loginEntryId: 'entry-1', credentialVersion: 1, createdAt: new Date()
    });
    await setDoc(doc(db, 'studentLoginCatalogOwners', 'catalog-1'), { teacherUid: 'teacher-1', classId: 'class-1', createdAt: new Date() });
    await setDoc(doc(db, 'studentLoginClasses', 'catalog-1'), { displayName: '7А', active: true, updatedAt: new Date() });
    await setDoc(doc(db, 'studentLoginClasses', 'catalog-1', 'students', 'entry-1'), {
      displayName: 'Алый Парус', avatarId: 'captain-boy', avatarSrc: 'student-avatar-captain-boy.webp',
      authLogin: 'old-login@students.finzozh.invalid', active: true, updatedAt: new Date()
    });
  });
  const teacherDb = environment.authenticatedContext('teacher-1').firestore();
  const reset = writeBatch(teacherDb);
  reset.delete(doc(teacherDb, 'studentBindings', 'old-password-uid'));
  reset.update(doc(teacherDb, 'classes', 'class-1', 'students', 'student-1'), { ownerUid: 'new-password-uid', credentialVersion: 2 });
  reset.set(doc(teacherDb, 'studentBindings', 'new-password-uid'), {
    teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', loginCatalogId: 'catalog-1',
    loginEntryId: 'entry-1', credentialVersion: 2, createdAt: new Date()
  });
  reset.update(doc(teacherDb, 'studentLoginClasses', 'catalog-1', 'students', 'entry-1'), {
    authLogin: 'new-login@students.finzozh.invalid', updatedAt: new Date()
  });
  await assertSucceeds(reset.commit());

  const oldDb = environment.authenticatedContext('old-password-uid', { firebase: { sign_in_provider: 'password' } }).firestore();
  const newDb = environment.authenticatedContext('new-password-uid', { firebase: { sign_in_provider: 'password' } }).firestore();
  await assertFails(getDoc(doc(oldDb, 'classes', 'class-1', 'students', 'student-1')));
  const profile = await assertSucceeds(getDoc(doc(newDb, 'classes', 'class-1', 'students', 'student-1')));
  assert.equal(profile.data().balance, 75);
  assert.equal(profile.data().lifetimeEarned, 120);
});

test('invitation redemption atomically binds one UID and cannot be replayed', { skip: !emulatorAvailable }, async () => {
  await seedBase();
  const token = 'abcdefghijklmnopqrstuvwxyz123456';
  const pupilDb = environment.authenticatedContext('student-new', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  const batch = writeBatch(pupilDb);
  batch.update(doc(pupilDb, 'studentInvites', token), { claimedBy: 'student-new', claimedAt: new Date() });
  batch.update(doc(pupilDb, 'classes', 'class-1', 'students', 'student-1'), { ownerUid: 'student-new', bindingInviteId: token });
  batch.set(doc(pupilDb, 'studentBindings', 'student-new'), {
    teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', inviteId: token, createdAt: new Date()
  });
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(pupilDb, 'classes', 'class-1', 'students', 'student-1')));

  const attackerDb = environment.authenticatedContext('student-attacker', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  const replay = writeBatch(attackerDb);
  replay.update(doc(attackerDb, 'studentInvites', token), { claimedBy: 'student-attacker', claimedAt: new Date() });
  replay.update(doc(attackerDb, 'classes', 'class-1', 'students', 'student-1'), { ownerUid: 'student-attacker', bindingInviteId: token });
  replay.set(doc(attackerDb, 'studentBindings', 'student-attacker'), {
    teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', inviteId: token, createdAt: new Date()
  });
  await assertFails(replay.commit());
});

test('a non-anonymous Firebase account cannot claim a pupil invitation', { skip: !emulatorAvailable }, async () => {
  await seedBase();
  const token = 'abcdefghijklmnopqrstuvwxyz123456';
  const db = environment.authenticatedContext('email-user', { firebase: { sign_in_provider: 'password' } }).firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, 'studentInvites', token), { claimedBy: 'email-user', claimedAt: new Date() });
  batch.update(doc(db, 'classes', 'class-1', 'students', 'student-1'), { ownerUid: 'email-user', bindingInviteId: token });
  batch.set(doc(db, 'studentBindings', 'email-user'), {
    teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', inviteId: token, createdAt: new Date()
  });
  await assertFails(batch.commit());
});

test('a pupil cannot change balance, achievements, rank, identity, or read another profile', { skip: !emulatorAvailable }, async () => {
  await seedBase();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await updateDoc(doc(db, 'classes', 'class-1', 'students', 'student-1'), { ownerUid: 'student-1' });
    await setDoc(doc(db, 'studentBindings', 'student-1'), {
      teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', inviteId: 'used', createdAt: new Date()
    });
    await setDoc(doc(db, 'classes', 'class-1', 'students', 'student-2'), {
      teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-2', displayName: 'Bob', ownerUid: 'student-2', balance: 10
    });
  });
  const db = environment.authenticatedContext('student-1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  const own = doc(db, 'classes', 'class-1', 'students', 'student-1');
  await assertSucceeds(getDoc(own));
  await assertFails(updateDoc(own, { balance: 9999 }));
  await assertFails(updateDoc(own, { achievements: ['all'] }));
  await assertFails(updateDoc(own, { rank: 'King' }));
  await assertFails(updateDoc(own, { studentId: 'student-2' }));
  await assertFails(getDoc(doc(db, 'classes', 'class-1', 'students', 'student-2')));
});

test('expired invitation and already-bound profile cannot be claimed', { skip: !emulatorAvailable }, async () => {
  await seedBase({ expired: true });
  const token = 'abcdefghijklmnopqrstuvwxyz123456';
  const db = environment.authenticatedContext('student-new').firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, 'studentInvites', token), { claimedBy: 'student-new', claimedAt: new Date() });
  batch.update(doc(db, 'classes', 'class-1', 'students', 'student-1'), { ownerUid: 'student-new', bindingInviteId: token });
  batch.set(doc(db, 'studentBindings', 'student-new'), {
    teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', inviteId: token, createdAt: new Date()
  });
  await assertFails(batch.commit());
});

test('teacher can revoke a binding and atomically issue a replacement invitation', { skip: !emulatorAvailable }, async () => {
  await seedBase({ bound: true });
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'studentBindings', 'student-old'), {
      teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', inviteId: 'old-used', createdAt: new Date()
    });
  });
  const teacherDb = environment.authenticatedContext('teacher-1').firestore();
  const replacement = 'replacement-invitation-token-1234567890';
  const batch = writeBatch(teacherDb);
  batch.delete(doc(teacherDb, 'studentBindings', 'student-old'));
  batch.update(doc(teacherDb, 'classes', 'class-1', 'students', 'student-1'), { ownerUid: null, bindingInviteId: null });
  batch.set(doc(teacherDb, 'studentInvites', replacement), {
    teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1',
    expiresAt: new Date(Date.now() + 60_000), claimedBy: null, createdAt: new Date()
  });
  await assertSucceeds(batch.commit());

  const oldPupilDb = environment.authenticatedContext('student-old', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await assertFails(getDoc(doc(oldPupilDb, 'classes', 'class-1', 'students', 'student-1')));
});

test('a bound pupil can create only a pending purchase request for self', { skip: !emulatorAvailable }, async () => {
  await seedBase({ bound: true });
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'studentBindings', 'student-old'), { teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', inviteId: 'used' });
    await setDoc(doc(db, 'classes', 'class-1', 'rewards', 'reward-1'), { teacherUid: 'teacher-1', classId: 'class-1', rewardId: 'reward-1', name: 'Map', price: 10, limit: 1, active: true });
  });
  const db = environment.authenticatedContext('student-old', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  const valid = { teacherUid: 'teacher-1', classId: 'class-1', requestId: 'request-1', studentId: 'student-1', student_id: 'student-1', rewardId: 'reward-1', reward_id: 'reward-1', status: 'pending', createdAt: new Date(), processedAt: null };
  await assertSucceeds(setDoc(doc(db, 'classes', 'class-1', 'purchaseRequests', 'request-1'), valid));
  await assertFails(setDoc(doc(db, 'classes', 'class-1', 'purchaseRequests', 'request-2'), { ...valid, requestId: 'request-2', studentId: 'student-2', student_id: 'student-2' }));
  await assertFails(setDoc(doc(db, 'classes', 'class-1', 'purchaseRequests', 'request-3'), { ...valid, requestId: 'request-3', status: 'approved' }));
});

test('a pupil can query own requests but not another pupil requests', { skip: !emulatorAvailable }, async () => {
  await seedBase({ bound: true });
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'studentBindings', 'student-old'), { teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', inviteId: 'used' });
    await setDoc(doc(db, 'classes', 'class-1', 'purchaseRequests', 'own'), { studentId: 'student-1', status: 'pending' });
    await setDoc(doc(db, 'classes', 'class-1', 'purchaseRequests', 'other'), { studentId: 'student-2', status: 'pending' });
  });
  const db = environment.authenticatedContext('student-old', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await assertSucceeds(getDocs(query(collection(db, 'classes', 'class-1', 'purchaseRequests'), where('studentId', '==', 'student-1'))));
  await assertFails(getDocs(collection(db, 'classes', 'class-1', 'purchaseRequests')));
});

test('financial transaction records are teacher-created and immutable', { skip: !emulatorAvailable }, async () => {
  await seedBase();
  const teacherDb = environment.authenticatedContext('teacher-1').firestore();
  const transaction = { teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', balanceDelta: 10, lifetimeDelta: 10, idempotencyKey: 'operation-1' };
  const ref = doc(teacherDb, 'classes', 'class-1', 'transactions', 'operation-1');
  await assertSucceeds(setDoc(ref, transaction));
  await assertFails(updateDoc(ref, { balanceDelta: 999 }));
  const pupilDb = environment.authenticatedContext('student-1', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await assertFails(setDoc(doc(pupilDb, 'classes', 'class-1', 'transactions', 'forged'), { ...transaction, idempotencyKey: 'forged' }));
});

test('automatic achievements can never contain a fincoin reward', { skip: !emulatorAvailable }, async () => {
  await seedBase();
  const db = environment.authenticatedContext('teacher-1').firestore();
  const base = { teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', achievementId: 'first_coin', type: 'automatic' };
  await assertSucceeds(setDoc(doc(db, 'classes', 'class-1', 'studentAchievements', 'auto-student-1-first_coin'), { ...base, fincoins: 0 }));
  await assertFails(setDoc(doc(db, 'classes', 'class-1', 'studentAchievements', 'auto-student-1-bad'), { ...base, fincoins: 10 }));
});

test('leaderboard exposes only projection while profiles remain private', { skip: !emulatorAvailable }, async () => {
  await seedBase({ bound: true });
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'studentBindings', 'student-old'), { teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', inviteId: 'used' });
    await setDoc(doc(db, 'classes', 'class-1', 'students', 'student-2'), { teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-2', displayName: 'Bob', ownerUid: 'other', balance: 999 });
    await setDoc(doc(db, 'classes', 'class-1', 'leaderboard', 'student-2'), { teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-2', displayName: 'Bob', lifetimeEarned: 50, rank: 'Юнга' });
  });
  const db = environment.authenticatedContext('student-old', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await assertSucceeds(getDoc(doc(db, 'classes', 'class-1', 'leaderboard', 'student-2')));
  await assertFails(getDoc(doc(db, 'classes', 'class-1', 'students', 'student-2')));
});

test('only class teacher can create or close seasons', { skip: !emulatorAvailable }, async () => {
  await seedBase();
  const teacherDb = environment.authenticatedContext('teacher-1').firestore();
  await assertSucceeds(setDoc(doc(teacherDb, 'classes', 'class-1', 'seasons', 'season-1'), { teacherUid: 'teacher-1', classId: 'class-1', status: 'active' }));
  const otherDb = environment.authenticatedContext('teacher-2').firestore();
  await assertFails(setDoc(doc(otherDb, 'classes', 'class-1', 'seasons', 'bad'), { teacherUid: 'teacher-2', classId: 'class-1', status: 'active' }));
});

test('an anonymous pupil cannot approve purchases, forge achievements, read legacy data, or grant teacher role', { skip: !emulatorAvailable }, async () => {
  await seedBase({ bound: true });
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'studentBindings', 'student-old'), { teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', inviteId: 'used' });
    await setDoc(doc(db, 'classes', 'class-1', 'purchaseRequests', 'pending-1'), { teacherUid: 'teacher-1', classId: 'class-1', requestId: 'pending-1', studentId: 'student-1', status: 'pending' });
    await setDoc(doc(db, 'trackerApps', 'main'), { secret: 'legacy' });
  });
  const db = environment.authenticatedContext('student-old', { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  await assertFails(updateDoc(doc(db, 'classes', 'class-1', 'purchaseRequests', 'pending-1'), { status: 'approved' }));
  await assertFails(setDoc(doc(db, 'classes', 'class-1', 'studentAchievements', 'forged'), {
    teacherUid: 'teacher-1', classId: 'class-1', studentId: 'student-1', achievementId: 'forged', type: 'manual', fincoins: 50
  }));
  await assertFails(getDoc(doc(db, 'trackerApps', 'main')));
  await assertFails(setDoc(doc(db, 'authorizedTeachers', 'student-old'), { active: true }));
});
