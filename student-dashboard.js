(function () {
  'use strict';

  const view = document.getElementById('student-view');
  if (!view) return;

  const icons = {
    home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V21h13V10.5M9.5 21v-7h5v7"/>',
    trophy:'<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4v1a4 4 0 0 0 4 4m8-5h4v1a4 4 0 0 1-4 4M12 12v5m-4 3h8m-6-3h4"/>',
    star:'<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
    shop:'<path d="M4 9h16l-1 12H5L4 9Z"/><path d="M3 4h18l-1 5H4L3 4Zm6 9h6v8"/>',
    chart:'<path d="M5 20V10m5 10V5m5 15v-7m5 7V2"/>',
    scroll:'<path d="M7 3h11a3 3 0 0 1 3 3v1H10V6a3 3 0 0 0-6 0v14a2 2 0 0 0 2 2h11"/><path d="M10 7v11a4 4 0 0 0 4 4h3a4 4 0 0 0 4-4v-1H10m3-6h5m-5 3h5"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    anchor:'<path d="M12 2v15m-4-11h8M5 10H2c0 6 4 10 10 10s10-4 10-10h-3M8 17l4 4 4-4"/>',
    logout:'<path d="M10 4H4v16h6m5-4 4-4-4-4m4 4H9"/>',
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
    sound:'<path fill="currentColor" stroke="none" d="M4 9h4l6-5v16l-6-5H4z"/><path class="sound-wave" d="M17 8c2.4 2.2 2.4 5.8 0 8m2.7-11c4.2 3.8 4.2 10.2 0 14"/>'
  };
  const svg = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
  const safe = value => typeof escapeHtml === 'function' ? escapeHtml(String(value ?? '')) : String(value ?? '');
  const rankBadgeAssets = ['assets/ranks/yunga.webp','assets/ranks/matros.webp','assets/achievements/07-ship-wheel.webp','assets/achievements/18-shield.webp','assets/achievements/09-crown.webp','assets/achievements/10-trophy.webp'];
  const rankBadgeAsset = rank => rankBadgeAssets[Math.max(0, RANKS.indexOf(rank))] || rankBadgeAssets[0];

  const cards = [
    ['leaderboard','Лидерборд','Смотри, кто в топе','student-card-leaderboard-v2.webp'],
    ['achievements','Мои достижения','Твои награды','student-card-achievements-v2.webp'],
    ['shop','Магазин наград','Обменивай финкоины','student-card-shop-v2.webp'],
    ['statistics','Статистика','Следи за своим прогрессом','student-card-statistics-v2.webp'],
    ['tasks','Мои задания','Продолжай развиваться','student-card-tasks-v2.webp'],
    ['settings','Настройки','Настрой свой путь','student-card-settings-v2.webp']
  ];

  function card([id,title,subtitle,image]) {
    return `<button class="sd-action-card sd-card-${id}" type="button" onclick="openStudentDashboardSection('${id}')"><img src="${image}" alt=""><span class="sd-card-shade"></span><span class="sd-card-copy"><strong>${title}</strong><small>${subtitle}</small></span><span class="sd-card-arrow">${svg('arrow')}</span></button>`;
  }

  function build() {
    view.classList.add('sd-view');
    view.innerHTML = `<div class="sd-shell">
      <aside class="sd-sidebar">
        <div class="sd-brand"><img src="Лого.webp" alt="Трекер Прогресса"></div>
        <div class="sd-profile"><div id="sd-avatar" class="sd-avatar"></div><strong id="sd-name">Ученик</strong><span id="sd-rank">Юнга</span></div>
        <nav class="sd-nav" aria-label="Навигация ученика">
          <button class="active" type="button" onclick="openStudentDashboardSection('home')">${svg('home')}<span>Главная</span></button>
          <button type="button" onclick="openStudentDashboardSection('leaderboard')">${svg('trophy')}<span>Лидерборд</span></button>
          <button type="button" onclick="openStudentDashboardSection('achievements')">${svg('star')}<span>Достижения</span></button>
          <button type="button" onclick="openStudentDashboardSection('shop')">${svg('shop')}<span>Магазин</span></button>
          <button type="button" onclick="openStudentDashboardSection('statistics')">${svg('chart')}<span>Статистика</span></button>
          <button type="button" onclick="openStudentDashboardSection('tasks')">${svg('scroll')}<span>Мои задания</span></button>
          <button type="button" onclick="openStudentDashboardSection('settings')">${svg('settings')}<span>Настройки</span></button>
        </nav>
        <span class="sd-sidebar-art" aria-hidden="true"><img src="student-sidebar-decor-v2.webp" alt=""></span>
        <button class="sd-logout" type="button" onclick="logout()">${svg('logout')}<span>Выйти</span></button>
      </aside>
      <main class="sd-main">
        <div class="sd-audio-control td-audio-control" data-sound-control data-sound-inline role="group" aria-label="Управление звуком">
          <button class="sd-sound-button td-sound-button" type="button" data-sound-button aria-label="Выключить звук" title="Выключить звук">${svg('sound')}</button>
          <div class="sd-sound-popover td-sound-popover" data-sound-popover><label class="td-volume-label" title="Громкость морских волн"><input class="td-volume" data-sound-volume type="range" min="0" max="100" step="1" aria-label="Громкость морских волн"></label></div>
        </div>
        <section class="sd-hero">
          <div class="sd-greeting"><h1>Привет, <span id="sd-greeting-name">ученик</span>!</h1><p>Продолжай свой путь к финансовой свободе!</p></div>
          <div class="sd-balance"><img src="Монета.webp" alt=""><strong id="sd-balance">0</strong><span>доступно · всего <b id="sd-earned">0</b></span></div>
        </section>
        <section class="sd-progress-card sd-voyage-card" aria-labelledby="sd-progress-title">
          <div class="sd-voyage-intro">
            <img src="assets/progress/route-ship-large.webp" alt="Парусный пиратский корабль">
            <div><h2 id="sd-progress-title">Курс к новому рангу</h2><p>Каждый шаг приближает к большим горизонтам!</p></div>
          </div>
          <div class="sd-voyage-route">
            <div class="sd-rank-emblem sd-rank-current"><img id="sd-current-rank-badge" src="assets/achievements/01-anchor.webp" alt=""><strong id="sd-current-rank">Юнга</strong></div>
            <svg id="sd-voyage-map" viewBox="0 0 560 94" preserveAspectRatio="xMidYMid meet" aria-label="Маршрут к следующему рангу">
              <defs><clipPath id="sd-route-complete-clip" clipPathUnits="userSpaceOnUse"><rect id="sd-route-complete-rect" x="0" y="0" width="0" height="94"/></clipPath></defs>
              <path id="sd-route-path" class="sd-map-route sd-map-route-future" d="M0 53 C88 19 148 76 228 45 S360 24 430 51 S512 68 560 39"/>
              <path class="sd-map-route sd-map-route-complete" clip-path="url(#sd-route-complete-clip)" d="M0 53 C88 19 148 76 228 45 S360 24 430 51 S512 68 560 39"/>
              <g class="sd-map-checkpoints" aria-hidden="true"><circle data-at="25" r="7"/><circle data-at="50" r="7"/><circle data-at="75" r="7"/></g>
              <image id="sd-route-ship" class="sd-map-vessel" href="assets/progress/route-ship-marker.webp" width="74" height="66" preserveAspectRatio="xMidYMid meet"/>
            </svg>
            <div class="sd-rank-emblem sd-rank-next"><img id="sd-target-rank-badge" src="assets/achievements/05-pirate-flag.webp" alt=""><strong id="sd-target-rank">Матрос</strong></div>
          </div>
          <div class="sd-voyage-summary">
            <strong><span id="sd-progress-current">0</span><small id="sd-progress-target"> из 50 финкоинов</small></strong>
            <p id="sd-next-rank">До следующего ранга</p>
          </div>
        </section>
        <section class="sd-action-grid">${cards.map(card).join('')}</section>
        <div class="sd-motto">${svg('anchor')}<span>Большие цели начинаются с маленьких шагов!</span></div>
      </main>
    </div>
    <div id="modal-student-section" class="modal-overlay sd-section-overlay" onclick="closeModalOverlay(event)"><section class="sd-section-dialog" role="dialog" aria-modal="true"><button class="sd-section-close" onclick="closeModal('modal-student-section')" aria-label="Закрыть">×</button><div id="sd-section-content"></div></section></div>`;
  }

  function currentData() {
    const student = typeof getCurrentStudent === 'function' ? getCurrentStudent() : null;
    const cls = student && appData?.currentUser ? appData.classes.find(c => c.id === appData.currentUser.classId) : null;
    return {student, cls};
  }

  function render() {
    const {student} = currentData();
    if (!student) { if (appData?.currentUser?.role === 'student') logout(); return; }
    const balance = getStudentBalance(student);
    const earned = getStudentLifetimeEarned(student);
    const rank = getRank(earned);
    const next = getNextRank(earned);
    const progress = getProgressPercent(earned);
    document.getElementById('sd-avatar').innerHTML = renderStudentAvatar(student);
    document.getElementById('sd-name').textContent = student.name;
    document.getElementById('sd-rank').textContent = rank.name;
    document.getElementById('sd-greeting-name').textContent = student.name;
    document.getElementById('sd-balance').textContent = balance.toLocaleString('ru-RU');
    document.getElementById('sd-earned').textContent = earned.toLocaleString('ru-RU');
    const progressCard = document.querySelector('.sd-progress-card');
    document.getElementById('sd-current-rank').textContent = rank.name;
    document.getElementById('sd-target-rank').textContent = next ? next.name : rank.name;
    document.getElementById('sd-current-rank-badge').src = rankBadgeAsset(rank);
    document.getElementById('sd-current-rank-badge').alt = `Эмблема ранга ${rank.name}`;
    document.getElementById('sd-target-rank-badge').src = rankBadgeAsset(next || rank);
    document.getElementById('sd-target-rank-badge').alt = `Эмблема ранга ${next?.name || rank.name}`;
    document.getElementById('sd-next-rank').textContent = next ? `До ранга «${next.name}»: ${Math.max(0, next.min - earned)} финкоинов` : 'Высший ранг достигнут';
    document.getElementById('sd-progress-current').textContent = earned.toLocaleString('ru-RU');
    document.getElementById('sd-progress-target').textContent = next ? ` из ${next.min.toLocaleString('ru-RU')} финкоинов` : ' финкоинов';
    progressCard?.classList.toggle('is-complete', !next);
    requestAnimationFrame(() => positionVoyageMarker(progress));
  }

  function positionVoyageMarker(progressPercent) {
    const path = document.getElementById('sd-route-path');
    const marker = document.getElementById('sd-route-ship');
    const clip = document.getElementById('sd-route-complete-rect');
    if (!path || !marker || !clip || typeof path.getTotalLength !== 'function') return;
    const progress = Math.max(0, Math.min(1, Number(progressPercent || 0) / 100));
    const length = path.getTotalLength();
    const point = path.getPointAtLength(length * progress);
    const start = path.getPointAtLength(0);
    marker.setAttribute('x', String(point.x - 37));
    marker.setAttribute('y', String(point.y - 47));
    clip.setAttribute('width', String(Math.max(0, point.x + 8)));
    document.querySelectorAll('.sd-map-checkpoints circle').forEach(checkpoint => {
      const at = Number(checkpoint.dataset.at) / 100;
      const checkpointPoint = path.getPointAtLength(length * at);
      checkpoint.setAttribute('cx', String(checkpointPoint.x));
      checkpoint.setAttribute('cy', String(checkpointPoint.y));
      checkpoint.classList.toggle('is-passed', progress >= at);
      checkpoint.classList.toggle('is-current', Math.abs(progress - at) < .08);
    });
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && marker.animate) {
      marker.animate([{ transform:`translate(${start.x - point.x}px,${start.y - point.y}px)`, opacity:.2 },{ transform:'translate(0,0)', opacity:1 }],{ duration:760, easing:'cubic-bezier(.2,.75,.2,1)', fill:'both' });
    }
  }

  function achievementRows(student, cls) {
    const base = AUTO_ACHIEVEMENTS.map(a => ({...a, earned:(student.achievements || []).includes(a.id)}));
    const custom = window.PirateAchievements.getStudentManualAchievements(student,cls).map(a => ({...a, desc:a.description || '', earned:true}));
    return [...base,...custom];
  }

  window.openStudentDashboardSection = function(type) {
    document.querySelectorAll('.sd-nav button').forEach(b => b.classList.toggle('active', b.getAttribute('onclick')?.includes(`'${type}'`)));
    if (type === 'home') { document.querySelector('.sd-main')?.scrollTo({top:0,behavior:'smooth'}); return; }
    if (type === 'shop') { openShop(); return; }
    const {student,cls} = currentData(); if (!student || !cls) return;
    const content = document.getElementById('sd-section-content');
    const heading = {leaderboard:'Лидерборд класса',achievements:'Мои достижения',statistics:'Статистика',tasks:'Мои задания',settings:'Настройки'}[type];
    let body = '';
    if (type === 'leaderboard') {
      body = [...cls.students].sort((a,b)=>getStudentLifetimeEarned(b)-getStudentLifetimeEarned(a)).map((s,i)=>`<div class="sd-list-row ${s.id===student.id?'current':''}"><b>${i+1}</b>${renderStudentAvatar(s,'sd-list-avatar')}<span>${safe(s.name)}${s.id===student.id?' · вы':''}</span><strong>${getStudentLifetimeEarned(s).toLocaleString('ru-RU')}</strong></div>`).join('');
    } else if (type === 'achievements') {
      body = `<div class="sd-achievement-grid">${achievementRows(student,cls).map(a=>`<article class="${a.earned?'earned':'locked'}"><span>${safe(a.emoji || '★')}</span><strong>${safe(a.name)}</strong><small>${safe(a.desc || '')}</small></article>`).join('')}</div>`;
    } else if (type === 'statistics') {
      const tx=(cls.transactions||[]).filter(t=>t.student_id===student.id); const income=getStudentLifetimeEarned(student); const spent=Math.abs(tx.filter(t=>t.amount<0).reduce((s,t)=>s+t.amount,0));
      const flowTotal=Math.max(1,income+spent); const incomePart=Math.round(income/flowTotal*100); const spentPart=100-incomePart;
      const dated=t=>typeof formatDate==='function'&&t.timestamp?formatDate(t.timestamp):'';
      body=`<div class="sd-stats">
        <article class="sd-stat-balance"><span class="sd-stat-icon">${svg('anchor')}</span><div><strong>${getStudentBalance(student).toLocaleString('ru-RU')}</strong><span>Доступный баланс</span></div></article>
        <article class="sd-stat-income"><span class="sd-stat-icon">${svg('arrow')}</span><div><strong>${getStudentLifetimeEarned(student).toLocaleString('ru-RU')}</strong><span>Всего заработано за курс</span></div></article>
        <article class="sd-stat-spent"><span class="sd-stat-icon">${svg('arrow')}</span><div><strong>${Number(spent).toLocaleString('ru-RU')}</strong><span>Потрачено</span></div></article>
      </div>
      <section class="sd-cash-flow" aria-label="Соотношение доходов и расходов"><header><div><strong>Движение финкоинов</strong><span>За всё время</span></div><small>${tx.length} ${tx.length===1?'операция':tx.length>1&&tx.length<5?'операции':'операций'}</small></header><div class="sd-flow-track"><i style="width:${incomePart}%"></i><b style="width:${spentPart}%"></b></div><div class="sd-flow-legend"><span><i></i>Заработано <strong>+${Number(income).toLocaleString('ru-RU')}</strong></span><span><i></i>Потрачено <strong>−${Number(spent).toLocaleString('ru-RU')}</strong></span></div></section>
      <div class="sd-history-heading"><div><strong>Последние операции</strong><span>История начислений и покупок</span></div></div>
      <div class="sd-history">${tx.slice().sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0,8).map(t=>{const amount=getTransactionDisplayAmount(t);return `<div class="sd-transaction ${amount>=0?'income':'expense'}"><span class="sd-transaction-icon">${svg('arrow')}</span><div><strong>${safe(t.description || (amount>=0?'Начисление':'Покупка'))}</strong><time>${safe(dated(t))}</time></div><b>${amount>0?'+':amount<0?'−':''}${Math.abs(amount).toLocaleString('ru-RU')}${isLifetimeOnlyTransaction(t)?' к заработку':''}</b></div>`}).join('') || '<p class="sd-empty">Операций пока нет</p>'}</div>`;
    } else if (type === 'tasks') {
      const requests=(cls.requests||[]).filter(r=>r.student_id===student.id); body=requests.length?requests.map(r=>`<div class="sd-list-row sd-detail-row"><b>${r.status==='approved'?'✓':'•'}</b><span>${safe(r.reward_name || 'Заявка на награду')}</span><strong>${r.status==='approved'?'Выполнено':'На проверке'}</strong></div>`).join(''):'<p class="sd-empty">Новых заданий пока нет. Капитан скоро подготовит следующий маршрут.</p>';
    } else {
      body=`<div class="sd-settings-card">${renderStudentAvatar(student,'sd-settings-avatar')}<div><strong>${safe(student.name)}</strong><span>${safe(getRank(getStudentLifetimeEarned(student)).name)}</span><small>Профиль ученика управляется учителем</small></div></div>`;
    }
    content.innerHTML=`<header><span>${svg(type==='leaderboard'?'trophy':type==='achievements'?'star':type==='statistics'?'chart':type==='tasks'?'scroll':'settings')}</span><div><h2>${heading}</h2><p>Личный кабинет ученика</p></div></header><div class="sd-section-body">${body}</div>`;
    document.getElementById('modal-student-section').dataset.section = type;
    openModal('modal-student-section');
  };

  build();
  window.PirateSound?.bindControls();
  window.renderStudentView = render;
  if (appData?.currentUser?.role === 'student') render();
})();
