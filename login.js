(function () {
  'use strict';
  const view = document.getElementById('login-view');
  if (!view) return;

  const anchor = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M22 9a5 5 0 1 1 4 0v7h7v4h-7v16c5.3-.8 9-4 11.5-8l-4-1 7-7 3 10-3.3-.9C37 36.5 31.8 40 24 41 16.2 40 11 36.5 7.8 29.1L4.5 30l3-10 7 7-4 1c2.5 4 6.2 7.2 11.5 8V20h-7v-4h7V9Z"/></svg>`;
  const cap = `<svg viewBox="0 0 80 80" aria-hidden="true"><path d="m8 31 32-16 32 16-32 16L8 31Zm14 10v14c10 8 26 8 36 0V41l-18 9-18-9Zm44-4v20h5V34l-5 3Z"/></svg>`;
  const sabres = `<svg viewBox="0 0 80 80" aria-hidden="true"><path d="M16 13c8 11 18 21 29 31l-6 6C28 40 18 30 9 19l7-6Zm-5 49 12-12 8 8-5 5-3-3-8 8-4-6Zm53-49C56 24 46 34 35 44l6 6c11-10 21-20 30-31l-7-6Zm5 49L57 50l-8 8 5 5 3-3 8 8 4-6Z"/></svg>`;
  const arrow = `<svg viewBox="0 0 34 18" aria-hidden="true"><path d="M1 9h29M23 2l7 7-7 7"/></svg>`;
  const sound = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 12h6l7-6v20l-7-6H5v-8Z"/><path class="lr-wave" d="M22 11c3 3 3 7 0 10M25 7c6 5 6 13 0 18"/></svg>`;
  const compassRose = `<svg viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="22"/><path d="M36 4l7 25 25 7-25 7-7 25-7-25-25-7 25-7 7-25Z"/><path d="m36 17 4 15 15 4-15 4-4 15-4-15-15-4 15-4 4-15Z"/></svg>`;
  const fallingStars = Array.from({ length: 18 }, (_, index) => {
    const left = 8 + (index * 17) % 84;
    const delay = -((index * 1.73) % 12).toFixed(2);
    const duration = (8 + (index * 1.37) % 7).toFixed(2);
    const drift = -18 + (index * 13) % 37;
    const size = index % 5 === 0 ? 3 : index % 3 === 0 ? 2 : 1;
    return `<i style="--star-left:${left}%;--star-delay:${delay}s;--star-duration:${duration}s;--star-drift:${drift}px;--star-size:${size}px"></i>`;
  }).join('');
  const pinSlots = prefix => `<div class="pin-slots" id="${prefix}-slots" aria-label="PIN-код из четырёх цифр">${Array.from({ length: 4 }, () => '<i></i>').join('')}</div>`;
  const keypad = prefix => `<div class="pin-keypad" id="${prefix}-keypad">${['1','2','3','4','5','6','7','8','9'].map(value => `<button type="button" data-pin-value="${value}">${value}</button>`).join('')}<button type="button" class="pin-key-special" data-pin-action="back" aria-label="Удалить последнюю цифру">⌫</button><button type="button" data-pin-value="0">0</button><button type="button" class="pin-key-special" data-pin-action="submit" aria-label="Подтвердить">→</button></div>`;

  view.classList.add('lr-view');
  view.innerHTML = `<section class="lr-screen" aria-label="Выбор роли">
    <div class="lr-scene" aria-hidden="true"><img class="lr-animated-ship" src="login-ship-layer.png" alt=""><div class="lr-night-grade"></div><div class="lr-water-light"></div><div class="lr-lantern-light"></div></div>
    <div class="lr-starfall" aria-hidden="true">${fallingStars}<span></span><span></span><span></span></div>
    <div class="lr-left-inscription" aria-label="Финансовая грамотность — твой компас к большим целям"><span>Финансовая<br>грамотность —<br>твой компас<br>к большим целям</span>${compassRose}</div>
    <img class="lr-right-barrel" src="login-barrel-course-v2.png" alt="Бочка с надписью «Курс на цель»">
    <div class="lr-audio-control" data-sound-control data-sound-inline role="group" aria-label="Управление звуком"><label class="lr-volume-label" title="Громкость морских волн"><input class="lr-volume" data-sound-volume type="range" min="0" max="100" step="1" aria-label="Громкость морских волн"></label><button class="lr-sound" type="button" data-sound-button aria-label="Выключить звук" title="Выключить звук">${sound}</button></div>
    <main class="lr-center">
      <header class="lr-header"><img class="lr-compass" src="компас.png" alt=""><h1>Трекер прогресса</h1><div class="lr-title-rule"><i></i>${anchor}<i></i></div><p>Индивидуальный трекер по финансовой грамотности</p><div class="lr-motto"><i></i><strong>Собирай финкоины, повышай ранг!</strong><i></i></div></header>
      <div class="lr-cards" id="login-cards">
        <article class="lr-card lr-teacher"><div class="lr-card-picture"><img src="login-teacher-scene-v2.png" alt="Книги, карты и перо"></div><div class="lr-card-emblem">${cap}</div><div class="lr-card-body"><h2>Панель учителя</h2><p>Управление классом, начисление<br>монет, награды и аналитика</p></div><button class="lr-enter" id="lr-teacher-enter" type="button"><span>Войти как учитель</span>${arrow}</button></article>
        <article class="lr-card lr-student"><div class="lr-card-picture"><img src="login-student-scene-v2.png" alt="Карта и сундук с золотом"></div><div class="lr-card-emblem">${sabres}</div><div class="lr-card-body"><h2>Панель ученика</h2><p>Мой прогресс, магазин наград,<br>лидерборд и достижения</p></div><button class="lr-enter" id="lr-student-enter" type="button"><span>Войти как ученик</span>${arrow}</button></article>
      </div>
      <section id="teacher-pin-page" class="pin-page pin-teacher-page" aria-label="Вход учителя"><div class="pin-dialog pin-teacher-dialog"><div class="pin-emblem">${cap}</div><h2 id="teacher-pin-title">Вход учителя</h2><p id="teacher-pin-copy">Введите PIN-код</p>${pinSlots('teacher')}<p class="pin-message" id="teacher-pin-message" role="alert"></p>${keypad('teacher')}<button class="pin-submit" id="teacher-pin-submit" type="button"><span>Войти</span>${arrow}</button><button class="pin-home" type="button" data-login-home>←&nbsp; На главную</button></div></section>
      <section id="student-pin-page" class="pin-page pin-student-page" aria-label="Вход ученика"><div class="pin-dialog pin-student-dialog"><section class="pin-student-picker"><header><h2>Выбери своего капитана</h2><p>Нажми на свой аватар</p></header><label class="pin-class-row" id="pin-class-row">Наш класс<select id="pin-class-select" aria-label="Выберите класс"></select></label><div class="pin-student-grid" id="pin-student-grid"></div><div class="pin-pagination" id="pin-pagination"></div></section><section class="pin-student-auth" id="pin-student-auth" aria-live="polite"><div class="pin-selected-avatar" id="pin-selected-avatar">${sabres}</div><h2 id="pin-selected-name">Выберите ученика</h2><p id="student-pin-copy">Введите свой PIN-код</p>${pinSlots('student')}<p class="pin-message" id="student-pin-message" role="alert"></p>${keypad('student')}<button class="pin-submit" id="student-pin-submit" type="button"><span>Войти</span>${arrow}</button></section><button class="pin-home pin-student-home" type="button" data-login-home>←&nbsp; На главную</button></div></section>
      <footer class="lr-footer" aria-label="Больше, чем уроки — настоящие возможности"><span>Больше, чем уроки</span><i></i>${anchor}<i></i><span>Настоящие возможности</span></footer>
    </main>
  </section>`;

  const screen = view.querySelector('.lr-screen');
  const teacherPage = view.querySelector('#teacher-pin-page');
  const studentPage = view.querySelector('#student-pin-page');
  const cards = view.querySelector('#login-cards');
  const state = { route: 'home', teacherPin: '', teacherSetupFirst: '', studentPin: '', classId: '', studentId: '', page: 0, busy: false, timer: null };
  const play = name => window.PirateSound?.play(name);

  function routeTo(hash) { if (location.hash !== hash) history.pushState(null, '', hash); applyRoute(); }
  window.LoginRoutes = { home: () => routeTo('#/'), teacher: () => routeTo('#/login/teacher'), student: () => routeTo('#/login/student') };
  function showLoginView() { document.querySelectorAll('.view').forEach(item => item.classList.remove('active')); view.classList.add('active'); }
  function applyRoute() {
    const hash = location.hash || '#/';
    const session = window.PinAuth?.getSession();
    if (hash === '#/teacher') { if (session?.role === 'teacher') { state.route = 'app'; loginAsTeacher(true); return; } routeTo('#/login/teacher'); return; }
    if (hash === '#/student') { if (session?.role === 'student') { state.route = 'app'; loginAsStudent(true, session.classId, session.studentId); return; } routeTo('#/login/student'); return; }
    showLoginView();
    const teacher = hash === '#/login/teacher';
    const student = hash === '#/login/student';
    state.route = teacher ? 'teacher' : student ? 'student' : 'home';
    screen.classList.toggle('is-pin-route', teacher || student);
    screen.classList.toggle('is-teacher-route', teacher);
    screen.classList.toggle('is-student-route', student);
    cards.hidden = teacher || student;
    teacherPage.classList.toggle('active', teacher);
    studentPage.classList.toggle('active', student);
    clearMessages();
    if (teacher) prepareTeacher();
    if (student) prepareStudent();
  }
  function clearMessages() { clearInterval(state.timer); view.querySelectorAll('.pin-message').forEach(item => { item.textContent = ''; item.classList.remove('error', 'success'); }); }
  function updateSlots(prefix, value) { view.querySelectorAll(`#${prefix}-slots i`).forEach((slot, index) => slot.classList.toggle('filled', index < value.length)); }
  function setMessage(prefix, message, type = 'error') { const element = view.querySelector(`#${prefix}-pin-message`); element.textContent = message; element.className = `pin-message ${type}`; }
  function shake(prefix) { const dialog = prefix === 'teacher' ? view.querySelector('.pin-teacher-dialog') : view.querySelector('.pin-student-auth'); dialog.classList.remove('pin-shake'); requestAnimationFrame(() => dialog.classList.add('pin-shake')); }
  function locked(prefix, key) {
    const attempt = window.PinAuth.getAttempt(key);
    if (attempt.lockedUntil <= Date.now()) return false;
    const update = () => { const seconds = Math.max(0, Math.ceil((attempt.lockedUntil - Date.now()) / 1000)); setMessage(prefix, seconds ? `Слишком много попыток. Попробуйте через ${seconds} сек.` : 'Можно попробовать снова.'); if (!seconds) { clearInterval(state.timer); setMessage(prefix, '', ''); } };
    update(); clearInterval(state.timer); state.timer = setInterval(update, 1000); return true;
  }

  function prepareTeacher() {
    state.teacherPin = ''; state.teacherSetupFirst = ''; updateSlots('teacher', '');
    const isSetup = !appData.teacherAuth;
    view.querySelector('#teacher-pin-title').textContent = isSetup ? 'Создайте PIN учителя' : 'Вход учителя';
    view.querySelector('#teacher-pin-copy').textContent = isSetup ? 'Придумайте PIN-код из четырёх цифр' : 'Введите PIN-код';
    view.querySelector('#teacher-pin-submit span').textContent = isSetup ? 'Продолжить' : 'Войти';
    locked('teacher', 'teacher');
  }
  async function submitTeacher() {
    if (state.busy || locked('teacher', 'teacher')) return;
    if (state.teacherPin.length !== 4) { setMessage('teacher', 'Введите все четыре цифры'); shake('teacher'); return; }
    state.busy = true;
    try {
      if (!appData.teacherAuth) {
        if (!state.teacherSetupFirst) { state.teacherSetupFirst = state.teacherPin; state.teacherPin = ''; updateSlots('teacher', ''); view.querySelector('#teacher-pin-copy').textContent = 'Повторите PIN-код'; view.querySelector('#teacher-pin-submit span').textContent = 'Сохранить PIN'; setMessage('teacher', 'Первый ввод принят', 'success'); return; }
        if (state.teacherPin !== state.teacherSetupFirst) { state.teacherPin = ''; state.teacherSetupFirst = ''; updateSlots('teacher', ''); view.querySelector('#teacher-pin-copy').textContent = 'PIN-коды не совпали. Создайте PIN заново'; view.querySelector('#teacher-pin-submit span').textContent = 'Продолжить'; setMessage('teacher', 'PIN-коды не совпали'); shake('teacher'); return; }
        appData.teacherAuth = await window.PinAuth.createRecord(state.teacherPin); saveData();
      } else if (!await window.PinAuth.verify(state.teacherPin, appData.teacherAuth)) {
        window.PinAuth.registerFailure('teacher'); setMessage('teacher', 'Неверный PIN-код'); shake('teacher'); state.teacherPin = ''; setTimeout(() => updateSlots('teacher', ''), 180); locked('teacher', 'teacher'); return;
      }
      window.PinAuth.clearFailures('teacher'); window.PinAuth.createSession('teacher'); history.replaceState(null, '', '#/teacher'); play('success'); loginAsTeacher(true);
    } finally { state.busy = false; }
  }

  const availableClasses = () => (appData.classes || []).filter(item => Array.isArray(item.students) && item.students.length);
  function prepareStudent() {
    const classes = availableClasses(); const select = view.querySelector('#pin-class-select');
    select.innerHTML = classes.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    view.querySelector('#pin-class-row').hidden = classes.length <= 1;
    state.classId = classes.some(item => item.id === state.classId) ? state.classId : classes[0]?.id || ''; select.value = state.classId;
    state.studentId = ''; state.studentPin = ''; state.page = 0; updateSlots('student', ''); renderStudents();
  }
  const currentStudents = () => availableClasses().find(item => item.id === state.classId)?.students || [];
  function renderStudents() {
    const students = currentStudents(); const pageSize = 6; const pages = Math.max(1, Math.ceil(students.length / pageSize)); state.page = Math.min(state.page, pages - 1);
    const visible = students.slice(state.page * pageSize, state.page * pageSize + pageSize); const grid = view.querySelector('#pin-student-grid');
    grid.innerHTML = visible.length ? visible.map((student, index) => `<button class="pin-student-card${student.id === state.studentId ? ' selected' : ''}" type="button" data-student-id="${escapeHtml(student.id)}"><span>${renderStudentAvatar(student, '', index)}</span><strong>${escapeHtml(student.name)}</strong>${student.pinAuth ? '' : '<small>PIN не назначен</small>'}</button>`).join('') : '<p class="pin-empty">В этом классе пока нет учеников</p>';
    grid.querySelectorAll('[data-student-id]').forEach(button => button.addEventListener('click', () => selectStudent(button.dataset.studentId)));
    const pagination = view.querySelector('#pin-pagination');
    pagination.innerHTML = pages > 1 ? `<button type="button" data-page="prev" aria-label="Предыдущая страница">‹</button><span>${state.page + 1} / ${pages}</span><button type="button" data-page="next" aria-label="Следующая страница">›</button>` : '';
    pagination.querySelector('[data-page="prev"]')?.addEventListener('click', () => { state.page = Math.max(0, state.page - 1); renderStudents(); });
    pagination.querySelector('[data-page="next"]')?.addEventListener('click', () => { state.page = Math.min(pages - 1, state.page + 1); renderStudents(); }); updateSelectedStudent();
  }
  function selectStudent(studentId) { clearInterval(state.timer); state.studentId = studentId; state.studentPin = ''; updateSlots('student', ''); setMessage('student', '', ''); renderStudents(); play('click'); }
  function updateSelectedStudent() {
    const student = currentStudents().find(item => item.id === state.studentId); const auth = view.querySelector('#pin-student-auth'); auth.classList.toggle('disabled', !student);
    view.querySelector('#pin-selected-avatar').innerHTML = student ? renderStudentAvatar(student) : sabres;
    view.querySelector('#pin-selected-name').textContent = student?.name || 'Выберите ученика';
    view.querySelector('#student-pin-copy').textContent = !student ? 'Сначала нажмите на свой аватар' : student.pinAuth ? 'Введите свой PIN-код' : 'PIN не назначен. Обратитесь к учителю';
  }
  async function submitStudent() {
    const student = currentStudents().find(item => item.id === state.studentId);
    if (!student) { setMessage('student', 'Выберите свой аватар'); shake('student'); return; }
    if (!student.pinAuth) { setMessage('student', 'PIN не назначен. Обратитесь к учителю'); return; }
    const attemptKey = `student:${state.classId}:${state.studentId}`;
    if (state.busy || locked('student', attemptKey)) return;
    if (state.studentPin.length !== 4) { setMessage('student', 'Введите все четыре цифры'); shake('student'); return; }
    state.busy = true;
    try {
      if (!await window.PinAuth.verify(state.studentPin, student.pinAuth)) { window.PinAuth.registerFailure(attemptKey); setMessage('student', 'Неверный PIN-код. Доступ запрещён'); shake('student'); state.studentPin = ''; setTimeout(() => updateSlots('student', ''), 180); locked('student', attemptKey); return; }
      window.PinAuth.clearFailures(attemptKey); window.PinAuth.createSession('student', { classId: state.classId, studentId: state.studentId }); history.replaceState(null, '', '#/student'); play('success'); loginAsStudent(true, state.classId, state.studentId);
    } finally { state.busy = false; }
  }

  function addDigit(prefix, digit) {
    if (state.route !== prefix) return;
    if (prefix === 'student' && !currentStudents().find(item => item.id === state.studentId)) return;
    const key = prefix === 'teacher' ? 'teacherPin' : 'studentPin'; if (state[key].length >= 4) return;
    state[key] += digit; updateSlots(prefix, state[key]); setMessage(prefix, '', ''); play('click');
  }
  function removeDigit(prefix) { const key = prefix === 'teacher' ? 'teacherPin' : 'studentPin'; state[key] = state[key].slice(0, -1); updateSlots(prefix, state[key]); play('click'); }
  ['teacher', 'student'].forEach(prefix => {
    view.querySelectorAll(`#${prefix}-keypad [data-pin-value]`).forEach(button => button.addEventListener('click', () => addDigit(prefix, button.dataset.pinValue)));
    view.querySelector(`#${prefix}-keypad [data-pin-action="back"]`).addEventListener('click', () => removeDigit(prefix));
    view.querySelector(`#${prefix}-keypad [data-pin-action="submit"]`).addEventListener('click', prefix === 'teacher' ? submitTeacher : submitStudent);
  });
  view.querySelector('#teacher-pin-submit').addEventListener('click', submitTeacher);
  view.querySelector('#student-pin-submit').addEventListener('click', submitStudent);
  view.querySelector('#pin-class-select').addEventListener('change', event => { clearInterval(state.timer); state.classId = event.target.value; state.studentId = ''; state.studentPin = ''; state.page = 0; updateSlots('student', ''); setMessage('student', '', ''); renderStudents(); });
  view.querySelector('#lr-teacher-enter').addEventListener('click', () => { play('click'); routeTo('#/login/teacher'); });
  view.querySelector('#lr-student-enter').addEventListener('click', () => { play('click'); routeTo('#/login/student'); });
  view.querySelectorAll('[data-login-home]').forEach(button => button.addEventListener('click', () => { play('click'); routeTo('#/'); }));
  document.addEventListener('keydown', event => {
    if (!['teacher', 'student'].includes(state.route)) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return;
    const activePage = state.route === 'teacher' ? teacherPage : studentPage;
    if (!activePage.classList.contains('active') || !view.classList.contains('active')) return;
    if (/^\d$/.test(event.key)) { event.preventDefault(); addDigit(state.route, event.key); }
    else if (event.key === 'Backspace') { event.preventDefault(); removeDigit(state.route); }
    else if (event.key === 'Enter') { event.preventDefault(); (state.route === 'teacher' ? submitTeacher : submitStudent)(); }
    else if (event.key === 'Escape') routeTo('#/');
  });
  window.addEventListener('hashchange', applyRoute);
  window.addEventListener('pirate-data-synced', () => {
    if (state.route === 'student') prepareStudent();
  });
  window.PirateSound?.bindControls();
  applyRoute();
})();
