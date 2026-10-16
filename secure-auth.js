const FIREBASE_VERSION = '12.19.0';
const runtime = window.PirateFirebaseConfig.forLocation(window.location);

const appModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`);
const authModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
const storeModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`);
const { default: makeQrCode } = await import('./vendor/qrcode.mjs');

const app = appModule.initializeApp(runtime.firebase, runtime.useEmulators ? 'pirate-secure-emulator' : 'pirate-secure-production');
const auth = authModule.getAuth(app);
const db = storeModule.getFirestore(app);
if (runtime.useEmulators) {
  authModule.connectAuthEmulator(auth, runtime.authEmulatorUrl, { disableWarnings: true });
  storeModule.connectFirestoreEmulator(db, runtime.firestoreEmulatorHost, runtime.firestoreEmulatorPort);
}
const { configure: configureSecureData } = await import('./secure-data.js?v=20261016-archive1');
const secureData = configureSecureData({ db, auth, storeModule });

let currentSession = null;
let provisioningAuth = null;
let revokingStudentSession = false;

function requirePinLogin() {
  if (!runtime.studentPinLoginEnabled) throw new Error('Вход учеников по ПИН временно недоступен.');
}

function randomDigits(length = 6) {
  const range = 10 ** length;
  const limit = Math.floor(0x100000000 / range) * range;
  const values = new Uint32Array(1);
  do crypto.getRandomValues(values); while (values[0] >= limit);
  return String(values[0] % range).padStart(length, '0');
}

function technicalLogin() {
  return `pupil-${crypto.randomUUID().replaceAll('-', '')}@students.finzozh.invalid`;
}

function getProvisioningAuth() {
  requirePinLogin();
  if (provisioningAuth) return provisioningAuth;
  const name = runtime.useEmulators ? 'pirate-student-provisioning-emulator' : 'pirate-student-provisioning-production';
  const secondary = appModule.getApps().find(item => item.name === name) || appModule.initializeApp(runtime.firebase, name);
  provisioningAuth = authModule.getAuth(secondary);
  if (runtime.useEmulators) {
    authModule.connectAuthEmulator(provisioningAuth, runtime.authEmulatorUrl, { disableWarnings: true });
  }
  return provisioningAuth;
}

function escapeMarkup(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function token() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function safeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function messageFor(error) {
  const code = String(error?.code || '');
  if (code.includes('invalid-credential') || code.includes('wrong-password')) return 'Неверный email или пароль.';
  if (code.includes('too-many-requests')) return 'Слишком много попыток. Повторите позже.';
  if (code.includes('user-not-found')) return 'Учётная запись не найдена.';
  if (code.includes('weak-password')) return 'Новый пароль должен содержать не менее 6 символов.';
  if (code.includes('permission-denied')) return 'Доступ запрещён правилами безопасности.';
  return error?.message || 'Не удалось выполнить операцию.';
}

function studentLoginMessage(error) {
  if (String(error?.code || '').includes('too-many-requests')) return 'Слишком много попыток. Повторите позже.';
  return 'Не удалось войти. Проверьте выбранное имя и ПИН.';
}

function setSession(session) {
  currentSession = session;
  window.__pirateSecureSession = session;
}

function normalizeStudent(id, data) {
  return {
    id,
    name: data.displayName || 'Ученик',
    flag: data.flag || '🏴‍☠️',
    avatarId: data.avatarId || 'captain-boy',
    avatarSrc: data.avatarSrc || 'student-avatar-captain-boy.webp',
    balance: Number(data.balance || 0),
    fincoins_balance: Number(data.balance || 0),
    lifetimeEarned: Number(data.lifetimeEarned || 0),
    achievements: Array.isArray(data.achievements) ? data.achievements : [],
    manualAchievements: Array.isArray(data.manualAchievements) ? data.manualAchievements : [],
    ownerUid: data.ownerUid || null
  };
}

function normalizeClass(snapshot, students = []) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    name: data.name || 'Класс',
    teacherUid: data.teacherUid,
    students,
    transactions: [],
    requests: [],
    rewards: [],
    seasons: [],
    currentSeasonId: null
  };
}

async function loadTeacherDataLegacy(user) {
  const classQuery = storeModule.query(
    storeModule.collection(db, 'classes'),
    storeModule.where('teacherUid', '==', user.uid)
  );
  const classSnapshots = await storeModule.getDocs(classQuery);
  const classes = await Promise.all(classSnapshots.docs.map(async classSnapshot => {
    const students = await storeModule.getDocs(storeModule.collection(db, 'classes', classSnapshot.id, 'students'));
    return normalizeClass(classSnapshot, students.docs.map(item => normalizeStudent(item.id, item.data())));
  }));
  window.PirateSecureBridge.hydrateTeacher(classes);
  setSession({ role: 'teacher', uid: user.uid, email: user.email, classId: null, studentId: null });
  return currentSession;
}

async function loadStudentDataLegacy(user) {
  const bindingSnapshot = await storeModule.getDoc(storeModule.doc(db, 'studentBindings', user.uid));
  if (!bindingSnapshot.exists()) return null;
  const binding = bindingSnapshot.data();
  const [classSnapshot, studentSnapshot] = await Promise.all([
    storeModule.getDoc(storeModule.doc(db, 'classes', binding.classId)),
    storeModule.getDoc(storeModule.doc(db, 'classes', binding.classId, 'students', binding.studentId))
  ]);
  if (!classSnapshot.exists() || !studentSnapshot.exists() || studentSnapshot.data().ownerUid !== user.uid) return null;
  const student = normalizeStudent(studentSnapshot.id, studentSnapshot.data());
  window.PirateSecureBridge.hydrateStudent(normalizeClass(classSnapshot), student);
  setSession({ role: 'student', uid: user.uid, classId: binding.classId, studentId: binding.studentId });
  return currentSession;
}

