const FIREBASE_VERSION = '12.19.0';
const PROJECT_ID = 'demo-pirate-auth';
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

const appModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`);
const authModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`);
const storeModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`);
const { default: makeQrCode } = await import('./vendor/qrcode.mjs');

const app = appModule.initializeApp({
  apiKey: 'demo-api-key',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  appId: 'demo-pirate-auth'
}, 'pirate-secure-emulator');
const auth = authModule.getAuth(app);
const db = storeModule.getFirestore(app);
authModule.connectAuthEmulator(auth, AUTH_EMULATOR, { disableWarnings: true });
storeModule.connectFirestoreEmulator(db, FIRESTORE_HOST, FIRESTORE_PORT);

let currentSession = null;

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

async function loadTeacherData(user) {
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

async function loadStudentData(user) {
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

async function createClass(name) {
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

async function createStudentWithInvite(classId, displayName) {
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
  await authModule.signOut(auth);
  setSession(null);
  window.PirateSecureBridge.clear();
  history.replaceState(null, '', `${location.pathname}?emulator=1#/`);
  location.reload();
}

function inviteUrl(inviteId) {
  return `${location.origin}${location.pathname}?emulator=1&invite=${encodeURIComponent(inviteId)}#/login/student`;
}

function installTeacherPanel() {
  if (document.getElementById('secure-auth-panel-button')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <button id="secure-auth-panel-button" class="secure-panel-button" type="button">🔐 Доступ учеников</button>
    <div id="secure-auth-panel" class="modal-overlay" onclick="closeModalOverlay(event)">
      <div class="secure-panel" role="dialog" aria-modal="true" aria-labelledby="secure-panel-title">
        <button class="secure-panel-close" type="button" aria-label="Закрыть">×</button>
        <h2 id="secure-panel-title">Защищённый доступ · тестовая среда</h2>
        <p class="secure-note">Эти записи существуют только в локальном Firebase Emulator.</p>
        <section><h3>Класс</h3><div class="secure-row"><input id="secure-class-name" placeholder="Название класса"><button id="secure-create-class" type="button">Создать</button></div></section>
        <section><h3>Ученик и приглашение</h3><label>Класс<select id="secure-class-select"></select></label><div class="secure-row"><input id="secure-student-name" placeholder="Имя ученика"><button id="secure-create-student" type="button">Создать и выдать код</button></div><div id="secure-students"></div></section>
        <section><h3>Смена пароля учителя</h3><div class="secure-row"><input id="secure-current-password" type="password" autocomplete="current-password" placeholder="Текущий пароль"><input id="secure-new-password" type="password" autocomplete="new-password" placeholder="Новый пароль"><button id="secure-change-password" type="button">Сменить</button></div></section>
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
    const result = await createStudentWithInvite(classId, name);
    document.getElementById('secure-student-name').value = '';
    renderTeacherPanel(result.inviteId);
    renderTeacherView();
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
    return `<div class="secure-student-row"><span>${escapeMarkup(student.name)}</span><button type="button" data-reissue="${escapeMarkup(student.id)}">Новое приглашение</button></div>`;
  }).join('') : '<p>В выбранном классе пока нет учеников.</p>';
  output.querySelectorAll('[data-reissue]').forEach(button => button.addEventListener('click', () => runPanelAction(async () => {
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

export async function mountLogin({ view, screen, teacherPage, studentPage, cards, arrow, play }) {
  await restoreSession();
  teacherPage.querySelector('.pin-dialog').innerHTML = `
    <h2>Вход учителя</h2><p>Firebase Authentication · локальный эмулятор</p>
    <label class="secure-login-label">Email<input id="secure-teacher-email" type="email" autocomplete="username"></label>
    <label class="secure-login-label">Пароль<input id="secure-teacher-password" type="password" autocomplete="current-password"></label>
    <label class="secure-remember"><input id="secure-teacher-remember" type="checkbox" checked> Сохранить вход на этом устройстве</label>
    <p class="pin-message" id="secure-teacher-message" role="alert"></p>
    <button class="pin-submit" id="secure-teacher-submit" type="button"><span>Войти</span>${arrow}</button>
    <button class="secure-link" id="secure-teacher-reset" type="button">Восстановить пароль</button>
    <button class="pin-home" type="button" data-login-home>← На главную</button>`;
  studentPage.querySelector('.pin-dialog').innerHTML = `
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
      showMessage('secure-teacher-message', 'Ссылка восстановления создана эмулятором и показана в его консоли.', true);
    } catch (error) { showMessage('secure-teacher-message', messageFor(error)); }
  });
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
  window.addEventListener('hashchange', route);
  window.SecureAuth = { enabled: true, logout, changePassword, createClass, createStudentWithInvite, reissueInvitation };
  if (currentSession?.role === 'teacher') history.replaceState(null, '', '#/teacher');
  else if (currentSession?.role === 'student') history.replaceState(null, '', '#/student');
  await route();
}

export { changePassword, claimInvitation, createClass, createStudentWithInvite, logout, reissueInvitation };
