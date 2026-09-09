(function(){
  const ICON_BASE='assets/achievements/';
  const ICONS=[
    ['anchor','01-anchor.png','Якорь','Надёжный товарищ'],['compass','02-compass.png','Компас','Финансовый навигатор'],['coins','03-coins.png','Монеты','Мастер бюджета'],['chest','04-chest.png','Сундук','Хранитель сокровищ'],['pirate_flag','05-pirate-flag.png','Флаг','Смелый капитан'],['treasure_map','06-treasure-map.png','Карта','Исследователь решений'],['ship_wheel','07-ship-wheel.png','Штурвал','Уверенный курс'],['spyglass','08-spyglass.png','Подзорная труба','Голос команды'],['crown','09-crown.png','Корона','Капитан класса'],['trophy','10-trophy.png','Кубок','Победитель недели'],['ruby','11-ruby.png','Рубин','Редкая находка'],['star','12-star.png','Звезда','Звезда прогресса'],['lantern','13-lantern.png','Фонарь','Свет знаний'],['key','14-key.png','Ключ','Ключ к успеху'],['sextant','15-sextant.png','Секстант','Мастер курса'],['parrot','16-parrot.png','Попугай','Верный попутчик'],['crossed_swords','17-crossed-swords.png','Клинки','Защитник команды'],['shield','18-shield.png','Щит','Щит ответственности'],['telescope','19-telescope.png','Зрительная труба','Открытие дня'],['scroll','20-scroll.png','Свиток','Свиток знаний']
  ].map(([id,file,label,defaultTitle])=>({id,path:ICON_BASE+file,label,defaultTitle}));
  const RARITIES={common:{label:'Обычная'},rare:{label:'Редкая'},epic:{label:'Эпическая'},legendary:{label:'Легендарная'}};
  const AUTO_ICON_PATHS={first_coin:'03-coins.png',balance_50:'04-chest.png',balance_100:'11-ruby.png',balance_300:'10-trophy.png',first_purchase:'14-key.png',five_purchases:'09-crown.png'};
  let selectedIcon='compass',selectedRarity='common',editingId=null,showAll=false,currentAwardId=null,preferredStudentId=null;

  function normalizeAchievement(a,cls){
    if(!a) return a;
    a.name=a.name||a.title||'Достижение'; a.title=a.name;
    a.description=a.description||''; a.iconId=a.iconId||'compass';
    const icon=ICONS.find(i=>i.id===a.iconId)||ICONS[1];
    a.iconPath=a.iconPath||icon.path; a.rarity=RARITIES[a.rarity]?a.rarity:'common';
    a.fincoins=Math.max(0,Math.min(50,Number(a.fincoins)||0)); a.type='manual';
    a.classId=a.classId||cls?.id||''; a.teacherUid=a.teacherUid||'local-teacher';
    a.createdAt=Number(a.createdAt)||Date.now(); a.updatedAt=Number(a.updatedAt)||a.createdAt;
    if(a.active===undefined) a.active=true; if(!Array.isArray(a.awarded_to)) a.awarded_to=[];
    delete a.emoji; return a;
  }
  function migrate(){
    let dirty=false;
    AUTO_ACHIEVEMENTS.forEach(a=>{a.iconPath=ICON_BASE+(AUTO_ICON_PATHS[a.id]||'12-star.png');delete a.emoji});
    (appData.classes||[]).forEach(cls=>{if(!Array.isArray(cls.achievements))cls.achievements=[];cls.achievements.forEach(a=>{if(a.emoji||!a.iconPath||!a.rarity){normalizeAchievement(a,cls);dirty=true}});(cls.students||[]).forEach(s=>{if(!Array.isArray(s.awardedAchievements))s.awardedAchievements=[]})});
    if(dirty) saveData();
  }
  function iconById(id){return ICONS.find(i=>i.id===id)||ICONS[1]}
  function rarityLabel(id){return (RARITIES[id]||RARITIES.common).label}
  function clampCoins(v){return Math.max(0,Math.min(50,Math.round(Number(v)||0)))}
  function formEls(){return {name:document.getElementById('ach-name'),desc:document.getElementById('ach-desc'),coins:document.getElementById('ach-coins'),submit:document.getElementById('achievement-submit')}}

  function buildControls(){
    const rarity=document.getElementById('achievement-rarity-options'),grid=document.getElementById('achievement-icon-grid'); if(!rarity||!grid)return;
    rarity.innerHTML=Object.entries(RARITIES).map(([id,r])=>`<button type="button" class="cabin-rarity-option ${id===selectedRarity?'is-selected':''}" data-rarity="${id}" role="radio" aria-checked="${id===selectedRarity}"><i aria-hidden="true"></i><span>${r.label}</span></button>`).join('');
    rarity.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{selectedRarity=btn.dataset.rarity;buildControls();updatePreview();window.PirateSound?.play('click')}));
    grid.innerHTML=ICONS.map(icon=>`<button type="button" class="cabin-icon-option ${icon.id===selectedIcon?'is-selected':''}" data-icon="${icon.id}" role="radio" aria-checked="${icon.id===selectedIcon}" aria-label="${icon.label}"><img src="${icon.path}" alt=""><span>${icon.label}</span></button>`).join('');
    grid.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{selectedIcon=btn.dataset.icon;buildControls();updatePreview();window.PirateSound?.play('click')}));
  }
  function updatePreview(){
    const e=formEls(); if(!e.name)return; const icon=iconById(selectedIcon),coins=clampCoins(e.coins.value);
    document.getElementById('achievement-preview-icon').src=icon.path;document.getElementById('achievement-preview-icon').alt=icon.label;
    document.getElementById('achievement-preview-name').textContent=e.name.value.trim()||'Название достижения';document.getElementById('achievement-preview-description').textContent=e.desc.value.trim()||'Описание появится здесь';
    const badge=document.getElementById('achievement-preview-rarity');badge.textContent=rarityLabel(selectedRarity);badge.className='cabin-badge rarity-'+selectedRarity;
    const coin=document.getElementById('achievement-preview-coins');coin.hidden=coins===0;coin.textContent='◉ +'+coins+' финкоинов';
    const valid=e.name.value.trim().length>=2&&e.desc.value.trim().length>0&&!!selectedIcon;e.submit.disabled=!valid;
    document.getElementById('ach-name-error').textContent=e.name.value&&e.name.value.trim().length<2?'Минимум 2 символа':'';document.getElementById('ach-desc-error').textContent='';
  }
  function resetForm(){
    const e=formEls();if(!e.name)return;e.name.value='';e.desc.value='';e.coins.value='0';selectedIcon='compass';selectedRarity='common';editingId=null;
    e.submit.querySelector('span').textContent='Создать достижение';document.getElementById('achievement-cancel-edit').hidden=true;buildControls();updatePreview();
  }
  function initCabin(){
    migrate();resetForm();showAll=false;const e=formEls();if(!e.name.dataset.cabinBound){e.name.addEventListener('input',updatePreview);e.desc.addEventListener('input',updatePreview);e.coins.addEventListener('input',()=>{e.coins.value=clampCoins(e.coins.value);updatePreview()});e.name.dataset.cabinBound='true'}renderCards();setTimeout(()=>e.name.focus(),40);
  }
  function validate(){
    const e=formEls(),name=e.name.value.trim(),desc=e.desc.value.trim();let ok=true;
    document.getElementById('ach-name-error').textContent='';document.getElementById('ach-desc-error').textContent='';
    if(name.length<2){document.getElementById('ach-name-error').textContent='Введите название достижения (минимум 2 символа)';ok=false}if(!desc){document.getElementById('ach-desc-error').textContent='Введите описание достижения';ok=false}return ok;
  }
  function saveAchievement(){
    const cls=getCurrentClass();if(!cls||!validate())return;const e=formEls(),now=Date.now(),icon=iconById(selectedIcon),name=e.name.value.trim(),existing=editingId&&cls.achievements.find(a=>a.id===editingId);
    if(existing){Object.assign(existing,{name,title:name,description:e.desc.value.trim(),iconId:selectedIcon,iconPath:icon.path,rarity:selectedRarity,fincoins:clampCoins(e.coins.value),updatedAt:now});showToast('Изменения сохранены');}
    else{cls.achievements.push({id:generateId('ach'),classId:cls.id,teacherUid:'local-teacher',name,title:name,description:e.desc.value.trim(),iconId:selectedIcon,iconPath:icon.path,rarity:selectedRarity,fincoins:clampCoins(e.coins.value),createdAt:now,updatedAt:now,active:true,type:'manual',condition:null,awarded_to:[]});showToast('Достижение «'+name+'» создано!');window.PirateSound?.play('achievement')}
    saveData();resetForm();renderCards();renderTeacherView();
  }
  function renderCards(){
    const cls=getCurrentClass(),list=document.getElementById('manual-achievements-list'),all=cls?(cls.achievements||[]).map(a=>normalizeAchievement(a,cls)):[];if(!list)return;
    const toggle=document.getElementById('achievement-show-all');toggle.textContent=(showAll?'Свернуть':'Показать все')+' ('+all.length+') '+(showAll?'↑':'→');
    if(!all.length){list.innerHTML='<div class="cabin-empty"><img src="assets/achievements/10-trophy.png" alt=""><strong>В каюте пока нет достижений</strong><span>Создайте первый бейдж для своего экипажа</span></div>';return}
    const visible=showAll?all:all.slice(0,3);list.innerHTML=visible.map(a=>`<article class="cabin-achievement-card rarity-${a.rarity} ${a.active?'':'is-hidden'}"><img src="${a.iconPath}" alt=""><div class="cabin-card-body"><h4>${escapeHtml(a.name)}</h4><p>${escapeHtml(a.description)}</p><div class="cabin-card-meta"><span class="cabin-badge rarity-${a.rarity}">${rarityLabel(a.rarity)}</span>${a.fincoins?`<span class="cabin-coin-badge">◉ +${a.fincoins}</span>`:''}<span class="cabin-card-awarded">Выдано: ${a.awarded_to.length}</span></div></div><div class="cabin-card-actions"><button class="give" onclick="openAchievementAward('${a.id}')" ${a.active?'':'disabled'}>Выдать</button><button onclick="editAchievement('${a.id}')">Редактировать</button><button class="more" aria-label="Другие действия" onclick="toggleAchievementMenu('${a.id}',this)">•••</button></div><div class="cabin-card-menu" data-menu="${a.id}" hidden><button onclick="duplicateAchievement('${a.id}')">Дублировать</button><button onclick="toggleAchievementActive('${a.id}')">${a.active?'Скрыть':'Показать'}</button><button class="danger" onclick="deleteAchievement('${a.id}')">Удалить</button></div></article>`).join('');
  }
  function edit(id){const cls=getCurrentClass(),a=cls?.achievements.find(x=>x.id===id);if(!a)return;const e=formEls();editingId=id;selectedIcon=a.iconId;selectedRarity=a.rarity;e.name.value=a.name;e.desc.value=a.description;e.coins.value=a.fincoins;e.submit.querySelector('span').textContent='Сохранить изменения';document.getElementById('achievement-cancel-edit').hidden=false;buildControls();updatePreview();document.querySelector('.cabin-form')?.scrollIntoView({behavior:'smooth',block:'start'});e.name.focus()}
  function duplicate(id){const cls=getCurrentClass(),a=cls?.achievements.find(x=>x.id===id);if(!a)return;const copy={...a,id:generateId('ach'),name:a.name+' — копия',title:a.name+' — копия',createdAt:Date.now(),updatedAt:Date.now(),awarded_to:[],active:true};cls.achievements.push(copy);saveData();renderCards();showToast('Копия достижения создана')}
  function toggleActive(id){const cls=getCurrentClass(),a=cls?.achievements.find(x=>x.id===id);if(!a)return;a.active=!a.active;a.updatedAt=Date.now();saveData();renderCards();showToast(a.active?'Достижение снова доступно':'Достижение скрыто')}
  function remove(id){const cls=getCurrentClass(),a=cls?.achievements.find(x=>x.id===id);if(!a)return;showConfirm('Удалить достижение?','Ученики, которые уже получили его, сохранят достижение в своей истории.',()=>{if(a.awarded_to?.length){a.active=false;a.deleted=true}else cls.achievements=cls.achievements.filter(x=>x.id!==id);saveData();renderCards();showToast('Достижение удалено')})}
  function menu(id,btn){const m=document.querySelector(`[data-menu="${id}"]`),willOpen=m.hidden;document.querySelectorAll('.cabin-card-menu').forEach(x=>x.hidden=true);m.hidden=!willOpen;btn.setAttribute('aria-expanded',String(willOpen))}

  function openAward(achievementId,studentId){
    const cls=getCurrentClass(),a=cls?.achievements.find(x=>x.id===achievementId&&x.active);if(!a){showToast('Сначала создайте доступное достижение');return}currentAwardId=a.id;preferredStudentId=studentId||null;
    document.getElementById('award-achievement-icon').src=a.iconPath;document.getElementById('award-dialog-title').textContent=a.name;document.getElementById('award-comment').value='';
    const list=document.getElementById('award-achievements-list');list.innerHTML=(cls.students||[]).map(s=>{const got=a.awarded_to.includes(s.id),checked=!got&&s.id===preferredStudentId;const avatar=s.avatarSrc||s.flag;const avatarMarkup=avatar&&/\.(png|jpg|jpeg|webp)$/i.test(avatar)?`<img src="${avatar}" alt="">`:`<span>${escapeHtml(avatar||'')}</span>`;return `<label class="award-student-option ${checked?'is-selected':''} ${got?'is-disabled':''}"><input type="checkbox" value="${s.id}" ${checked?'checked':''} ${got?'disabled':''}>${avatarMarkup}<span>${escapeHtml(s.name)}${got?' · уже получено':''}</span></label>`}).join('')||'<div class="cabin-empty">В классе пока нет учеников</div>';
    list.querySelectorAll('input').forEach(x=>x.addEventListener('change',()=>{x.closest('label').classList.toggle('is-selected',x.checked);updateAwardButton()}));updateAwardButton();openModal('modal-award-achievement');
  }
  function openForStudent(studentId){const cls=getCurrentClass(),a=(cls?.achievements||[]).find(x=>x.active&&!x.awarded_to?.includes(studentId));if(!a){showToast((cls?.achievements||[]).length?'Все доступные достижения уже выданы':'Сначала создайте достижение в «Каюте достижений»');return}openAward(a.id,studentId)}
  function updateAwardButton(){const count=document.querySelectorAll('#award-achievements-list input:checked').length;const b=document.getElementById('award-submit');if(b){b.disabled=count===0;b.textContent=count>1?'Выдать достижение · '+count:'Выдать достижение'}}
  function toggleAll(){const boxes=[...document.querySelectorAll('#award-achievements-list input:not(:disabled)')],should=boxes.some(x=>!x.checked);boxes.forEach(x=>{x.checked=should;x.closest('label').classList.toggle('is-selected',should)});updateAwardButton()}
  function submitAward(){
    const cls=getCurrentClass(),a=cls?.achievements.find(x=>x.id===currentAwardId),ids=[...document.querySelectorAll('#award-achievements-list input:checked')].map(x=>x.value);if(!a||!ids.length)return;const now=Date.now(),comment=document.getElementById('award-comment').value.trim();let count=0;
    ids.forEach(id=>{const s=cls.students.find(x=>x.id===id);if(!s||a.awarded_to.includes(id))return;a.awarded_to.push(id);if(!Array.isArray(s.achievements))s.achievements=[];if(!s.achievements.includes('manual_'+a.id))s.achievements.push('manual_'+a.id);if(!Array.isArray(s.awardedAchievements))s.awardedAchievements=[];s.awardedAchievements.push({id:generateId('student-ach'),achievementId:a.id,studentUid:s.id,classId:cls.id,teacherUid:'local-teacher',awardedAt:now,awardedBy:'local-teacher',titleSnapshot:a.name,descriptionSnapshot:a.description,iconIdSnapshot:a.iconId,iconPathSnapshot:a.iconPath,raritySnapshot:a.rarity,fincoinsSnapshot:a.fincoins,teacherComment:comment});if(a.fincoins){s.fincoins_balance=(Number(s.fincoins_balance)||0)+a.fincoins;if(!Array.isArray(cls.transactions))cls.transactions=[];cls.transactions.push({id:generateId('txn'),student_id:s.id,amount:a.fincoins,description:'Достижение: '+a.name,type:'income',timestamp:new Date(now).toISOString()})}checkAutoAchievements(s,cls);count++});
    a.updatedAt=now;saveData();closeModal('modal-award-achievement');renderCards();renderTeacherView();window.PirateSound?.play('achievement');showToast(count===1?'Достижение «'+a.name+'» выдано!':'Достижение выдано '+count+' ученикам')
  }

  window.ACHIEVEMENT_ICONS=ICONS;window.achievementIconById=iconById;window.achievementRarityLabel=rarityLabel;
  window.initEmojiPicker=initCabin;window.addManualAchievement=saveAchievement;window.renderManualAchievements=renderCards;window.cancelAchievementEdit=resetForm;window.toggleAchievementCards=()=>{showAll=!showAll;renderCards()};window.editAchievement=edit;window.duplicateAchievement=duplicate;window.toggleAchievementActive=toggleActive;window.deleteAchievement=remove;window.toggleAchievementMenu=menu;window.openAchievementAward=openAward;window.openAwardAchievement=openForStudent;window.toggleAllAwardStudents=toggleAll;window.submitAchievementAward=submitAward;
  let lastModalFocus=null;const baseOpenModal=window.openModal,baseCloseModal=window.closeModal;
  window.openModal=function(id){lastModalFocus=document.activeElement;baseOpenModal(id);document.body.classList.add('modal-is-open')};
  window.closeModal=function(id){baseCloseModal(id);if(!document.querySelector('.modal-overlay.active'))document.body.classList.remove('modal-is-open');if(lastModalFocus&&document.contains(lastModalFocus))lastModalFocus.focus()};
  document.addEventListener('keydown',event=>{const overlay=document.querySelector('.modal-overlay.active');if(!overlay)return;if(event.key==='Escape'){event.preventDefault();window.closeModal(overlay.id);return}if(event.key==='Tab'){const focusable=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(x=>!x.hidden&&x.offsetParent!==null);if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}});
  migrate();
  if(appData.currentUser?.role==='teacher')renderTeacherView();else if(appData.currentUser?.role==='student')renderStudentView();
})();