async function loadTeacherData(user) {
  setSession({ role: 'teacher', uid: user.uid, email: user.email, classId: null, studentId: null });
  await secureData.startRealtime(currentSession);
  return currentSession;
}

async function loadStudentData(user) {
  const bindingSnapshot = await storeModule.getDoc(storeModule.doc(db, 'studentBindings', user.uid));
  if (!bindingSnapshot.exists()) return null;
  const binding = bindingSnapshot.data();
  const profile = await storeModule.getDoc(storeModule.doc(db, 'classes', binding.classId, 'students', binding.studentId));
  if (!profile.exists() || profile.data().ownerUid !== user.uid) return null;
  setSession({ role: 'student', uid: user.uid, classId: binding.classId, studentId: binding.studentId });
  await secureData.startRealtime(currentSession);
  return currentSession;
}

async function authorizedTeacher(user) {
  if (!user || user.isAnonymous) return false;
  const snapshot = await storeModule.getDoc(storeModule.doc(db, 'authorizedTeachers', user.uid));
  return snapshot.exists() && snapshot.data().active === true;
}

async function restoreSession() {
  const user = await new Promise(resolve => {
    const unsubscribe = authModule.onAuthStateChanged(auth, value => {
      unsubscribe();
      resolve(value);
    });
  });
  if (!user) return null;
  if (user.isAnonymous) return loadStudentData(user);
  if (await authorizedTeacher(user)) return loadTeacherData(user);
  const student = await loadStudentData(user).catch(() => null);
  if (student) return student;
  await authModule.signOut(auth);
  return null;
}

async function teacherLogin(email, password, remember) {
  await authModule.setPersistence(auth, remember ? authModule.browserLocalPersistence : authModule.browserSessionPersistence);
  if (auth.currentUser) await authModule.signOut(auth);
  const credential = await authModule.signInWithEmailAndPassword(auth, email, password);
  if (!await authorizedTeacher(credential.user)) {
    await authModule.signOut(auth);
    throw new Error('Учётная запись не имеет защищённой роли учителя.');
  }
  return loadTeacherData(credential.user);
}

async function resetPassword(email) {
  if (!email) throw new Error('Введите email учителя.');
  await authModule.sendPasswordResetEmail(auth, email);
}

async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous || !user.email) throw new Error('Сессия учителя не найдена.');
  const credential = authModule.EmailAuthProvider.credential(user.email, currentPassword);
  await authModule.reauthenticateWithCredential(user, credential);
  await authModule.updatePassword(user, newPassword);
}

async function ensureLoginCatalog(classId) {
  requirePinLogin();
  const classDocument = storeModule.doc(db, 'classes', classId);
  const classSnapshot = await storeModule.getDoc(classDocument);
  if (!classSnapshot.exists()) throw new Error('Класс не найден.');
  const existing = classSnapshot.data().loginCatalogId;
  if (existing) return existing;
  const catalogId = safeId('catalog');
  const batch = storeModule.writeBatch(db);
  batch.update(classDocument, { loginCatalogId: catalogId });
  batch.set(storeModule.doc(db, 'studentLoginCatalogOwners', catalogId), {
    teacherUid: auth.currentUser.uid,
    classId,
    createdAt: storeModule.serverTimestamp()
  });
  batch.set(storeModule.doc(db, 'studentLoginClasses', catalogId), {
    displayName: String(classSnapshot.data().name || 'Класс').slice(0, 60),
    active: true,
    updatedAt: storeModule.serverTimestamp()
  });
  await batch.commit();
  return catalogId;
}

async function createPasswordAccount(pin) {
  requirePinLogin();
  if (!/^\d{6}$/.test(pin)) throw new Error('ПИН должен состоять ровно из шести цифр.');
  const secondaryAuth = getProvisioningAuth();
  if (!runtime.useEmulators) {
    const passwordStatus = await authModule.validatePassword(secondaryAuth, pin);
    if (!passwordStatus.isValid) {
      throw new Error('Политика паролей Firebase не допускает шестизначный цифровой ПИН. Проверьте Authentication → Settings → Password policy.');
    }
  }
  if (secondaryAuth.currentUser) await authModule.signOut(secondaryAuth);
  const authLogin = technicalLogin();
  const credential = await authModule.createUserWithEmailAndPassword(secondaryAuth, authLogin, pin);
  const uid = credential.user.uid;
  await authModule.signOut(secondaryAuth);
  return { uid, authLogin };
}

async function bindPasswordStudent({ classId, studentId, displayName, avatarId, avatarSrc, account, reset = false }) {
  const catalogId = await ensureLoginCatalog(classId);
  const profileRef = storeModule.doc(db, 'classes', classId, 'students', studentId);
  const profileSnapshot = await storeModule.getDoc(profileRef);
  if (!profileSnapshot.exists()) throw new Error('Ученик не найден.');
  const profile = profileSnapshot.data();
  const entryId = profile.loginEntryId || safeId('pupil');
  const version = Number(profile.credentialVersion || 0) + 1;
  const batch = storeModule.writeBatch(db);
  if (reset && profile.ownerUid) batch.delete(storeModule.doc(db, 'studentBindings', profile.ownerUid));
  batch.update(profileRef, {
    ownerUid: account.uid,
    authMode: 'pin-password',
    loginCatalogId: catalogId,
    loginEntryId: entryId,
    credentialVersion: version,
    bindingInviteId: null,
    updatedAt: storeModule.serverTimestamp()
  });
  batch.set(storeModule.doc(db, 'studentBindings', account.uid), {
    teacherUid: profile.teacherUid,
    classId,
    studentId,
    loginCatalogId: catalogId,
    loginEntryId: entryId,
    credentialVersion: version,
    createdAt: storeModule.serverTimestamp()
  });
  batch.set(storeModule.doc(db, 'studentLoginClasses', catalogId, 'students', entryId), {
    displayName: String(displayName || profile.displayName || 'Ученик').trim().slice(0, 40),
    avatarId: String(avatarId || profile.avatarId || '').slice(0, 60),
    avatarSrc: String(avatarSrc || profile.avatarSrc || '').slice(0, 200),
    authLogin: account.authLogin,
    active: true,
    updatedAt: storeModule.serverTimestamp()
  });
  await batch.commit();
  await secureData.refresh();
  return { catalogId, entryId, version };
}

