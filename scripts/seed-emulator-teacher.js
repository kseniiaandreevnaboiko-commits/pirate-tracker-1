const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');

const projectId = 'demo-pirate-auth';
const email = process.env.PIRATE_TEACHER_EMAIL;
const password = process.env.PIRATE_TEACHER_PASSWORD;

const localEndpoint = value => /^(127\.0\.0\.1|localhost):\d+$/.test(String(value || ''));
if (!localEndpoint(process.env.FIRESTORE_EMULATOR_HOST) || !localEndpoint(process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
  throw new Error('Refusing to run: both emulator hosts must be loopback addresses.');
}
if (!email || !password) {
  throw new Error('Set PIRATE_TEACHER_EMAIL and PIRATE_TEACHER_PASSWORD.');
}

async function authRequest(operation) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:${operation}?key=demo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error?.message || `Auth emulator ${operation} failed.`);
    error.code = result.error?.message || '';
    throw error;
  }
  return result;
}

(async () => {
  let account;
  try {
    account = await authRequest('signUp');
  } catch (error) {
    if (!String(error.code).includes('EMAIL_EXISTS')) throw error;
    account = await authRequest('signInWithPassword');
  }
  const environment = await initializeTestEnvironment({ projectId });
  try {
    await environment.withSecurityRulesDisabled(async context => {
      const roleRef = doc(context.firestore(), 'authorizedTeachers', account.localId);
      const existingRole = await getDoc(roleRef);
      await setDoc(roleRef, {
        active: true,
        email,
        createdAt: existingRole.data()?.createdAt || new Date()
      }, { merge: true });
    });
    console.log(`Emulator teacher is ready: ${email} (${account.localId})`);
  } finally {
    await environment.cleanup();
  }
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
