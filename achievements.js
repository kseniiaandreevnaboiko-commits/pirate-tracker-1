(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PirateAchievements=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const AUTO_ACHIEVEMENTS=Object.freeze([
    Object.freeze({id:'first_coin',name:'Первый финкоин',desc:'Получить первую монету',emoji:'💰',iconPath:'assets/achievements/03-coins.webp',condition:'Заработать хотя бы 1 финкоин за курс',metric:'lifetimeEarned',threshold:1}),
    Object.freeze({id:'balance_50',name:'Копилка',desc:'Накопить 50 финкоинов',emoji:'🐷',iconPath:'assets/achievements/04-chest.webp',condition:'Заработать 50 финкоинов за курс',metric:'lifetimeEarned',threshold:50}),
    Object.freeze({id:'balance_100',name:'Состоятельный пират',desc:'Накопить 100 финкоинов',emoji:'💎',iconPath:'assets/achievements/11-ruby.webp',condition:'Заработать 100 финкоинов за курс',metric:'lifetimeEarned',threshold:100}),
    Object.freeze({id:'balance_300',name:'Адмиральские амбиции',desc:'Накопить 300 финкоинов',emoji:'🏆',iconPath:'assets/achievements/10-trophy.webp',condition:'Заработать 300 финкоинов за курс',metric:'lifetimeEarned',threshold:300}),
    Object.freeze({id:'first_purchase',name:'Первая покупка',desc:'Купить первую награду',emoji:'🛒',iconPath:'assets/achievements/14-key.webp',condition:'Совершить 1 подтверждённую покупку',metric:'purchases',threshold:1}),
    Object.freeze({id:'five_purchases',name:'Шоппинг',desc:'Совершить 5 покупок',emoji:'🛍️',iconPath:'assets/achievements/09-crown.webp',condition:'Совершить 5 подтверждённых покупок',metric:'purchases',threshold:5})
  ]);
  const AUTO_IDS=new Set(AUTO_ACHIEVEMENTS.map(item=>item.id));

  function isPurchaseTransaction(transaction){
    if(!transaction||transaction.type!=='expense')return false;
    return transaction.category==='purchase'||(!transaction.category&&String(transaction.description||'').startsWith('Покупка:'));
  }

  function getPurchaseCount(studentId,cls){
    return (cls?.transactions||[]).filter(item=>item.student_id===studentId&&isPurchaseTransaction(item)).length;
  }

  function getEligibleAutoIds(student,cls){
    const lifetimeEarned=Math.max(0,Number(student?.lifetimeEarned)||0);
    const purchases=getPurchaseCount(student?.id,cls);
    return AUTO_ACHIEVEMENTS.filter(item=>item.metric==='lifetimeEarned'?lifetimeEarned>=item.threshold:purchases>=item.threshold).map(item=>item.id);
  }

  function getStudentAutoIds(student){
    return [...new Set((student?.achievements||[]).filter(id=>AUTO_IDS.has(id)))];
  }

  function reconcileStudent(student,cls){
    if(!student)return [];
    if(!Array.isArray(student.achievements))student.achievements=[];
    const present=new Set(student.achievements);
    const added=[];
    getEligibleAutoIds(student,cls).forEach(id=>{
      if(present.has(id))return;
      student.achievements.push(id);
      present.add(id);
      added.push(AUTO_ACHIEVEMENTS.find(item=>item.id===id));
    });
    return added;
  }

  function reconcileData(data){
    const awards=[];
    (data?.classes||[]).forEach(cls=>(cls.students||[]).forEach(student=>{
      reconcileStudent(student,cls).forEach(achievement=>awards.push({classId:cls.id,studentId:student.id,achievement}));
    }));
    return {changed:awards.length>0,awards};
  }

  function getStudentManualIds(student,cls){
    const ids=new Set();
    (student?.achievements||[]).forEach(id=>{if(typeof id==='string'&&id.startsWith('manual_'))ids.add(id.slice(7))});
    (cls?.achievements||[]).forEach(item=>{if((item.awarded_to||[]).includes(student?.id))ids.add(item.id)});
    (student?.awardedAchievements||[]).forEach(item=>{if(item?.achievementId)ids.add(item.achievementId)});
    return [...ids];
  }

  function getStudentManualAchievements(student,cls){
    const definitions=new Map((cls?.achievements||[]).map(item=>[item.id,item]));
    const snapshots=new Map();
    (student?.awardedAchievements||[]).forEach(item=>{if(item?.achievementId&&!snapshots.has(item.achievementId))snapshots.set(item.achievementId,item)});
    return getStudentManualIds(student,cls).map(id=>{
      const definition=definitions.get(id),snapshot=snapshots.get(id);
      return {
        id,
        name:definition?.name||snapshot?.titleSnapshot||'Достижение',
        description:definition?.description||snapshot?.descriptionSnapshot||'',
        iconPath:definition?.iconPath||snapshot?.iconPathSnapshot||'assets/achievements/02-compass.webp',
        rarity:definition?.rarity||snapshot?.raritySnapshot||'common',
        fincoins:Number(definition?.fincoins??snapshot?.fincoinsSnapshot)||0,
        awardedAt:snapshot?.awardedAt||null
      };
    });
  }

  function countStudentAchievements(student,cls){
    return getStudentAutoIds(student).length+getStudentManualIds(student,cls).length;
  }

  function countClassAchievements(cls){
    return (cls?.students||[]).reduce((total,student)=>total+countStudentAchievements(student,cls),0);
  }

  function getAwardedStudents(cls,achievementId){
    return (cls?.students||[]).filter(student=>(student.achievements||[]).includes(achievementId));
  }

  return {AUTO_ACHIEVEMENTS,isPurchaseTransaction,getPurchaseCount,getEligibleAutoIds,getStudentAutoIds,reconcileStudent,reconcileData,getStudentManualIds,getStudentManualAchievements,countStudentAchievements,countClassAchievements,getAwardedStudents};
});
