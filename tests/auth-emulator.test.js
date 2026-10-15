const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deleteApp, initializeApp } = require('firebase/app');
const {
  EmailAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword
} = require('firebase/auth');
const { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc } = require('firebase/firestore');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');

const enabled = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST);

test('teacher email/password, role check, reset, and password change work in emulators', { skip: !enabled }, async () => {
  const projectId = 'demo-pirate-auth';
  const app = initializeApp({ apiKey: 'demo', projectId }, `auth-test-${Date.now()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  const environment = await initializeTestEnvironment({ projectId });
  const email = `teacher-${Date.now()}@example.test`;
  const firstPassword = 'Compass-12345';
  const nextPassword = 'Anchor-67890';
  try {
    const created = await createUserWithEmailAndPassword(auth, email, firstPassword);
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'authorizedTeachers', created.user.uid), { active: true, email });
    });
    await signOut(auth);
    const signedIn = await signInWithEmailAndPassword(auth, email, firstPassword);
    const role = await getDoc(doc(db, 'authorizedTeachers', signedIn.user.uid));
    assert.equal(role.data().active, true);
    await assertFails(setDoc(doc(db, 'authorizedTeachers', signedIn.user.uid), { active: true }));
    await sendPasswordResetEmail(auth, email);
    await reauthenticateWithCredential(signedIn.user, EmailAuthProvider.credential(email, firstPassword));
    await updatePassword(signedIn.user, nextPassword);
    await signOut(auth);
    await assert.rejects(signInWithEmailAndPassword(auth, email, firstPassword));
    const changed = await signInWithEmailAndPassword(auth, email, nextPassword);
    assert.equal(changed.user.uid, created.user.uid);
    await signOut(auth);
    const unauthorized = await createUserWithEmailAndPassword(auth, `pupil-${Date.now()}@example.test`, 'NoRole-12345');
    const missingRole = await getDoc(doc(db, 'authorizedTeachers', unauthorized.user.uid));
    assert.equal(missingRole.exists(), false);
    await assertFails(setDoc(doc(db, 'authorizedTeachers', unauthorized.user.uid), { active: true }));
  } finally {
    await signOut(auth).catch(() => {});
    await environment.cleanup();
    await deleteApp(app);
  }
});
