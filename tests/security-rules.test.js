const { readFileSync } = require('node:fs');
const { after, before, beforeEach, test } = require('node:test');
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
  setDoc,
  updateDoc,
  writeBatch
} = require('firebase/firestore');

const projectId = 'demo-pirate-auth';
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