async function createStudentWithPin(classId, input) {
  requirePinLogin();
  const teacherUid = auth.currentUser?.uid;
  if (!currentSession || currentSession.role !== 'teacher' || !teacherUid) throw new Error('Требуется вход учителя.');
  const displayName = String(input?.displayName || '').trim();
  if (!displayName || displayName.length > 40) throw new Error('Укажите игровой псевдоним длиной до 40 символов.');
  const studentId = await secureData.createStudent(classId, { ...input, displayName });
  const pin = randomDigits(6);
  const account = await createPasswordAccount(pin);
  if (auth.currentUser?.uid !== teacherUid) throw new Error('Сессия учителя неожиданно изменилась.');
  await bindPasswordStudent({ classId, studentId, displayName, avatarId: input.avatarId, avatarSrc: input.avatarSrc, account });
  return { studentId, pin };
}

async function resetStudentPin(classId, studentId) {
  requirePinLogin();
  if (!currentSession || currentSession.role !== 'teacher' || !auth.currentUser) throw new Error('Требуется вход учителя.');
  const profile = await storeModule.getDoc(storeModule.doc(db, 'classes', classId, 'students', studentId));
  if (!profile.exists()) throw new Error('Ученик не найден.');
  const pin = randomDigits(6);
  const account = await createPasswordAccount(pin);
  await bindPasswordStudent({
    classId,
    studentId,
    displayName: profile.data().displayName,
    avatarId: profile.data().avatarId,
    avatarSrc: profile.data().avatarSrc,
    account,
    reset: true
  });
  return { pin };
}

async function ensureCatalogReader() {
  if (!auth.currentUser) {
    await authModule.setPersistence(auth, authModule.browserSessionPersistence);
    await authModule.signInAnonymously(auth);
  }
}

async function loadStudentLoginCatalog() {
  requirePinLogin();
  await ensureCatalogReader();
  const classes = await storeModule.getDocs(storeModule.collection(db, 'studentLoginClasses'));
  const result = [];
  for (const classDocument of classes.docs.filter(item => item.data().active === true)) {
    const students = await storeModule.getDocs(storeModule.collection(db, 'studentLoginClasses', classDocument.id, 'students'));
    result.push({
      id: classDocument.id,
      displayName: classDocument.data().displayName,
      students: students.docs.filter(item => item.data().active === true).map(item => ({ id: item.id, ...item.data() }))
    });
  }
  return result.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ru'));
}

async function studentPinLogin(catalogId, entryId, pin) {
  requirePinLogin();
  if (!/^\d{6}$/.test(String(pin || ''))) throw new Error('invalid-pin');
  await ensureCatalogReader();
  const entry = await storeModule.getDoc(storeModule.doc(db, 'studentLoginClasses', catalogId, 'students', entryId));
  if (!entry.exists() || entry.data().active !== true) throw new Error('invalid-student');
  await authModule.setPersistence(auth, authModule.browserLocalPersistence);
  const credential = await authModule.signInWithEmailAndPassword(auth, entry.data().authLogin, pin);
  const session = await loadStudentData(credential.user);
  if (!session) {
    await authModule.signOut(auth);
    throw new Error('invalid-binding');
  }
  return session;
}

async function claimInvitation(rawToken) {
  const inviteId = String(rawToken || '').trim();
  if (inviteId.length < 32) throw new Error('Код приглашения имеет неверный формат.');
  if (auth.currentUser && !auth.currentUser.isAnonymous) await authModule.signOut(auth);
  await authModule.setPersistence(auth, authModule.browserLocalPersistence);
  const user = auth.currentUser?.isAnonymous
    ? auth.currentUser
    : (await authModule.signInAnonymously(auth)).user;
  const inviteRef = storeModule.doc(db, 'studentInvites', inviteId);
  const inviteSnapshot = await storeModule.getDoc(inviteRef);
  if (!inviteSnapshot.exists()) throw new Error('Приглашение не найдено или уже недоступно.');
  const invite = inviteSnapshot.data();
  const batch = storeModule.writeBatch(db);
  batch.update(inviteRef, { claimedBy: user.uid, claimedAt: storeModule.serverTimestamp() });
  batch.update(storeModule.doc(db, 'classes', invite.classId, 'students', invite.studentId), {
    ownerUid: user.uid,
    bindingInviteId: inviteId
  });
  batch.set(storeModule.doc(db, 'studentBindings', user.uid), {
    teacherUid: invite.teacherUid,
    classId: invite.classId,
    studentId: invite.studentId,
    inviteId,
    createdAt: storeModule.serverTimestamp()
  });
  await batch.commit();
  return loadStudentData(user);
}

