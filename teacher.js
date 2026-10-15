(function(){
  const picture=(file,cls='',alt='')=>`<img src="${file}" class="${cls}" alt="${alt}" loading="lazy" decoding="async">`;
  const studentAvatar=(student,cls='',fallbackIndex=0)=>typeof renderStudentAvatar==='function'?renderStudentAvatar(student,cls):picture(fallbackIndex%2?'аватар девочка.webp':'аватар мальчик.webp',cls,student?.name||'');
  const paths={
    anchor:'<path d="M12 2v15m-4-11h8M5 10H2c0 6 4 10 10 10s10-4 10-10h-3M8 17l4 4 4-4"/>',
    home:'<path d="m3 11 9-8 9 8v9h-6v-6H9v6H3z"/>',
    users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.87m-2-12a4 4 0 0 1 0 7.75"/>',
    gift:'<path d="M20 12v9H4v-9M2 7h20v5H2zM12 7v14M12 7H7.5a2.5 2.5 0 1 1 2.45-3c.4 1.7 2.05 3 2.05 3Zm0 0h4.5a2.5 2.5 0 1 0-2.45-3C13.65 5.7 12 7 12 7Z"/>',
    file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8"/>',
    trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4"/>',
    chart:'<path d="M4 20V10m6 10V4m6 16v-7m5 7H2"/>',
    refresh:'<path d="M20 7h-6V1M4 17h6v6M19 12a7 7 0 0 0-12-5l-3 3m1 2a7 7 0 0 0 12 5l3-3"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H10v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3v-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3h4v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    logout:'<path d="M10 17l5-5-5-5m5 5H3m12-9h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    sound:'<path fill="currentColor" stroke="none" d="M4 9h4l6-5v16l-6-5H4z"/><path class="sound-wave" d="M17 8c2.4 2.2 2.4 5.8 0 8m2.7-11c4.2 3.8 4.2 10.2 0 14"/>',
    coin:'<circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-.6-.6-1.4-.8-2.4-.8-1.4 0-2.5.8-2.5 2s1 1.7 2.5 2c1.6.4 2.7.8 2.7 2.2s-1.2 2.3-2.8 2.3c-1.1 0-2.1-.4-2.8-1.1M12 6v12"/>',
    wheel:'<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="8"/><path d="M12 2v6m0 8v6M2 12h6m8 0h6M5 5l4 4m6 6 4 4m0-14-4 4m-6 6-4 4"/>',
    crown:'<path d="m3 7 4 4 5-7 5 7 4-4-2 11H5zM5 21h14"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    edit:'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    more:'<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
    chevron:'<path d="m7 9 5 5 5-5"/>'
  };
  const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.anchor}</svg>`;
  let query='';
  let order='rank';
  let showAllStudents=false;
  const teacherAvatars=[
    {id:'teacher-professor',src:'teacher-avatar-professor.webp'},
    {id:'teacher-captain-brunette',src:'teacher-avatar-captain-brunette.webp'},
    {id:'teacher-captain-redhead',src:'teacher-avatar-captain-redhead.webp'},
    {id:'teacher-navigator-man',src:'teacher-avatar-navigator-man.webp'},
    {id:'teacher-captain-blond',src:'teacher-avatar-captain-blond.webp'}
  ];
  let selectedTeacherAvatar=teacherAvatars[0].id;

  function ensureTeacherProfile(){
    let changed=false;
    const defaultAvatar=teacherAvatars[0];
    if(!appData.teacherProfile||typeof appData.teacherProfile!=='object'){appData.teacherProfile={name:'Иван',displayName:'Иван Петрович',avatarSrc:defaultAvatar.src,avatarId:defaultAvatar.id,organization:''};changed=true}
    const profile=appData.teacherProfile;
    if(!profile.name){profile.name='Иван';changed=true}
    if(!profile.displayName){profile.displayName=profile.name||'Иван Петрович';changed=true}
    const activeAvatar=teacherAvatars.find(item=>item.id===profile.avatarId);
    if(!activeAvatar){profile.avatarId=defaultAvatar.id;profile.avatarSrc=defaultAvatar.src;changed=true}
    else if(profile.avatarSrc!==activeAvatar.src){profile.avatarSrc=activeAvatar.src;changed=true}
    if(typeof profile.organization!=='string'){profile.organization='';changed=true}
    if(changed)saveData();
    return profile;
  }

  function teacherAvatarMarkup(profile,cls=''){
    const avatar=teacherAvatars.find(item=>item.id===profile.avatarId);
    return `<img src="${escapeHtml(profile.avatarSrc||avatar?.src||teacherAvatars[0].src)}" class="${cls}" alt="Аватар учителя">`;
  }

  function nav(iconName,label,action,active=false,badge=''){
    return `<button class="td-nav-button ${active?'active':''}" type="button" onclick="${action}">${icon(iconName)}<span>${label}</span>${badge}</button>`;
  }

  function build(){
    const view=document.getElementById('teacher-view');
    const profile=ensureTeacherProfile();
    view.classList.add('td-view');
    view.innerHTML=`<div class="td-shell">
      <aside class="td-sidebar">
        <div class="td-brand">${picture('Лого.webp','td-brand-logo','Трекер Прогресса')}<small>Финансовая грамотность как приключение!</small></div>
        <nav class="td-nav" aria-label="Навигация учителя">
          ${nav('home','Панель Учителя',"document.querySelector('.td-workspace').scrollIntoView({behavior:'smooth'})",true)}
          ${nav('users','Мои ученики',"document.querySelector('.td-crew').scrollIntoView({behavior:'smooth'})")}
          ${nav('gift','Награды',"openModal('modal-manage-rewards')")}
          ${nav('file','Заявки',"openModal('modal-requests')",false,'<b id="requests-badge" class="td-badge" style="display:none">0</b>')}
          ${nav('trophy','Достижения',"openModal('modal-achievements-manage')")}
          ${nav('chart','Аналитика',"openModal('modal-analytics')")}
          ${nav('refresh','Новый сезон','confirmNewSeason()')}
          <div class="td-nav-separator"></div>
          ${nav('settings','Настройки',"openTeacherProfile(true)")}
        </nav>
        <div class="td-sidebar-bottom"><span class="td-sidebar-reference-decor" aria-hidden="true"><img src="teacher-dashboard-reference-v2.webp" alt=""></span></div>
      </aside>
      <section class="td-workspace">
        <header class="td-topbar"><span class="td-topbar-ornament" aria-hidden="true"></span><div class="td-top-actions"><select id="teacher-class-select" class="td-class-select" onchange="switchClass()" aria-label="Текущий класс"></select><button class="td-add-class" onclick="openModal('modal-add-class')">+&nbsp; Класс</button><span class="td-top-divider" aria-hidden="true"></span><button class="td-bell" onclick="openModal('modal-requests')" aria-label="Открыть заявки">${icon('bell')}<i></i></button><span class="td-top-divider td-top-divider-after-bell" aria-hidden="true"></span><div class="td-audio-control" data-sound-control data-sound-inline><button class="td-sound-button" type="button" data-sound-button aria-label="Выключить звук" title="Включить или выключить звук">${icon('sound')}</button><div class="td-sound-popover" data-sound-popover role="group" aria-label="Громкость морских волн"><label class="td-volume-label" title="Громкость морских волн"><input class="td-volume" data-sound-volume type="range" min="0" max="100" step="1" aria-label="Громкость морских волн"></label></div></div><button class="td-user" type="button" onclick="toggleTeacherProfile(event)">${teacherAvatarMarkup(profile)}<span><strong>Учитель</strong><small>${escapeHtml(profile.displayName)}</small></span>${icon('chevron')}</button><div id="td-profile-menu" class="td-profile-menu"><button onclick="openTeacherProfile(true)">${icon('settings')}<span>Настройка профиля</span></button><i></i><button class="td-profile-logout" onclick="logout()">${icon('logout')}<span>Покинуть корабль</span></button></div><button class="td-top-logout" type="button" onclick="logout()" aria-label="Покинуть корабль" title="Покинуть корабль">${icon('logout')}<span>Покинуть корабль</span></button></div></header>
        <section class="td-headscape"><div class="td-hero"><div class="td-hero-title"><div><h1>Трекер Прогресса</h1><p>Собирай финкоины, развивайся,<br>открывай новые горизонты!</p><span class="td-hero-rule"><i></i>${icon('anchor')}<i></i></span></div></div><span class="td-hero-reference-art" aria-hidden="true"><img src="teacher-dashboard-reference-v2.webp" alt=""></span></div><div id="td-stats" class="td-stats"></div></section>
        <div class="td-content"><div class="td-primary"><section class="td-crew"><header class="td-crew-header"><div class="td-crew-heading">${icon('wheel')}<div><h2>Экипаж класса</h2><p>Ваши ученики на пути к финансовому мастерству</p></div></div><div class="td-tools"><button class="td-add-student" type="button" onclick="openModal('modal-add-student')">+ Добавить ученика</button><label class="td-search-wrap">${icon('search')}<input id="td-search" class="td-search" type="search" placeholder="Поиск ученика..."></label><select id="td-sort" class="td-sort"><option value="rank">По рангу</option><option value="balance">По балансу</option><option value="name">По имени</option></select></div></header><div id="students-grid" class="td-student-grid"></div><button id="td-show-all" class="td-show-all" type="button">${icon('users')}<span>Показать всех учеников</span>${icon('chevron')}</button></section></div>
          <aside class="td-rail"><section class="td-rail-card td-leaderboard-card"><div class="td-rail-heading">${icon('trophy')}<span>Лидерборд класса</span><button onclick="openModal('modal-analytics')">Весь список&nbsp; →</button></div><div id="td-leaderboard"></div></section><section class="td-rail-card td-reward"><div class="td-rail-heading">${icon('gift')}<span>Сундук наград</span><button onclick="openModal('modal-manage-rewards')">Открыть все&nbsp; →</button></div><div class="td-chest-scene">${picture('Сундук закрытый.webp','td-chest')}</div><div id="td-reward-copy" class="td-reward-copy"></div><button class="td-reward-button" onclick="openModal('modal-manage-rewards')">Перейти к наградам</button></section><section class="td-rail-card td-activity"><div class="td-rail-heading">${icon('file')}<span>Последняя активность</span><button onclick="openModal('modal-analytics')">Все события&nbsp; →</button></div><div id="td-activity"></div></section></aside></div>
        <footer class="td-footer"><span class="td-footer-island" aria-hidden="true"></span><div><strong>«Каждый финкоин приближает к большим целям!»</strong><small>— Команда Трекера Прогресса</small></div>${picture('подзорная труба.webp','td-footer-scope','')}${picture('Монета.webp','td-footer-coins','')}</footer>
      </section></div>`;
    window.PirateSound?.bindControls();
    document.getElementById('td-search').addEventListener('input',event=>{query=event.target.value;renderTeacherView()});
    document.getElementById('td-sort').addEventListener('change',event=>{order=event.target.value;renderTeacherView()});
    document.getElementById('td-show-all').addEventListener('click',()=>{showAllStudents=!showAllStudents;renderTeacherView();window.PirateSound?.play('click')});
  }

  function metric(asset,value,label,extra=''){
    return `<article class="td-stat ${extra}"><span class="td-stat-icon">${picture(asset)}</span><div><strong>${value}</strong><span>${label}</span></div></article>`;
  }

  function renderStats(cls){
    const students=cls?.students||[];
    const total=students.reduce((sum,item)=>sum+getStudentBalance(item),0);
    const achievements=window.PirateAchievements.countClassAchievements(cls);
    const requests=(cls?.requests||[]).filter(item=>item.status==='pending').length;
    document.getElementById('td-stats').innerHTML=metric('Команда.webp',students.length,'учеников<br>в классе')+metric('Монета.webp',total.toLocaleString('ru-RU'),'финкоинов<br>всего','coin')+metric('достижение.webp',achievements,'достижений<br>получено','achievement')+metric('свиток.webp',requests,'заявки<br>на рассмотрении','request');
  }

  function studentCard(student,index,avatarIndex){
    const balance=getStudentBalance(student),earned=getStudentLifetimeEarned(student),rank=getRank(earned),next=getNextRank(earned),progress=getProgressPercent(earned);
    const themeIcon=rank.name==='Капитан'?'crown':rank.name==='Боцман'?'trophy':rank.name==='Матрос'?'anchor':'wheel';
    return `<article class="td-student-card avatar-${avatarIndex%6} ${index===0&&earned>0?'leader':''}"><div class="td-card-top"><div class="td-avatar">${studentAvatar(student,'',avatarIndex)}<i></i></div><div class="td-student-meta"><span class="td-student-name">${icon(themeIcon)}${escapeHtml(student.name)}</span><span class="td-rank">${rank.name}</span></div></div><div class="td-progress-copy"><i></i><span>${next?'Заработано '+earned.toLocaleString('ru-RU')+' · до '+next.name+' '+(next.min-earned):'Заработано '+earned.toLocaleString('ru-RU')+' · максимальный ранг'}</span></div><div class="td-progress"><div class="td-progress-fill" style="width:${progress}%"></div></div><div class="td-balance">${picture('Монета.webp')}<span>${balance.toLocaleString('ru-RU')}</span><small>доступно</small></div><div class="td-card-actions"><button class="td-card-primary" onclick="openHistory('${student.id}')">Профиль</button><button class="td-card-menu-button" onclick="toggleTeacherMenu('${student.id}',event)" aria-label="Другие действия">${icon('more')}</button></div><div id="td-menu-${student.id}" class="td-card-menu"><button onclick="openTransactionModal('${student.id}','income')">Начислить финкоины</button><button class="td-expense-action" onclick="openTransactionModal('${student.id}','expense')">Списать финкоины</button><button onclick="openAwardAchievement('${student.id}')">Выдать достижение</button><button onclick="openStudentPinSetup('${student.id}')">${student.pinAuth?'Изменить PIN':'Установить PIN'}</button><button class="danger" onclick="deleteStudent('${student.id}')">Удалить ученика</button></div></article>`;
  }

  function renderCrew(cls){
    const grid=document.getElementById('students-grid');
    if(!cls){grid.innerHTML=`<div class="td-empty">${icon('users')}<h3>Создайте первый класс</h3><p>После этого сюда можно добавить учеников.</p><button class="td-add-class" onclick="openModal('modal-add-class')">Создать класс</button></div>`;return}
    let students=cls.students.map((student,avatarIndex)=>({student,avatarIndex}));
    const normalized=query.trim().toLocaleLowerCase('ru');
    if(normalized)students=students.filter(item=>item.student.name.toLocaleLowerCase('ru').includes(normalized));
    students.sort((a,b)=>order==='name'?a.student.name.localeCompare(b.student.name,'ru'):order==='rank'?getRank(getStudentLifetimeEarned(b.student)).min-getRank(getStudentLifetimeEarned(a.student)).min:getStudentBalance(b.student)-getStudentBalance(a.student));
    const visible=showAllStudents||normalized?students:students.slice(0,8);
    grid.innerHTML=visible.length?visible.map((item,index)=>studentCard(item.student,index,item.avatarIndex)).join(''):`<div class="td-empty">${icon('search')}<h3>${normalized?'Ученик не найден':'В классе пока нет учеников'}</h3><p>${normalized?'Измените поисковый запрос.':'Добавьте первого участника экипажа.'}</p>${normalized?'':'<button class="td-add-class" onclick="openModal(\'modal-add-student\')">Добавить ученика</button>'}</div>`;
    const showButton=document.getElementById('td-show-all');
    if(showButton){const allVisible=students.length<=8&&!normalized;showButton.hidden=allVisible;showButton.classList.toggle('expanded',showAllStudents);showButton.querySelector('span').textContent=showAllStudents?'Показать первых 8 учеников':'Показать всех учеников';showButton.disabled=false;showButton.classList.remove('all-visible')}
  }

  function renderRail(cls){
    const leaders=[...(cls?.students||[])].sort((a,b)=>getStudentLifetimeEarned(b)-getStudentLifetimeEarned(a)).slice(0,3);
    document.getElementById('td-leaderboard').innerHTML=leaders.length?leaders.map((student,index)=>`<div class="td-leader-row"><span class="td-position ${index<3?'top':''}">${index+1}</span>${studentAvatar(student,'td-leader-avatar',index)}<span class="td-leader-name">${escapeHtml(student.name)}</span><span class="td-leader-balance">${picture('Монета.webp')} ${getStudentLifetimeEarned(student).toLocaleString('ru-RU')}</span></div>`).join(''):`<div class="td-mini-empty">${icon('trophy')}<strong>Пока нет участников</strong><span>Добавьте учеников, чтобы появился рейтинг</span></div>`;
    const rewards=cls?.rewards||[],pending=(cls?.requests||[]).filter(item=>item.status==='pending').length;
    document.getElementById('td-reward-copy').textContent=`Доступно наград: ${rewards.length}`;
    const events=[...(cls?.transactions||[])].sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0,4);
    document.getElementById('td-activity').innerHTML=events.length?events.map(event=>{const student=cls.students.find(item=>item.id===event.student_id),amount=getTransactionDisplayAmount(event),message=isLifetimeOnlyTransaction(event)?'скорректировал общий заработок на '+(amount>0?'+':'')+amount:amount>0?'получил '+amount+' финкоинов':'потратил '+Math.abs(amount)+' финкоинов';return `<div class="td-activity-row">${picture(amount>=0?'Монета.webp':'свиток.webp')}<span>${escapeHtml(student?.name||'Ученик')} ${message}</span><time>${relativeTime(event.timestamp)}</time></div>`}).join(''):`<div class="td-mini-empty activity">${icon('file')}<strong>Здесь появятся последние события</strong></div>`;
  }

  function relativeTime(timestamp){const minutes=Math.max(1,Math.floor((Date.now()-new Date(timestamp).getTime())/60000));if(minutes<60)return minutes+' мин. назад';const hours=Math.floor(minutes/60);if(hours<24)return hours+' ч. назад';return Math.floor(hours/24)+' дн. назад'}

  function buildProfileModal(){
    if(document.getElementById('modal-teacher-profile'))return;
    document.body.insertAdjacentHTML('beforeend',`<div id="modal-teacher-profile" class="modal-overlay" onclick="closeModalOverlay(event)"><div class="td-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="teacher-profile-title"><button class="td-profile-dialog-close" type="button" onclick="closeModal('modal-teacher-profile')" aria-label="Закрыть">×</button><header><span>${icon('user')}</span><div><h2 id="teacher-profile-title">Профиль учителя</h2><p>Настройте данные капитана экипажа</p></div></header><div class="td-profile-dialog-body"><aside class="td-profile-preview"><div id="teacher-profile-preview-avatar"></div><strong id="teacher-profile-preview-name">Иван Петрович</strong><span id="teacher-profile-preview-org">Учитель</span></aside><div class="td-profile-fields"><label>Имя<input id="teacher-profile-name" type="text" maxlength="60" placeholder="Иван"></label><label>Отображаемое имя<input id="teacher-profile-display-name" type="text" maxlength="80" placeholder="Иван Петрович"></label><label>Школа или организация<input id="teacher-profile-organization" type="text" maxlength="100" placeholder="Необязательно"></label><fieldset><legend>Аватар</legend><div id="teacher-avatar-picker" class="td-teacher-avatar-picker"></div></fieldset><button class="td-profile-save" type="button" onclick="saveTeacherProfile()">Сохранить профиль</button></div></div></div></div>`);
    ['teacher-profile-name','teacher-profile-display-name','teacher-profile-organization'].forEach(id=>document.getElementById(id).addEventListener('input',updateTeacherProfilePreview));
  }

  function updateTeacherProfilePreview(){
    const avatar=teacherAvatars.find(item=>item.id===selectedTeacherAvatar)||teacherAvatars[0];
    const display=document.getElementById('teacher-profile-display-name')?.value.trim()||document.getElementById('teacher-profile-name')?.value.trim()||'Иван Петрович';
    const organization=document.getElementById('teacher-profile-organization')?.value.trim()||'Учитель';
    const avatarBox=document.getElementById('teacher-profile-preview-avatar');
    if(avatarBox)avatarBox.innerHTML=teacherAvatarMarkup({avatarSrc:avatar.src,avatarId:avatar.id});
    const name=document.getElementById('teacher-profile-preview-name'),org=document.getElementById('teacher-profile-preview-org');
    if(name)name.textContent=display;if(org)org.textContent=organization;
  }

  function renderTeacherAvatarPicker(){
    const picker=document.getElementById('teacher-avatar-picker');if(!picker)return;
    picker.innerHTML=teacherAvatars.map(avatar=>`<button type="button" class="${avatar.id===selectedTeacherAvatar?'selected':''}" onclick="chooseTeacherAvatar('${avatar.id}')" aria-label="Выбрать аватар">${teacherAvatarMarkup({avatarSrc:avatar.src,avatarId:avatar.id})}<i>✓</i></button>`).join('');
  }

  window.chooseTeacherAvatar=function(id){if(!teacherAvatars.some(item=>item.id===id))return;selectedTeacherAvatar=id;renderTeacherAvatarPicker();updateTeacherProfilePreview();window.PirateSound?.play('click')};
  window.openTeacherProfile=function(editMode=false){
    buildProfileModal();const profile=ensureTeacherProfile();selectedTeacherAvatar=profile.avatarId;
    document.getElementById('teacher-profile-name').value=profile.name;
    document.getElementById('teacher-profile-display-name').value=profile.displayName;
    document.getElementById('teacher-profile-organization').value=profile.organization;
    renderTeacherAvatarPicker();updateTeacherProfilePreview();document.getElementById('td-profile-menu')?.classList.remove('open');openModal('modal-teacher-profile');
    if(editMode)setTimeout(()=>document.getElementById('teacher-profile-name')?.focus(),80);
  };
  window.saveTeacherProfile=function(){
    const name=document.getElementById('teacher-profile-name').value.trim();
    const displayName=document.getElementById('teacher-profile-display-name').value.trim();
    if(!name||!displayName){showToast('Заполните имя и отображаемое имя');return}
    const avatar=teacherAvatars.find(item=>item.id===selectedTeacherAvatar)||teacherAvatars[0];
    appData.teacherProfile={name,displayName,organization:document.getElementById('teacher-profile-organization').value.trim(),avatarSrc:avatar.src,avatarId:avatar.id};
    saveData();renderTeacherView();closeModal('modal-teacher-profile');window.PirateSound?.play('success');showToast('Профиль учителя сохранён');
  };

  function render(){
    const select=document.getElementById('teacher-class-select');if(!select)return;
    select.innerHTML=appData.classes.length?appData.classes.map(item=>`<option value="${item.id}" ${item.id===appData.currentClassId?'selected':''}>${escapeHtml(item.name)}</option>`).join(''):'<option value="">Нет класса</option>';
    const profile=ensureTeacherProfile(),user=document.querySelector('.td-user');
    if(user){const avatar=user.querySelector('img'),name=user.querySelector('small');if(avatar){avatar.src=profile.avatarSrc;avatar.className=''}if(name)name.textContent=profile.displayName;}
    const input=document.getElementById('td-search'),sortSelect=document.getElementById('td-sort');if(input&&input.value!==query)input.value=query;if(sortSelect)sortSelect.value=order;
    const cls=getCurrentClass();renderStats(cls);renderCrew(cls);renderRail(cls);updateRequestsBadge();
  }

  window.toggleTeacherMenu=function(studentId,event){event.stopPropagation();const menu=document.getElementById('td-menu-'+studentId);document.querySelectorAll('.td-card-menu.open').forEach(item=>{if(item!==menu)item.classList.remove('open')});menu?.classList.toggle('open')};
  window.toggleTeacherProfile=function(event){event.stopPropagation();document.getElementById('td-profile-menu')?.classList.toggle('open')};
  document.addEventListener('click',()=>{document.querySelectorAll('.td-card-menu.open').forEach(item=>item.classList.remove('open'));document.getElementById('td-profile-menu')?.classList.remove('open')});
  buildProfileModal();
  build();
  renderTeacherView=render;
  if(appData.currentUser?.role==='teacher')renderTeacherView();
})();
