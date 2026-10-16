const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deleteApp, initializeApp } = require('firebase/app');
const { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } = require('firebase/auth');
const { connectFirestoreEmulator, doc, getDoc, getFirestore } = require('firebase/firestore');

const enabled = process.env.PIRATE_RESTART_TEST === '1'
  && Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST);

test('existing teacher with active role signs in after emulator restart', { skip: !enabled }, async () => {
  const app = initializeApp({ apiKey: 'demo', projectId: 'demo-pirate-auth' }, `restart-check-${Date.now()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      process.env.PIRATE_TEACHER_EMAIL,
      process.env.PIRATE_TEACHER_PASSWORD
    );
    const role = await getDoc(doc(db, 'authorizedTeachers', credential.user.uid));
    assert.equal(role.exists(), true);
    assert.equal(role.data().active, true);
  } finally {
    await signOut(auth).catch(() => {});
    await deleteApp(app);
  }
});