async function createClassLegacy(name) {
  const user = auth.currentUser;
  if (!currentSession || currentSession.role !== 'teacher' || !user) throw new Error('Требуется вход учителя.');
  const classId = safeId('class');
  await storeModule.setDoc(storeModule.doc(db, 'classes', classId), {
    teacherUid: user.uid,
    name: name.trim(),
    createdAt: storeModule.serverTimestamp()
  });
  await loadTeacherData(user);
  return classId;
}

async function createStudentWithInviteLegacy(classId, displayName) {
  const user = auth.currentUser;
  if (!currentSession || currentSession.role !== 'teacher' || !user) throw new Error('Требуется вход учителя.');
  const studentId = safeId('student');
  const inviteId = token();
  const batch = storeModule.writeBatch(db);
  batch.set(storeModule.doc(db, 'classes', classId, 'students', studentId), {
    teacherUid: user.uid,
    classId,
    studentId,
    displayName: displayName.trim(),
    ownerUid: null,
    balance: 0,
    lifetimeEarned: 0,
    achievements: [],
    manualAchievements: [],
    createdAt: storeModule.serverTimestamp()
  });
  batch.set(storeModule.doc(db, 'studentInvites', inviteId), {
    teacherUid: user.uid,
    classId,
    studentId,
    expiresAt: storeModule.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
    claimedBy: null,
    createdAt: storeModule.serverTimestamp()
  });
  await batch.commit();
  await loadTeacherData(user);
  return { studentId, inviteId };
}

async function createClass(name) {
  const classId = await secureData.createClass(name);
  if (runtime.studentPinLoginEnabled) await ensureLoginCatalog(classId);
  return classId;
}

async function createStudentWithInvite(classId, displayName) {
  const user = auth.currentUser;
  if (!currentSession || currentSession.role !== 'teacher' || !user) throw new Error('Требуется вход учителя.');
  const inviteId = token();
  const studentId = await secureData.createStudentWithInvite(
    classId,
    { displayName },
    inviteId,
    storeModule.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)
  );
  return { studentId, inviteId };
}

async function reissueInvitation(classId, studentId) {
  const user = auth.currentUser;
  if (!currentSession || currentSession.role !== 'teacher' || !user) throw new Error('Требуется вход учителя.');
  const profileRef = storeModule.doc(db, 'classes', classId, 'students', studentId);
  const inviteQuery = storeModule.query(
    storeModule.collection(db, 'studentInvites'),
    storeModule.where('teacherUid', '==', user.uid)
  );
  const allInvites = await storeModule.getDocs(inviteQuery);
  const inviteId = token();
  await storeModule.runTransaction(db, async transaction => {
    const profile = await transaction.get(profileRef);
    if (!profile.exists()) throw new Error('Профиль ученика не найден.');
    const profileData = profile.data();
    allInvites.docs
      .filter(item => item.data().classId === classId && item.data().studentId === studentId && item.data().claimedBy === null)
      .forEach(item => transaction.delete(item.ref));
    if (profileData.ownerUid) transaction.delete(storeModule.doc(db, 'studentBindings', profileData.ownerUid));
    transaction.update(profileRef, { ownerUid: null, bindingInviteId: null });
    transaction.set(storeModule.doc(db, 'studentInvites', inviteId), {
      teacherUid: user.uid,
      classId,
      studentId,
      expiresAt: storeModule.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
      claimedBy: null,
      createdAt: storeModule.serverTimestamp()
    });
  });
  await loadTeacherData(user);
  return inviteId;
}

async function logout() {
  secureData.stopRealtime();
  await authModule.signOut(auth);
  setSession(null);
  window.PirateSecureBridge.clear();
  history.replaceState(null, '', `${location.pathname}${runtime.useEmulators ? '?emulator=1' : ''}#/`);
  location.reload();
}

async function closeRevokedStudentSession() {
  if (revokingStudentSession || currentSession?.role !== 'student') return;
  revokingStudentSession = true;
  secureData.stopRealtime();
  await authModule.signOut(auth).catch(() => {});
  setSession(null);
  window.PirateSecureBridge.clear();
  history.replaceState(null, '', `${location.pathname}${runtime.useEmulators ? '?emulator=1' : ''}#/login/student`);
  location.reload();
}

function inviteUrl(inviteId) {
  const params = new URLSearchParams();
  if (runtime.useEmulators) params.set('emulator', '1');
  params.set('invite', inviteId);
  return `${location.origin}${location.pathname}?${params.toString()}#/login/student`;
}

