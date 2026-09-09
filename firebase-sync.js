import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { doc, getDoc, getFirestore, onSnapshot, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCEsm7Ohot2I4IBCO1_XtJNS3aB3l0jpEw',
  authDomain: 'tracker-progress-2b682.firebaseapp.com',
  projectId: 'tracker-progress-2b682',
  storageBucket: 'tracker-progress-2b682.firebasestorage.app',
  messagingSenderId: '468722862029',
  appId: '1:468722862029:web:0197f0ec8e99e66ec2a684'
};

const bridge = window.PirateCloudBridge;
const clone = value => JSON.parse(JSON.stringify(value));
let documentRef = null;
let firebaseUser = null;
let ready = false;
let pendingState = null;
let saveTimer = null;
let lastWrittenState = '';

function setStatus(status, detail = '') {
  document.documentElement.dataset.cloud = status;
  window.dispatchEvent(new CustomEvent('pirate-cloud-status', { detail: { status, detail } }));
}

async function waitForUser(auth) {
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve, reject) => {
    let settled = false;
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (!user || settled) return;
      settled = true;
      unsubscribe();
      resolve(user);
    }, reject);
    signInAnonymously(auth).catch(error => {
      if (settled) return;
      settled = true;
      unsubscribe();
      reject(error);
    });
  });
}

async function writeState(state) {
  if (!ready || !documentRef || !firebaseUser) {
    pendingState = clone(state);
    return;
  }
  const cleanState = clone(state);
  lastWrittenState = JSON.stringify(cleanState);
  await setDoc(documentRef, {
    schemaVersion: 1,
    state: cleanState,
    updatedAt: serverTimestamp(),
    updatedBy: firebaseUser.uid
  }, { merge: true });
  setStatus('connected');
}

window.PirateCloud = {
  save(state) {
    pendingState = clone(state);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const stateToWrite = pendingState;
      pendingState = null;
      if (!stateToWrite) return;
      try { await writeState(stateToWrite); }
      catch (error) {
        pendingState = stateToWrite;
        setStatus('offline', error.code || error.message);
        console.warn('Firebase: данные сохранены только локально', error);
      }
    }, 350);
  }
};

async function startCloudSync() {
  if (!bridge) throw new Error('Приложение не подготовило мост синхронизации');
  setStatus('connecting');
  const firebaseApp = initializeApp(firebaseConfig);
  const auth = getAuth(firebaseApp);
  const db = getFirestore(firebaseApp);
  firebaseUser = await waitForUser(auth);
  documentRef = doc(db, 'trackerApps', 'main');

  const initialSnapshot = await getDoc(documentRef);
  if (initialSnapshot.exists() && initialSnapshot.data()?.state) {
    const remoteState = initialSnapshot.data().state;
    lastWrittenState = JSON.stringify(remoteState);
    bridge.importState(remoteState);
  } else {
    ready = true;
    await writeState(bridge.exportState());
  }

  onSnapshot(documentRef, snapshot => {
    const remoteState = snapshot.data()?.state;
    if (!remoteState) return;
    const serialized = JSON.stringify(remoteState);
    if (serialized === lastWrittenState || serialized === JSON.stringify(bridge.exportState())) return;
    lastWrittenState = serialized;
    bridge.importState(remoteState);
  }, error => {
    setStatus('offline', error.code || error.message);
    console.warn('Firebase: синхронизация временно недоступна', error);
  });

  ready = true;
  setStatus('connected');
  if (pendingState) {
    const stateToWrite = pendingState;
    pendingState = null;
    await writeState(stateToWrite);
  }
}

startCloudSync().catch(error => {
  setStatus('offline', error.code || error.message);
  console.warn('Firebase не подключён; используется локальная копия', error);
});
