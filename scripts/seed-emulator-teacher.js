const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc } = require('firebase/firestore');

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

(async () => {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const account = await response.json();
  if (!response.ok) throw new Error(account.error?.message || 'Could not create emulator account.');
  const environment = await initializeTestEnvironment({ projectId });
  try {
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'authorizedTeachers', account.localId), {
        active: true,
        email,
        createdAt: new Date()
      });
    });
    console.log(`Emulator teacher created: ${email} (${account.localId})`);
  } finally {
    await environment.cleanup();
  }
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