function showGeneratedPin(displayName, pin, reset = false) {
  let modal = document.getElementById('secure-generated-pin');
  if (!modal) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="secure-generated-pin" class="modal-overlay" onclick="closeModalOverlay(event)">
        <div class="secure-pin-card" role="dialog" aria-modal="true" aria-labelledby="secure-generated-pin-title">
          <button class="secure-panel-close" type="button" aria-label="Закрыть">×</button>
          <span class="secure-pin-wheel" aria-hidden="true">☸</span>
          <h2 id="secure-generated-pin-title">Новый ПИН ученика</h2>
          <p id="secure-generated-pin-name"></p>
          <output id="secure-generated-pin-value"></output>
          <p class="secure-note">Покажите или распечатайте ПИН сейчас. В приложении он больше не отображается и не сохраняется.</p>
          <button id="secure-copy-pin" type="button">Скопировать ПИН</button>
        </div>
      </div>`);
    modal = document.getElementById('secure-generated-pin');
    modal.querySelector('.secure-panel-close').addEventListener('click', () => modal.classList.remove('active'));
  }
  modal.querySelector('#secure-generated-pin-title').textContent = reset ? 'ПИН ученика обновлён' : 'ПИН ученика создан';
  modal.querySelector('#secure-generated-pin-name').textContent = displayName;
  modal.querySelector('#secure-generated-pin-value').textContent = pin;
  modal.querySelector('#secure-copy-pin').onclick = async () => {
    await navigator.clipboard.writeText(pin);
    modal.querySelector('#secure-copy-pin').textContent = 'Скопировано';
  };
  modal.querySelector('#secure-copy-pin').textContent = 'Скопировать ПИН';
  modal.classList.add('active');
}

function installTeacherPanel() {
  if (document.getElementById('secure-auth-panel-button')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <button id="secure-auth-panel-button" class="secure-panel-button" type="button">🔐 Доступ учеников</button>
    <div id="secure-auth-panel" class="modal-overlay" onclick="closeModalOverlay(event)">
      <div class="secure-panel" role="dialog" aria-modal="true" aria-labelledby="secure-panel-title">
        <button class="secure-panel-close" type="button" aria-label="Закрыть">×</button>
        <header class="secure-panel-header">
          <span class="secure-panel-emblem" aria-hidden="true">⚓</span>
          <div>
            <span class="secure-panel-kicker">Капитанская карта доступа</span>
            <h2 id="secure-panel-title">Защищённый доступ</h2>
            <p>Управление экипажами и личными ключами учеников</p>
          </div>
        </header>
        <p class="secure-note"><span aria-hidden="true">🔐</span><span>${runtime.useEmulators ? 'Локальная тестовая гавань Firebase Emulator. Рабочие данные не используются.' : 'Доступ защищён Firebase и связан с текущим приложением «ФинЗОЖ».'}</span></p>
        <section class="secure-panel-section">
          <div class="secure-section-heading"><span class="secure-section-icon" aria-hidden="true">🏴‍☠️</span><div><h3>Новый класс</h3><p>Создайте экипаж для учеников курса</p></div></div>
          <div class="secure-row"><input id="secure-class-name" placeholder="Например: 8А — Морские волки"><button id="secure-create-class" type="button">Создать класс</button></div>
        </section>
        <section class="secure-panel-section">
          <div class="secure-section-heading"><span class="secure-section-icon" aria-hidden="true">🗝️</span><div><h3>${runtime.studentPinLoginEnabled ? 'Ученик и ПИН' : 'Ученик и приглашение'}</h3><p>${runtime.studentPinLoginEnabled ? 'Добавьте пирата в экипаж и выдайте личный ключ' : 'Добавьте ученика и подготовьте персональное приглашение'}</p></div></div>
          <label class="secure-field-label"><span>Выберите класс</span><select id="secure-class-select"></select></label>
          <div class="secure-row"><input id="secure-student-name" placeholder="Игровое имя или псевдоним"><button id="secure-create-student" type="button">${runtime.studentPinLoginEnabled ? 'Создать и выдать ПИН' : 'Создать и выдать код'}</button></div>
          <div id="secure-students" class="secure-student-list"></div>
        </section>
        <section class="secure-panel-section secure-password-section">
          <div class="secure-section-heading"><span class="secure-section-icon" aria-hidden="true">🧭</span><div><h3>Пароль капитана</h3><p>Обновите пароль учительской учётной записи</p></div></div>
          <div class="secure-row"><input id="secure-current-password" type="password" autocomplete="current-password" placeholder="Текущий пароль"><input id="secure-new-password" type="password" autocomplete="new-password" placeholder="Новый пароль"><button id="secure-change-password" type="button">Сменить пароль</button></div>
        </section>
        <output id="secure-panel-message" class="secure-message"></output><div id="secure-invite-qr" class="secure-invite-qr" aria-label="QR-код приглашения"></div>
      </div>
    </div>`);
  document.getElementById('secure-auth-panel-button').addEventListener('click', () => {
    renderTeacherPanel();
    document.getElementById('secure-auth-panel').classList.add('active');
  });
  document.querySelector('.secure-panel-close').addEventListener('click', () => document.getElementById('secure-auth-panel').classList.remove('active'));
  document.getElementById('secure-create-class').addEventListener('click', async () => runPanelAction(async () => {
    const name = document.getElementById('secure-class-name').value.trim();
    if (!name) throw new Error('Введите название класса.');
    await createClass(name);
    document.getElementById('secure-class-name').value = '';
    renderTeacherPanel();
    renderTeacherView();
    return 'Класс создан.';
  }));
  document.getElementById('secure-create-student').addEventListener('click', async () => runPanelAction(async () => {
    const classId = document.getElementById('secure-class-select').value;
    const name = document.getElementById('secure-student-name').value.trim();
    if (!classId || !name) throw new Error('Выберите класс и введите имя ученика.');
    const result = runtime.studentPinLoginEnabled
      ? await createStudentWithPin(classId, { displayName: name })
      : await createStudentWithInvite(classId, name);
    document.getElementById('secure-student-name').value = '';
    renderTeacherPanel(result.inviteId || '');
    renderTeacherView();
    if (runtime.studentPinLoginEnabled) {
      showGeneratedPin(name, result.pin);
      return 'Ученик создан. ПИН показан один раз.';
    }
    return `Одноразовый код создан и действует 24 часа: ${result.inviteId}`;
  }));
  document.getElementById('secure-change-password').addEventListener('click', async () => runPanelAction(async () => {
    await changePassword(document.getElementById('secure-current-password').value, document.getElementById('secure-new-password').value);
    document.getElementById('secure-current-password').value = '';
    document.getElementById('secure-new-password').value = '';
    return 'Пароль изменён.';
  }));
}

async function runPanelAction(action) {
  const output = document.getElementById('secure-panel-message');
  try {
    output.className = 'secure-message';
    output.textContent = 'Выполняется…';
    output.textContent = await action();
    output.classList.add('success');
  } catch (error) {
    output.textContent = messageFor(error);
    output.classList.add('error');
  }
}

