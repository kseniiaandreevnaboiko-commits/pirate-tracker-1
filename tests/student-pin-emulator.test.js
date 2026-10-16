const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deleteApp, initializeApp } = require('firebase/app');
const {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut
} = require('firebase/auth');
const {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  updateDoc,
  writeBatch
} = require('firebase/firestore');
const { assertFails, assertSucceeds, initializeTestEnvironment } = require('@firebase/rules-unit-testing');

const enabled = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST);
const projectId = 'demo-pirate-tests';

function testApp(label) {
  const app = initializeApp({ apiKey: 'demo', projectId }, `${label}-${Date.now()}-${Math.random()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  return { app, auth, db };
}

test('student PIN prototype supports two devices, teacher-safe provisioning, and complete revocation', { skip: !enabled }, async () => {
  const environment = await initializeTestEnvironment({ projectId });
  const teacher = testApp('pin-teacher');
  const provisioner = testApp('pin-provisioner');
  const wrongPin = testApp('pin-wrong');
  const deviceOne = testApp('pin-device-one');
  const deviceTwo = testApp('pin-device-two');
  const replacement = testApp('pin-replacement');
  const apps = [teacher, provisioner, wrongPin, deviceOne, deviceTwo, replacement];
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const teacherEmail = `teacher-${suffix}@example.test`;
  const studentLogin = `pupil-${suffix}@students.finzozh.invalid`;
  const replacementLogin = `pupil-reset-${suffix}@students.finzozh.invalid`;
  const teacherPassword = 'Captain-Strong-123';
  const pin = '004271';
  const nextPin = '830516';
  try {
    const teacherCredential = await createUserWithEmailAndPassword(teacher.auth, teacherEmail, teacherPassword);
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'authorizedTeachers', teacherCredential.user.uid), { active: true });
      await setDoc(doc(db, 'classes', 'pin-class'), {
        teacherUid: teacherCredential.user.uid, name: '7А — Пираты', createdAt: new Date()
      });
      await setDoc(doc(db, 'classes', 'pin-class', 'students', 'pin-student'), {
        teacherUid: teacherCredential.user.uid, classId: 'pin-class', studentId: 'pin-student',
        displayName: 'Алый Парус', avatarId: 'captain-boy', avatarSrc: 'student-avatar-captain-boy.webp',
        ownerUid: null, balance: 0, lifetimeEarned: 0, active: true
      });
    });

    const teacherUidBeforeProvisioning = teacher.auth.currentUser.uid;
    const studentCredential = await createUserWithEmailAndPassword(provisioner.auth, studentLogin, pin);
    assert.equal(teacher.auth.currentUser.uid, teacherUidBeforeProvisioning, 'secondary Auth must preserve teacher session');
    await signOut(provisioner.auth);

    const create = writeBatch(teacher.db);
    create.set(doc(teacher.db, 'studentLoginCatalogOwners', 'pin-catalog'), {
      teacherUid: teacherCredential.user.uid, classId: 'pin-class', createdAt: new Date()
    });
    create.set(doc(teacher.db, 'studentLoginClasses', 'pin-catalog'), {
      displayName: '7А — Пираты', active: true, updatedAt: new Date()
    });
    create.set(doc(teacher.db, 'studentLoginClasses', 'pin-catalog', 'students', 'pin-entry'), {
      displayName: 'Алый Парус', avatarId: 'captain-boy', avatarSrc: 'student-avatar-captain-boy.webp',
      authLogin: studentLogin, active: true, updatedAt: new Date()
    });
    create.update(doc(teacher.db, 'classes', 'pin-class', 'students', 'pin-student'), {
      ownerUid: studentCredential.user.uid, authMode: 'pin-password', loginCatalogId: 'pin-catalog',
      loginEntryId: 'pin-entry', credentialVersion: 1
    });
    create.set(doc(teacher.db, 'studentBindings', studentCredential.user.uid), {
      teacherUid: teacherCredential.user.uid, classId: 'pin-class', studentId: 'pin-student',
      loginCatalogId: 'pin-catalog', loginEntryId: 'pin-entry', credentialVersion: 1, createdAt: new Date()
    });
    await assertSucceeds(create.commit());

    await assert.rejects(signInWithEmailAndPassword(wrongPin.auth, studentLogin, '999999'));
    const first = await signInWithEmailAndPassword(deviceOne.auth, studentLogin, pin);
    const second = await signInWithEmailAndPassword(deviceTwo.auth, studentLogin, pin);
    assert.equal(first.user.uid, second.user.uid, 'both devices must open the same Firebase identity');
    const profilePath = ['classes', 'pin-class', 'students', 'pin-student'];
    assert.equal((await getDoc(doc(deviceOne.db, ...profilePath))).data().balance, 0);
    assert.equal((await getDoc(doc(deviceTwo.db, ...profilePath))).data().balance, 0);

    await updateDoc(doc(teacher.db, ...profilePath), { balance: 350, lifetimeEarned: 350 });
    assert.equal((await getDoc(doc(deviceOne.db, ...profilePath))).data().balance, 350);
    assert.equal((await getDoc(doc(deviceTwo.db, ...profilePath))).data().lifetimeEarned, 350);
    await assertFails(updateDoc(doc(deviceOne.db, ...profilePath), { balance: 999999 }));
    await assertFails(setDoc(doc(deviceOne.db, 'studentBindings', 'forged-uid'), {
      teacherUid: teacherCredential.user.uid, classId: 'pin-class', studentId: 'pin-student',
      loginCatalogId: 'pin-catalog', loginEntryId: 'pin-entry', credentialVersion: 1, createdAt: new Date()
    }));

    const nextCredential = await createUserWithEmailAndPassword(provisioner.auth, replacementLogin, nextPin);
    await signOut(provisioner.auth);
    const reset = writeBatch(teacher.db);
    reset.delete(doc(teacher.db, 'studentBindings', studentCredential.user.uid));
    reset.update(doc(teacher.db, ...profilePath), { ownerUid: nextCredential.user.uid, credentialVersion: 2 });
    reset.set(doc(teacher.db, 'studentBindings', nextCredential.user.uid), {
      teacherUid: teacherCredential.user.uid, classId: 'pin-class', studentId: 'pin-student',
      loginCatalogId: 'pin-catalog', loginEntryId: 'pin-entry', credentialVersion: 2, createdAt: new Date()
    });
    reset.update(doc(teacher.db, 'studentLoginClasses', 'pin-catalog', 'students', 'pin-entry'), {
      authLogin: replacementLogin, updatedAt: new Date()
    });
    await assertSucceeds(reset.commit());

    await assertFails(getDoc(doc(deviceOne.db, ...profilePath)));
    await assertFails(getDoc(doc(deviceTwo.db, ...profilePath)));
    await assert.rejects(signInWithEmailAndPassword(wrongPin.auth, replacementLogin, pin));
    const restored = await signInWithEmailAndPassword(replacement.auth, replacementLogin, nextPin);
    assert.equal(restored.user.uid, nextCredential.user.uid);
    const restoredProfile = await getDoc(doc(replacement.db, ...profilePath));
    assert.equal(restoredProfile.data().balance, 350);
    assert.equal(restoredProfile.data().lifetimeEarned, 350);

    const publicEntry = (await getDoc(doc(replacement.db, 'studentLoginClasses', 'pin-catalog', 'students', 'pin-entry'))).data();
    assert.equal(Object.hasOwn(publicEntry, 'pin'), false);
    assert.equal(Object.hasOwn(restoredProfile.data(), 'pin'), false);
  } finally {
    for (const item of apps) await signOut(item.auth).catch(() => {});
    await environment.cleanup();
    for (const item of apps) await deleteApp(item.app);
  }
});