function renderTeacherPanel(highlightInvite = '') {
  const select = document.getElementById('secure-class-select');
  if (!select) return;
  document.getElementById('secure-invite-qr').innerHTML = '';
  const data = window.PirateSecureBridge.getData();
  const classes = data.classes || [];
  select.innerHTML = classes.map(item => `<option value="${escapeMarkup(item.id)}">${escapeMarkup(item.name)}</option>`).join('');
  if (data.currentClassId && classes.some(item => item.id === data.currentClassId)) select.value = data.currentClassId;
  renderPanelStudents(select.value, highlightInvite);
  select.onchange = () => renderPanelStudents(select.value);
}

function renderPanelStudents(classId, highlightInvite = '') {
  const selectedClass = window.PirateSecureBridge.getData().classes.find(item => item.id === classId);
  const output = document.getElementById('secure-students');
  const students = selectedClass?.students || [];
  output.innerHTML = students.length ? students.map(student => {
    return `<div class="secure-student-row"><span class="secure-student-name"><span class="secure-student-mark" aria-hidden="true">⚓</span>${escapeMarkup(student.name)}</span><button type="button" data-reissue="${escapeMarkup(student.id)}">${runtime.studentPinLoginEnabled ? 'Сбросить ПИН' : 'Новое приглашение'}</button></div>`;
  }).join('') : '<p>В выбранном классе пока нет учеников.</p>';
  output.querySelectorAll('[data-reissue]').forEach(button => button.addEventListener('click', () => runPanelAction(async () => {
    if (runtime.studentPinLoginEnabled) {
      const student = selectedClass.students.find(item => item.id === button.dataset.reissue);
      const result = await resetStudentPin(classId, button.dataset.reissue);
      renderTeacherPanel();
      renderTeacherView();
      showGeneratedPin(student?.name || 'Ученик', result.pin, true);
      return 'Старые сессии отозваны. Новый ПИН показан один раз.';
    }
    const nextToken = await reissueInvitation(classId, button.dataset.reissue);
    renderTeacherPanel(nextToken);
    renderTeacherView();
    return `Старая привязка отозвана. Новый код действует 24 часа: ${nextToken}\n${inviteUrl(nextToken)}`;
  })));
  if (highlightInvite) {
    const message = document.getElementById('secure-panel-message');
    const url = inviteUrl(highlightInvite);
    message.textContent = `${highlightInvite}\n${url}`;
    const qr = makeQrCode(0, 'M');
    qr.addData(url);
    qr.make();
    document.getElementById('secure-invite-qr').innerHTML = qr.createSvgTag({
      cellSize: 4,
      margin: 4,
      scalable: true,
      title: 'Одноразовое приглашение ученика',
      alt: 'QR-код ссылки для входа ученика'
    });
  }
}

export async function mountLogin({ view, screen, teacherPage, studentPage, cards, arrow, sabres, play }) {
  await restoreSession();
  document.documentElement.classList.toggle('secure-pin-prototype', runtime.studentPinLoginEnabled);
  const securePinSlots = () => `<div class="pin-slots" id="secure-student-slots" aria-label="ПИН-код из шести цифр">${Array.from({ length: 6 }, () => '<i></i>').join('')}</div>`;
  const securePinKeypad = () => `<div class="pin-keypad" id="secure-student-keypad">${['1','2','3','4','5','6','7','8','9'].map(value => `<button type="button" data-pin-value="${value}">${value}</button>`).join('')}<button type="button" class="pin-key-special" data-pin-action="back" aria-label="Удалить последнюю цифру">⌫</button><button type="button" data-pin-value="0">0</button><button type="button" class="pin-key-special" data-pin-action="submit" aria-label="Открыть кабинет">→</button></div>`;
  teacherPage.querySelector('.pin-dialog').innerHTML = `
    <h2>Вход учителя</h2><p>${runtime.useEmulators ? 'Firebase Authentication · локальный эмулятор' : 'Защищённый вход Firebase Authentication'}</p>
    <label class="secure-login-label">Email<input id="secure-teacher-email" type="email" autocomplete="username"></label>
    <label class="secure-login-label">Пароль<input id="secure-teacher-password" type="password" autocomplete="current-password"></label>
    <label class="secure-remember"><input id="secure-teacher-remember" type="checkbox" checked> Сохранить вход на этом устройстве</label>
    <p class="pin-message" id="secure-teacher-message" role="alert"></p>
    <button class="pin-submit" id="secure-teacher-submit" type="button"><span>Войти</span>${arrow}</button>
    <button class="secure-link" id="secure-teacher-reset" type="button">Восстановить пароль</button>
    <button class="pin-home" type="button" data-login-home>← На главную</button>`;
  studentPage.querySelector('.pin-dialog').innerHTML = runtime.studentPinLoginEnabled ? `
    <section class="pin-student-picker">
      <header><h2>Выбери своего героя</h2><p>Нажми на аватар со своим игровым именем</p></header>
      <label class="pin-class-row" id="secure-student-class-row">Наш класс<select id="secure-student-class" aria-label="Выберите класс"><option value="">Загрузка классов…</option></select></label>
      <div class="pin-student-grid" id="secure-student-grid"></div>
      <div class="pin-pagination" id="secure-student-pagination"></div>
    </section>
    <section class="pin-student-auth disabled" id="secure-student-auth" aria-live="polite">
      <div class="pin-selected-avatar" id="secure-selected-avatar">${sabres || ''}</div>
      <h2 id="secure-selected-name">Выберите героя</h2>
      <p id="secure-student-copy">Сначала нажмите на свой аватар</p>
      ${securePinSlots()}
      <p class="pin-message" id="secure-student-message" role="alert"></p>
      ${securePinKeypad()}
      <button class="pin-submit" id="secure-student-submit" type="button"><span>Открыть кабинет</span>${arrow}</button>
      <button class="pin-change-student" type="button" data-change-student>← Сменить ученика</button>
    </section>
    <button class="pin-home pin-student-home" type="button" data-login-home>← На главную</button>` : `
    <section class="pin-student-auth secure-student-auth">
      <h2>Вход ученика</h2><p>Введите персональный одноразовый код приглашения</p>
      <label class="secure-login-label">Код приглашения<input id="secure-invite-code" type="text" autocomplete="one-time-code" spellcheck="false"></label>
      <p class="pin-message" id="secure-student-message" role="alert"></p>
      <button class="pin-submit" id="secure-student-submit" type="button"><span>Открыть кабинет</span>${arrow}</button>
      <button class="pin-home" type="button" data-login-home>← На главную</button>
    </section>`;

  const showMessage = (id, value, success = false) => {
    const element = document.getElementById(id);
    element.textContent = value;
    element.className = `pin-message ${success ? 'success' : 'error'}`;
  };
  const showLogin = () => {
    document.querySelectorAll('.view').forEach(item => item.classList.remove('active'));
    view.classList.add('active');
  };
  const route = async () => {
    const hash = location.hash || '#/';
    if (hash === '#/teacher' && currentSession?.role === 'teacher') {
      loginAsTeacher(true);
      installTeacherPanel();
      return;
    }
    if (hash === '#/student' && currentSession?.role === 'student') {
      loginAsStudent(true, currentSession.classId, currentSession.studentId);
      return;
    }
    showLogin();
    const teacher = hash === '#/login/teacher';
    const student = hash === '#/login/student';
    screen.classList.toggle('is-pin-route', teacher || student);
    screen.classList.toggle('is-teacher-route', teacher);
    screen.classList.toggle('is-student-route', student);
    cards.hidden = teacher || student;
    teacherPage.classList.toggle('active', teacher);
    studentPage.classList.toggle('active', student);
  };
  const go = hash => {
    history.pushState(null, '', hash);
    route();
  };
  window.LoginRoutes = { home: () => go('#/'), teacher: () => go('#/login/teacher'), student: () => go('#/login/student') };
  view.querySelector('#lr-teacher-enter').addEventListener('click', () => { play('click'); go('#/login/teacher'); });
  view.querySelector('#lr-student-enter').addEventListener('click', () => { play('click'); go('#/login/student'); });
  view.querySelectorAll('[data-login-home]').forEach(button => button.addEventListener('click', () => go('#/')));
  document.getElementById('secure-teacher-submit').addEventListener('click', async () => {
    try {
      await teacherLogin(
        document.getElementById('secure-teacher-email').value.trim(),
        document.getElementById('secure-teacher-password').value,
        document.getElementById('secure-teacher-remember').checked
      );
      history.replaceState(null, '', '#/teacher');
      play('success');
      await route();
    } catch (error) { showMessage('secure-teacher-message', messageFor(error)); }
  });
  document.getElementById('secure-teacher-reset').addEventListener('click', async () => {
    try {
      await resetPassword(document.getElementById('secure-teacher-email').value.trim());
      showMessage('secure-teacher-message', runtime.useEmulators ? 'Ссылка восстановления создана эмулятором и показана в его консоли.' : 'Письмо для восстановления пароля отправлено.', true);
    } catch (error) { showMessage('secure-teacher-message', messageFor(error)); }
  });
  if (runtime.studentPinLoginEnabled) {
    const classSelect = document.getElementById('secure-student-class');
    let catalog = [];
    let selectedEntryId = '';
    let enteredPin = '';
    let studentPageIndex = 0;
    const currentCatalogClass = () => catalog.find(item => item.id === classSelect.value);
    const currentCatalogStudent = () => currentCatalogClass()?.students.find(item => item.id === selectedEntryId);
    const updateSecurePinSlots = () => {
      document.querySelectorAll('#secure-student-slots i').forEach((slot, index) => slot.classList.toggle('filled', index < enteredPin.length));
    };
    const updateSelectedHero = () => {
      const student = currentCatalogStudent();
      const authPanel = document.getElementById('secure-student-auth');
      authPanel.classList.toggle('disabled', !student);
      document.getElementById('secure-selected-avatar').innerHTML = student ? window.renderStudentAvatar(student) : (sabres || '');
      document.getElementById('secure-selected-name').textContent = student?.displayName || 'Выберите героя';
      document.getElementById('secure-student-copy').textContent = student ? 'Введите личный ПИН из шести цифр' : 'Сначала нажмите на свой аватар';
    };
    const renderStudentHeroes = () => {
      const students = currentCatalogClass()?.students || [];
      const pageSize = 6;
      const pageCount = Math.max(1, Math.ceil(students.length / pageSize));
      studentPageIndex = Math.min(studentPageIndex, pageCount - 1);
      const visible = students.slice(studentPageIndex * pageSize, studentPageIndex * pageSize + pageSize);
      const grid = document.getElementById('secure-student-grid');
      grid.innerHTML = visible.length
        ? visible.map(student => `<button class="pin-student-card${student.id === selectedEntryId ? ' selected' : ''}" type="button" data-student-id="${escapeMarkup(student.id)}"><span>${window.renderStudentAvatar(student)}</span><strong>${escapeMarkup(student.displayName)}</strong></button>`).join('')
        : '<p class="pin-empty">В этом классе пока нет учеников</p>';
      grid.querySelectorAll('[data-student-id]').forEach(button => button.addEventListener('click', () => {
        selectedEntryId = button.dataset.studentId;
        enteredPin = '';
        updateSecurePinSlots();
        showMessage('secure-student-message', '', true);
        renderStudentHeroes();
        play('click');
      }));
      const pagination = document.getElementById('secure-student-pagination');
      pagination.innerHTML = pageCount > 1 ? `<button type="button" data-page="prev" aria-label="Предыдущая страница">‹</button><span>${studentPageIndex + 1} / ${pageCount}</span><button type="button" data-page="next" aria-label="Следующая страница">›</button>` : '';
      pagination.querySelector('[data-page="prev"]')?.addEventListener('click', () => { studentPageIndex = Math.max(0, studentPageIndex - 1); renderStudentHeroes(); });
      pagination.querySelector('[data-page="next"]')?.addEventListener('click', () => { studentPageIndex = Math.min(pageCount - 1, studentPageIndex + 1); renderStudentHeroes(); });
      updateSelectedHero();
    };
    const resetHeroSelection = () => {
      selectedEntryId = '';
      enteredPin = '';
      studentPageIndex = 0;
      updateSecurePinSlots();
      showMessage('secure-student-message', '', true);
      renderStudentHeroes();
    };
    document.querySelector('[data-change-student]')?.addEventListener('click', () => {
      resetHeroSelection();
      play('click');
    });
    const refreshCatalog = async () => {
      catalog = await loadStudentLoginCatalog();
      classSelect.innerHTML = catalog.length
        ? catalog.map(item => `<option value="${escapeMarkup(item.id)}">${escapeMarkup(item.displayName)}</option>`).join('')
        : '<option value="">Классы пока не созданы</option>';
      document.getElementById('secure-student-class-row').hidden = catalog.length <= 1;
      resetHeroSelection();
    };
    const addSecurePinDigit = digit => {
      if (!currentCatalogStudent() || enteredPin.length >= 6) return;
      enteredPin += digit;
      updateSecurePinSlots();
      showMessage('secure-student-message', '', true);
      play('click');
    };
    const removeSecurePinDigit = () => {
      enteredPin = enteredPin.slice(0, -1);
      updateSecurePinSlots();
      play('click');
    };
    const submitSecureStudent = async () => {
      const student = currentCatalogStudent();
      if (!student) {
        showMessage('secure-student-message', 'Выберите своего героя.');
        return;
      }
      if (enteredPin.length !== 6) {
        showMessage('secure-student-message', 'Введите все шесть цифр ПИН.');
        const authPanel = document.getElementById('secure-student-auth');
        authPanel.classList.remove('pin-shake');
        requestAnimationFrame(() => authPanel.classList.add('pin-shake'));
        return;
      }
      try {
        const session = await studentPinLogin(classSelect.value, selectedEntryId, enteredPin);
        history.replaceState(null, '', '#/student');
        play('success');
        loginAsStudent(true, session.classId, session.studentId);
      } catch (error) {
        enteredPin = '';
        updateSecurePinSlots();
        showMessage('secure-student-message', studentLoginMessage(error));
      }
    };
    classSelect.addEventListener('change', resetHeroSelection);
    document.querySelectorAll('#secure-student-keypad [data-pin-value]').forEach(button => button.addEventListener('click', () => addSecurePinDigit(button.dataset.pinValue)));
    document.querySelector('#secure-student-keypad [data-pin-action="back"]').addEventListener('click', removeSecurePinDigit);
    document.querySelector('#secure-student-keypad [data-pin-action="submit"]').addEventListener('click', submitSecureStudent);
    document.getElementById('secure-student-submit').addEventListener('click', submitSecureStudent);
    document.addEventListener('keydown', event => {
      if (!studentPage.classList.contains('active') || !view.classList.contains('active')) return;
      if (/^\d$/.test(event.key)) { event.preventDefault(); addSecurePinDigit(event.key); }
      else if (event.key === 'Backspace') { event.preventDefault(); removeSecurePinDigit(); }
      else if (event.key === 'Enter') { event.preventDefault(); submitSecureStudent(); }
    });
    view.querySelector('#lr-student-enter').addEventListener('click', () => refreshCatalog().catch(error => showMessage('secure-student-message', messageFor(error))));
    await refreshCatalog();
  } else {
    document.getElementById('secure-student-submit').addEventListener('click', async () => {
      try {
        const session = await claimInvitation(document.getElementById('secure-invite-code').value);
        history.replaceState(null, '', '#/student');
        play('success');
        loginAsStudent(true, session.classId, session.studentId);
      } catch (error) { showMessage('secure-student-message', messageFor(error)); }
    });
    const queryInvite = new URLSearchParams(location.search).get('invite');
    if (queryInvite) document.getElementById('secure-invite-code').value = queryInvite;
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('pirate-student-access-revoked', closeRevokedStudentSession);
  window.SecureData = secureData;
  window.SecureAuth = {
    enabled: true,
    pinPrototype: runtime.studentPinLoginEnabled,
    pinLoginEnabled: runtime.studentPinLoginEnabled,
    logout,
    changePassword,
    createClass,
    createStudentWithInvite,
    reissueInvitation,
    createStudentWithPin,
    resetStudentPin,
    showGeneratedPin
  };
  if (currentSession?.role === 'teacher') history.replaceState(null, '', '#/teacher');
  else if (currentSession?.role === 'student') history.replaceState(null, '', '#/student');
  await route();
}

export {
  changePassword, claimInvitation, createClass, createStudentWithInvite, createStudentWithPin,
  loadStudentLoginCatalog, logout, randomDigits, reissueInvitation, resetStudentPin, studentPinLogin
};
