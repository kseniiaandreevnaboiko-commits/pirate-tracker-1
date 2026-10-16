const AUTO_DEFINITIONS = [
  { id: 'first_coin', metric: 'lifetimeEarned', threshold: 1 },
  { id: 'balance_50', metric: 'lifetimeEarned', threshold: 50 },
  { id: 'balance_100', metric: 'lifetimeEarned', threshold: 100 },
  { id: 'balance_300', metric: 'lifetimeEarned', threshold: 300 },
  { id: 'first_purchase', metric: 'purchases', threshold: 1 },
  { id: 'five_purchases', metric: 'purchases', threshold: 5 }
];

let db;
let auth;
let fs;
let activeSession;
let refreshTimer;
let unsubscribers = [];
let wiredKeys = new Set();
let realtimeGeneration = 0;

const nowIso = () => new Date().toISOString();
const id = prefix => `${prefix}_${crypto.randomUUID()}`;
const int = value => Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
const classRef = classId => fs.doc(db, 'classes', classId);
const studentRef = (classId, studentId) => fs.doc(db, 'classes', classId, 'students', studentId);
const subRef = (classId, collectionName, documentId) => fs.doc(db, 'classes', classId, collectionName, documentId);
const teacherProfileRef = uid => fs.doc(db, 'teacherProfiles', uid);

function requireTeacher() {
  if (!activeSession || activeSession.role !== 'teacher' || !auth.currentUser) throw new Error('Требуется защищённая сессия учителя.');
  return auth.currentUser;
}

function publicRank(lifetimeEarned) {
  return window.PirateEconomy.getRank(lifetimeEarned).name;
}

function normalizeTeacherProfile(profile) {
  if (!profile) return null;
  return {
    name: String(profile.name || '').trim(),
    displayName: String(profile.displayName || '').trim(),
    organization: String(profile.organization || '').trim(),
    avatarId: String(profile.avatarId || '').trim(),
    avatarSrc: String(profile.avatarSrc || '').trim()
  };
}

function validateTeacherProfile(profile) {
  const normalized = normalizeTeacherProfile(profile);
  if (!normalized?.name || normalized.name.length > 60) throw new Error('Некорректное имя учителя.');
  if (!normalized.displayName || normalized.displayName.length > 80) throw new Error('Некорректное отображаемое имя.');
  if (normalized.organization.length > 100) throw new Error('Название организации слишком длинное.');
  if (!normalized.avatarId || normalized.avatarId.length > 60) throw new Error('Некорректный аватар учителя.');
  if (!normalized.avatarSrc || normalized.avatarSrc.length > 200) throw new Error('Некорректный путь к аватару учителя.');
  return normalized;
}

function leaderboardData(studentId, data) {
  return {
    teacherUid: data.teacherUid,
    classId: data.classId,
    studentId,
    displayName: data.displayName,
    avatarId: data.avatarId || 'captain-boy',
    avatarSrc: data.avatarSrc || 'student-avatar-captain-boy.webp',
    lifetimeEarned: Number(data.lifetimeEarned || 0),
    rank: publicRank(data.lifetimeEarned),
    updatedAt: fs.serverTimestamp()
  };
}

function transactionData(studentId, classId, seasonId, input) {
  return {
    teacherUid: auth.currentUser.uid,
    classId,
    studentId,
    student_id: studentId,
    balanceDelta: input.balanceDelta,
    lifetimeDelta: input.lifetimeDelta,
    amount: input.balanceDelta,
    type: input.balanceDelta === 0 ? 'correction' : input.balanceDelta > 0 ? 'income' : 'expense',
    category: input.category,
    description: input.description || '',
    seasonId: seasonId || null,
    idempotencyKey: input.operationId,
    createdAt: fs.serverTimestamp(),
    timestamp: nowIso()
  };
}

function autoEligible(balance, lifetimeEarned, purchaseCount) {
  return AUTO_DEFINITIONS.filter(item => item.metric === 'lifetimeEarned'
    ? lifetimeEarned >= item.threshold
    : purchaseCount >= item.threshold);
}

async function applyTeacherTransaction(input) {
  requireTeacher();
  const balanceDelta = int(input.balanceDelta);
  const lifetimeDelta = int(input.lifetimeDelta);
  if (!Number.isFinite(balanceDelta) || !Number.isFinite(lifetimeDelta) || (balanceDelta === 0 && lifetimeDelta === 0)) {
    throw new Error('Сумма операции должна быть целым ненулевым значением.');
  }
  const operationId = String(input.operationId || id('operation'));
  const profileRef = studentRef(input.classId, input.studentId);
  const operationRef = subRef(input.classId, 'transactions', operationId);
  const awardRefs = AUTO_DEFINITIONS.map(item => subRef(input.classId, 'studentAchievements', `auto_${input.studentId}_${item.id}`));
  const result = await fs.runTransaction(db, async transaction => {
    const [profileSnapshot, operationSnapshot, ...awardSnapshots] = await Promise.all([
      transaction.get(profileRef), transaction.get(operationRef), ...awardRefs.map(ref => transaction.get(ref))
    ]);
    if (operationSnapshot.exists()) return { duplicate: true };
    if (!profileSnapshot.exists()) throw new Error('Профиль ученика не найден.');
    const profile = profileSnapshot.data();
    const balance = Number(profile.balance || 0) + balanceDelta;
    const lifetimeEarned = Number(profile.lifetimeEarned || 0) + lifetimeDelta;
    if (balance < 0) throw new Error('Недостаточно финкоинов.');
    if (lifetimeEarned < 0) throw new Error('Общий заработок не может быть отрицательным.');
    const nextProfile = { ...profile, balance, lifetimeEarned };
    transaction.update(profileRef, { balance, lifetimeEarned, updatedAt: fs.serverTimestamp() });
    transaction.set(operationRef, transactionData(input.studentId, input.classId, profile.seasonId, {
      ...input, balanceDelta, lifetimeDelta, operationId
    }));
    autoEligible(balance, lifetimeEarned, Number(profile.purchaseCount || 0)).forEach(definition => {
      const index = AUTO_DEFINITIONS.findIndex(item => item.id === definition.id);
      if (!awardSnapshots[index].exists()) transaction.set(awardRefs[index], {
        teacherUid: profile.teacherUid, classId: input.classId, studentId: input.studentId,
        achievementId: definition.id, type: 'automatic', seasonId: profile.seasonId || null,
        awardedAt: fs.serverTimestamp(), fincoins: 0
      });
    });
    transaction.set(subRef(input.classId, 'leaderboard', input.studentId), leaderboardData(input.studentId, nextProfile));
    return { duplicate: false, balance, lifetimeEarned };
  });
  await refresh();
  return result;
}

async function createClass(name, legacyId = null) {
  const user = requireTeacher();
  const classId = legacyId || id('class');
  const seasonId = id('season');
  const batch = fs.writeBatch(db);
  batch.set(classRef(classId), {
    teacherUid: user.uid, name: String(name).trim(), currentSeasonId: seasonId,
    economyVersion: window.PirateEconomy.SCHEMA_VERSION, createdAt: fs.serverTimestamp()
  });
  batch.set(subRef(classId, 'seasons', seasonId), {
    teacherUid: user.uid, classId, status: 'active', startedAt: fs.serverTimestamp()
  });
  for (const definition of window.PirateAchievements.AUTO_ACHIEVEMENTS) {
    batch.set(subRef(classId, 'automaticAchievementDefinitions', definition.id), {
      ...definition, teacherUid: user.uid, classId, type: 'automatic', fincoins: 0
    });
  }
  await batch.commit();
  await refresh();
  return classId;
}

async function saveTeacherProfile(profile) {
  const user = requireTeacher();
  const normalized = validateTeacherProfile(profile);
  await fs.setDoc(teacherProfileRef(user.uid), {
    teacherUid: user.uid,
    ...normalized,
    updatedAt: fs.serverTimestamp()
  }, { merge: true });
  await refresh();
  return normalized;
}

async function createStudent(classId, input) {
  const user = requireTeacher();
  const classSnapshot = await fs.getDoc(classRef(classId));
  if (!classSnapshot.exists()) throw new Error('Класс не найден.');
  const studentId = input.legacyId || id('student');
  const profile = {
    teacherUid: user.uid, classId, studentId, legacyId: input.legacyId || null,
    displayName: String(input.displayName).trim(), avatarId: input.avatarId || 'captain-boy',
    avatarSrc: input.avatarSrc || 'student-avatar-captain-boy.webp', ownerUid: null,
    balance: 0, lifetimeEarned: 0, purchaseCount: 0, purchaseCounts: {},
    seasonId: classSnapshot.data().currentSeasonId, economyVersion: window.PirateEconomy.SCHEMA_VERSION,
    active: true, createdAt: fs.serverTimestamp()
  };
  const batch = fs.writeBatch(db);
  batch.set(studentRef(classId, studentId), profile);
  batch.set(subRef(classId, 'leaderboard', studentId), leaderboardData(studentId, profile));
  await batch.commit();
  await refresh();
  return studentId;
}

async function createStudentWithInvite(classId, input, inviteId, expiresAt) {
  const user = requireTeacher();
  const classSnapshot = await fs.getDoc(classRef(classId));
  if (!classSnapshot.exists()) throw new Error('Класс не найден.');
  const studentId = input.legacyId || id('student');
  const profile = {
    teacherUid: user.uid, classId, studentId, legacyId: input.legacyId || null,
    displayName: String(input.displayName).trim(), avatarId: input.avatarId || 'captain-boy',
    avatarSrc: input.avatarSrc || 'student-avatar-captain-boy.webp', ownerUid: null,
    balance: 0, lifetimeEarned: 0, purchaseCount: 0, purchaseCounts: {},
    seasonId: classSnapshot.data().currentSeasonId, economyVersion: window.PirateEconomy.SCHEMA_VERSION,
    active: true, createdAt: fs.serverTimestamp()
  };
  const batch = fs.writeBatch(db);
  batch.set(studentRef(classId, studentId), profile);
  batch.set(subRef(classId, 'leaderboard', studentId), leaderboardData(studentId, profile));
  batch.set(fs.doc(db, 'studentInvites', inviteId), {
    teacherUid: user.uid, classId, studentId, expiresAt, claimedBy: null, createdAt: fs.serverTimestamp()
  });
  await batch.commit();
  await refresh();
  return studentId;
}

async function archiveStudent(classId, studentId) {
  requireTeacher();
  const profileSnapshot = await fs.getDoc(studentRef(classId, studentId));
  if (!profileSnapshot.exists()) throw new Error('Ученик не найден.');
  const profile = profileSnapshot.data();
  const entryRef = profile.loginCatalogId && profile.loginEntryId
    ? fs.doc(db, 'studentLoginClasses', profile.loginCatalogId, 'students', profile.loginEntryId)
    : null;
  const bindingRef = profile.ownerUid ? fs.doc(db, 'studentBindings', profile.ownerUid) : null;
  const [entrySnapshot, bindingSnapshot] = await Promise.all([
    entryRef ? fs.getDoc(entryRef) : Promise.resolve(null),
    bindingRef ? fs.getDoc(bindingRef) : Promise.resolve(null)
  ]);
  const batch = fs.writeBatch(db);
  batch.update(studentRef(classId, studentId), { active: false, archivedAt: fs.serverTimestamp() });
  batch.delete(subRef(classId, 'leaderboard', studentId));
  if (entrySnapshot?.exists()) batch.update(entryRef, { active: false, updatedAt: fs.serverTimestamp() });
  if (bindingSnapshot?.exists()) batch.delete(bindingRef);
  await batch.commit();
  await refresh();
}

async function reconcileArchivedStudentCatalogs() {
  const user = requireTeacher();
  const classesSnapshot = await fs.getDocs(fs.query(fs.collection(db, 'classes'), fs.where('teacherUid', '==', user.uid)));
  for (const classSnapshot of classesSnapshot.docs) {
    const students = await fs.getDocs(fs.collection(db, 'classes', classSnapshot.id, 'students'));
    const activeEntryIds = new Set(students.docs
      .filter(item => item.data().active !== false && item.data().loginEntryId)
      .map(item => item.data().loginEntryId));
    const catalogId = classSnapshot.data().loginCatalogId;
    const catalogEntries = catalogId
      ? await fs.getDocs(fs.collection(db, 'studentLoginClasses', catalogId, 'students'))
      : null;
    const staleEntries = catalogEntries?.docs.filter(item => item.data().active !== false && !activeEntryIds.has(item.id)) || [];
    const archivedStudents = students.docs.filter(item => item.data().active === false);
    const staleBindings = [];
    for (const studentSnapshot of archivedStudents) {
      const profile = studentSnapshot.data();
      const bindingRef = profile.ownerUid ? fs.doc(db, 'studentBindings', profile.ownerUid) : null;
      if (bindingRef && (await fs.getDoc(bindingRef)).exists()) staleBindings.push(bindingRef);
    }
    if (!staleEntries.length && !staleBindings.length) continue;
    const batch = fs.writeBatch(db);
    staleEntries.forEach(entry => batch.update(entry.ref, { active: false, updatedAt: fs.serverTimestamp() }));
    staleBindings.forEach(bindingRef => batch.delete(bindingRef));
    await batch.commit();
  }
}

async function saveReward(classId, reward) {
  const user = requireTeacher();
  const rewardId = reward.id || id('reward');
  const price = int(reward.price);
  const limit = int(reward.limit || 0);
  if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(limit) || limit < 0) throw new Error('Цена и лимит награды указаны неверно.');
  await fs.setDoc(subRef(classId, 'rewards', rewardId), {
    teacherUid: user.uid, classId, rewardId, legacyId: reward.legacyId || null,
    name: String(reward.name).trim(), category: reward.category,
    price, limit,
    image: reward.image || null, active: reward.active !== false,
    createdAt: reward.createdAt || fs.serverTimestamp(), updatedAt: fs.serverTimestamp()
  }, { merge: true });
  await refresh();
  return rewardId;
}

async function hideReward(classId, rewardId) {
  requireTeacher();
  await fs.updateDoc(subRef(classId, 'rewards', rewardId), { active: false, updatedAt: fs.serverTimestamp() });
  await refresh();
}

async function createPurchaseRequest(classId, studentId, rewardId) {
  if (activeSession?.role !== 'student' || activeSession.studentId !== studentId || activeSession.classId !== classId) throw new Error('Недоступная операция.');
  const requestId = id('request');
  const rewardRef = subRef(classId, 'rewards', rewardId);
  const requestRef = subRef(classId, 'purchaseRequests', requestId);
  await fs.runTransaction(db, async transaction => {
    const reward = await transaction.get(rewardRef);
    if (!reward.exists() || reward.data().active !== true) throw new Error('Товар недоступен.');
    transaction.set(requestRef, {
      teacherUid: reward.data().teacherUid, classId, requestId, studentId, student_id: studentId,
      rewardId, reward_id: rewardId, status: 'pending', createdAt: fs.serverTimestamp(), processedAt: null
    });
  });
  await refresh();
  return requestId;
}

async function approvePurchase(classId, requestId) {
  requireTeacher();
  const requestRef = subRef(classId, 'purchaseRequests', requestId);
  const operationRef = subRef(classId, 'transactions', `purchase_${requestId}`);
  const purchaseRef = subRef(classId, 'purchases', requestId);
  const result = await fs.runTransaction(db, async transaction => {
    const requestSnapshot = await transaction.get(requestRef);
    if (!requestSnapshot.exists()) throw new Error('Заявка не найдена.');
    const request = requestSnapshot.data();
    if (request.status === 'approved') return { duplicate: true };
    if (request.status !== 'pending') throw new Error('Заявка уже обработана.');
    const rewardRef = subRef(classId, 'rewards', request.rewardId);
    const profileRef = studentRef(classId, request.studentId);
    const rewardSnapshot = await transaction.get(rewardRef);
    const profileSnapshot = await transaction.get(profileRef);
    const operationSnapshot = await transaction.get(operationRef);
    const purchaseSnapshot = await transaction.get(purchaseRef);
    const awardRefs = AUTO_DEFINITIONS.map(item => subRef(classId, 'studentAchievements', `auto_${request.studentId}_${item.id}`));
    const awardSnapshots = await Promise.all(awardRefs.map(ref => transaction.get(ref)));
    if (operationSnapshot.exists() || purchaseSnapshot.exists()) return { duplicate: true };
    if (!rewardSnapshot.exists() || rewardSnapshot.data().active !== true) throw new Error('Товар недоступен.');
    if (!profileSnapshot.exists()) throw new Error('Ученик не найден.');
    const reward = rewardSnapshot.data();
    const profile = profileSnapshot.data();
    const price = int(reward.price);
    const balance = Number(profile.balance || 0) - price;
    if (balance < 0) throw new Error('Недостаточно финкоинов.');
    const counts = { ...(profile.purchaseCounts || {}) };
    const rewardCount = Number(counts[request.rewardId] || 0);
    if (Number(reward.limit || 0) > 0 && rewardCount >= Number(reward.limit)) throw new Error('Лимит покупок достигнут.');
    counts[request.rewardId] = rewardCount + 1;
    const purchaseCount = Number(profile.purchaseCount || 0) + 1;
    const nextProfile = { ...profile, balance, purchaseCount, purchaseCounts: counts };
    transaction.update(profileRef, { balance, purchaseCount, purchaseCounts: counts, updatedAt: fs.serverTimestamp() });
    transaction.update(requestRef, { status: 'approved', processedAt: fs.serverTimestamp(), processedBy: auth.currentUser.uid });
    transaction.set(operationRef, transactionData(request.studentId, classId, profile.seasonId, {
      balanceDelta: -price, lifetimeDelta: 0, category: 'purchase',
      description: `Покупка: ${reward.name}`, operationId: `purchase_${requestId}`
    }));
    transaction.set(purchaseRef, {
      teacherUid: profile.teacherUid, classId, purchaseId: requestId, requestId,
      studentId: request.studentId, rewardId: request.rewardId, rewardName: reward.name,
      price, seasonId: profile.seasonId || null, purchasedAt: fs.serverTimestamp()
    });
    autoEligible(balance, Number(profile.lifetimeEarned || 0), purchaseCount).forEach(definition => {
      const index = AUTO_DEFINITIONS.findIndex(item => item.id === definition.id);
      if (!awardSnapshots[index].exists()) transaction.set(awardRefs[index], {
        teacherUid: profile.teacherUid, classId, studentId: request.studentId,
        achievementId: definition.id, type: 'automatic', seasonId: profile.seasonId || null,
        awardedAt: fs.serverTimestamp(), fincoins: 0
      });
    });
    transaction.set(subRef(classId, 'leaderboard', request.studentId), leaderboardData(request.studentId, nextProfile));
    return { duplicate: false, balance };
  });
  await refresh();
  return result;
}

async function rejectPurchase(classId, requestId) {
  requireTeacher();
  const ref = subRef(classId, 'purchaseRequests', requestId);
  await fs.runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Заявка не найдена.');
    if (snapshot.data().status !== 'pending') return;
    transaction.update(ref, { status: 'rejected', processedAt: fs.serverTimestamp(), processedBy: auth.currentUser.uid });
  });
  await refresh();
}

async function saveManualAchievement(classId, definition) {
  const user = requireTeacher();
  const achievementId = definition.id || id('achievement');
  const fincoins = int(definition.fincoins || 0);
  if (!Number.isSafeInteger(fincoins) || fincoins < 0 || fincoins > 50) throw new Error('Бонус достижения должен быть целым числом от 0 до 50.');
  await fs.setDoc(subRef(classId, 'achievementDefinitions', achievementId), {
    ...definition, id: achievementId, achievementId, teacherUid: user.uid, classId,
    type: 'manual', fincoins,
    active: definition.active !== false, updatedAt: fs.serverTimestamp(),
    createdAt: definition.createdAt || fs.serverTimestamp()
  }, { merge: true });
  await refresh();
  return achievementId;
}

async function awardManualAchievement(classId, studentId, achievementId, comment = '') {
  requireTeacher();
  const definitionRef = subRef(classId, 'achievementDefinitions', achievementId);
  const profileRef = studentRef(classId, studentId);
  const awardRef = subRef(classId, 'studentAchievements', `manual_${studentId}_${achievementId}`);
  const operationRef = subRef(classId, 'transactions', `achievement_${studentId}_${achievementId}`);
  const autoRefs = AUTO_DEFINITIONS.map(item => subRef(classId, 'studentAchievements', `auto_${studentId}_${item.id}`));
  const result = await fs.runTransaction(db, async transaction => {
    const [definitionSnapshot, profileSnapshot, awardSnapshot, operationSnapshot, ...autoSnapshots] = await Promise.all([
      transaction.get(definitionRef), transaction.get(profileRef), transaction.get(awardRef), transaction.get(operationRef),
      ...autoRefs.map(ref => transaction.get(ref))
    ]);
    if (awardSnapshot.exists()) return { duplicate: true };
    if (!definitionSnapshot.exists() || definitionSnapshot.data().active !== true) throw new Error('Достижение недоступно.');
    if (!profileSnapshot.exists()) throw new Error('Ученик не найден.');
    const definition = definitionSnapshot.data();
    const profile = profileSnapshot.data();
    const bonus = Math.max(0, int(definition.fincoins) || 0);
    const balance = Number(profile.balance || 0) + bonus;
    const lifetimeEarned = Number(profile.lifetimeEarned || 0) + bonus;
    transaction.set(awardRef, {
      teacherUid: profile.teacherUid, classId, studentId, achievementId, type: 'manual',
      seasonId: profile.seasonId || null, awardedAt: fs.serverTimestamp(), awardedBy: auth.currentUser.uid,
      titleSnapshot: definition.name, descriptionSnapshot: definition.description,
      iconIdSnapshot: definition.iconId, iconPathSnapshot: definition.iconPath,
      raritySnapshot: definition.rarity, fincoinsSnapshot: bonus, fincoins: bonus, teacherComment: comment
    });
    if (bonus > 0 && !operationSnapshot.exists()) {
      transaction.update(profileRef, { balance, lifetimeEarned, updatedAt: fs.serverTimestamp() });
      transaction.set(operationRef, transactionData(studentId, classId, profile.seasonId, {
        balanceDelta: bonus, lifetimeDelta: bonus, category: 'achievement_bonus',
        description: `Достижение: ${definition.name}`, operationId: `achievement_${studentId}_${achievementId}`
      }));
    }
    autoEligible(balance, lifetimeEarned, Number(profile.purchaseCount || 0)).forEach(auto => {
      const index = AUTO_DEFINITIONS.findIndex(item => item.id === auto.id);
      if (!autoSnapshots[index].exists()) transaction.set(autoRefs[index], {
        teacherUid: profile.teacherUid, classId, studentId, achievementId: auto.id,
        type: 'automatic', seasonId: profile.seasonId || null, awardedAt: fs.serverTimestamp(), fincoins: 0
      });
    });
    transaction.set(subRef(classId, 'leaderboard', studentId), leaderboardData(studentId, { ...profile, balance, lifetimeEarned }));
    return { duplicate: false, bonus };
  });
  await refresh();
  return result;
}

async function awardManualAchievementBulk(classId, studentIds, achievementId, comment) {
  const results = [];
  for (const studentId of studentIds) {
    try { results.push({ studentId, ok: true, result: await awardManualAchievement(classId, studentId, achievementId, comment) }); }
    catch (error) { results.push({ studentId, ok: false, error: error.message }); }
  }
  return results;
}

async function applyTeacherTransactionsBulk(classId, studentIds, input) {
  const operationGroup = String(input.operationGroup || id('bulk'));
  const results = [];
  for (const studentId of [...new Set(studentIds)]) {
    try {
      const result = await applyTeacherTransaction({ ...input, classId, studentId, operationId: `${operationGroup}_${studentId}` });
      results.push({ studentId, ok: true, result });
    } catch (error) {
      results.push({ studentId, ok: false, error: error.message });
    }
  }
  return results;
}

async function startNewSeason(classId) {
  requireTeacher();
  const classDocument = classRef(classId);
  const studentsSnapshot = await fs.getDocs(fs.collection(db, 'classes', classId, 'students'));
  const seasonId = id('season');
  await fs.runTransaction(db, async transaction => {
    const classSnapshot = await transaction.get(classDocument);
    const studentSnapshots = await Promise.all(studentsSnapshot.docs.map(item => transaction.get(item.ref)));
    if (!classSnapshot.exists()) throw new Error('Класс не найден.');
    const currentSeasonId = classSnapshot.data().currentSeasonId;
    const summary = studentSnapshots.filter(item => item.exists()).map(item => ({
      studentId: item.id, balance: Number(item.data().balance || 0),
      lifetimeEarned: Number(item.data().lifetimeEarned || 0), rank: publicRank(item.data().lifetimeEarned)
    }));
    if (currentSeasonId) transaction.set(subRef(classId, 'seasons', currentSeasonId), {
      endedAt: fs.serverTimestamp(), status: 'closed', studentSummary: summary
    }, { merge: true });
    transaction.set(subRef(classId, 'seasons', seasonId), {
      teacherUid: auth.currentUser.uid, classId, status: 'active', startedAt: fs.serverTimestamp()
    });
    transaction.update(classDocument, { currentSeasonId: seasonId, updatedAt: fs.serverTimestamp() });
    studentSnapshots.forEach(snapshot => {
      if (!snapshot.exists()) return;
      transaction.update(snapshot.ref, { balance: 0, lifetimeEarned: 0, purchaseCount: 0, purchaseCounts: {}, seasonId, updatedAt: fs.serverTimestamp() });
      transaction.set(subRef(classId, 'leaderboard', snapshot.id), leaderboardData(snapshot.id, { ...snapshot.data(), balance: 0, lifetimeEarned: 0 }));
    });
  });
  await refresh();
  return seasonId;
}

function convertTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  return value;
}

function normalizeStudent(snapshot, awards = []) {
  const data = snapshot.data();
  const autoIds = awards.filter(item => item.type === 'automatic').map(item => item.achievementId);
  const manualAwards = awards.filter(item => item.type === 'manual').map(item => ({
    id: item.id, achievementId: item.achievementId, awardedAt: convertTimestamp(item.awardedAt),
    titleSnapshot: item.titleSnapshot, descriptionSnapshot: item.descriptionSnapshot,
    iconIdSnapshot: item.iconIdSnapshot, iconPathSnapshot: item.iconPathSnapshot,
    raritySnapshot: item.raritySnapshot, fincoinsSnapshot: item.fincoinsSnapshot,
    teacherComment: item.teacherComment
  }));
  return {
    id: snapshot.id, name: data.displayName, flag: data.avatarSrc, avatarId: data.avatarId,
    avatarSrc: data.avatarSrc, balance: Number(data.balance || 0), fincoins_balance: Number(data.balance || 0),
    lifetimeEarned: Number(data.lifetimeEarned || 0), achievements: [...autoIds, ...manualAwards.map(item => `manual_${item.achievementId}`)],
    awardedAchievements: manualAwards, seasonId: data.seasonId, ownerUid: data.ownerUid,
    purchaseCount: Number(data.purchaseCount || 0), active: data.active !== false,
    pinAuth: data.authMode === 'pin-password' ? { securePin: true } : { secureInvite: true }
  };
}

async function loadClass(classSnapshot, teacherMode, ownStudentId = null) {
  const classId = classSnapshot.id;
  const collections = teacherMode
    ? await Promise.all(['students', 'transactions', 'rewards', 'purchaseRequests', 'achievementDefinitions', 'studentAchievements', 'seasons', 'leaderboard'].map(name => fs.getDocs(fs.collection(db, 'classes', classId, name))))
    : null;
  if (teacherMode) {
    const [students, transactions, rewards, requests, definitions, awards, seasons] = collections;
    const awardData = awards.docs.map(item => ({ id: item.id, ...item.data() }));
    const normalizedStudents = students.docs.filter(item => item.data().active !== false).map(item => normalizeStudent(item, awardData.filter(award => award.studentId === item.id)));
    const achievementDefinitions = definitions.docs.map(item => ({ id: item.id, ...item.data(), awarded_to: awardData.filter(a => a.type === 'manual' && a.achievementId === item.id).map(a => a.studentId) }));
    return {
      id: classId, ...classSnapshot.data(), students: normalizedStudents,
      transactions: transactions.docs.map(item => ({ id: item.id, ...item.data(), timestamp: convertTimestamp(item.data().createdAt) || item.data().timestamp })),
      rewards: rewards.docs.filter(item => item.data().active !== false).map(item => ({ id: item.id, ...item.data() })),
      requests: requests.docs.map(item => ({ id: item.id, ...item.data(), createdAt: convertTimestamp(item.data().createdAt), processedAt: convertTimestamp(item.data().processedAt) })),
      achievements: achievementDefinitions,
      seasons: seasons.docs.map(item => ({ id: item.id, ...item.data(), startedAt: convertTimestamp(item.data().startedAt), endedAt: convertTimestamp(item.data().endedAt) }))
    };
  }
  const [profileSnapshot, awardsSnapshot, rewardsSnapshot, requestsSnapshot, transactionsSnapshot, definitionsSnapshot, leaderboardSnapshot] = await Promise.all([
    fs.getDoc(studentRef(classId, ownStudentId)),
    fs.getDocs(fs.query(fs.collection(db, 'classes', classId, 'studentAchievements'), fs.where('studentId', '==', ownStudentId))),
    fs.getDocs(fs.query(fs.collection(db, 'classes', classId, 'rewards'), fs.where('active', '==', true))),
    fs.getDocs(fs.query(fs.collection(db, 'classes', classId, 'purchaseRequests'), fs.where('studentId', '==', ownStudentId))),
    fs.getDocs(fs.query(fs.collection(db, 'classes', classId, 'transactions'), fs.where('studentId', '==', ownStudentId))),
    fs.getDocs(fs.query(fs.collection(db, 'classes', classId, 'achievementDefinitions'), fs.where('active', '==', true))),
    fs.getDocs(fs.collection(db, 'classes', classId, 'leaderboard'))
  ]);
  if (!profileSnapshot.exists()) throw new Error('Профиль ученика не найден.');
  const awards = awardsSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const own = normalizeStudent(profileSnapshot, awards);
  const leaders = leaderboardSnapshot.docs.filter(item => item.id !== ownStudentId).map(item => ({
    id: item.id, name: item.data().displayName, avatarId: item.data().avatarId, avatarSrc: item.data().avatarSrc,
    flag: item.data().avatarSrc, lifetimeEarned: Number(item.data().lifetimeEarned || 0), balance: 0,
    achievements: [], isLeaderboardProjection: true
  }));
  return {
    id: classId, ...classSnapshot.data(), students: [own, ...leaders],
    transactions: transactionsSnapshot.docs.map(item => ({ id: item.id, ...item.data(), timestamp: convertTimestamp(item.data().createdAt) || item.data().timestamp })),
    rewards: rewardsSnapshot.docs.map(item => ({ id: item.id, ...item.data() })),
    requests: requestsSnapshot.docs.map(item => ({ id: item.id, ...item.data(), createdAt: convertTimestamp(item.data().createdAt), processedAt: convertTimestamp(item.data().processedAt) })),
    achievements: definitionsSnapshot.docs.map(item => ({ id: item.id, ...item.data() })), seasons: []
  };
}

async function refresh() {
  if (!activeSession) return;
  if (activeSession.role === 'teacher') {
    const [classesSnapshot, profileSnapshot] = await Promise.all([
      fs.getDocs(fs.query(fs.collection(db, 'classes'), fs.where('teacherUid', '==', activeSession.uid))),
      fs.getDoc(teacherProfileRef(activeSession.uid))
    ]);
    const classes = await Promise.all(classesSnapshot.docs.map(item => loadClass(item, true)));
    window.PirateSecureBridge.hydrateTeacher(classes, profileSnapshot.exists() ? normalizeTeacherProfile(profileSnapshot.data()) : null);
  } else {
    const bindingSnapshot = await fs.getDoc(fs.doc(db, 'studentBindings', activeSession.uid));
    if (!bindingSnapshot.exists()) throw new Error('Привязка ученика отозвана.');
    const binding = bindingSnapshot.data();
    const classSnapshot = await fs.getDoc(classRef(binding.classId));
    const classData = await loadClass(classSnapshot, false, binding.studentId);
    const own = classData.students.find(item => item.id === binding.studentId);
    window.PirateSecureBridge.hydrateStudent(classData, own, classData.students);
  }
  window.dispatchEvent(new CustomEvent('pirate-data-synced'));
}

async function wireTeacherCollections(generation = realtimeGeneration) {
  if (generation !== realtimeGeneration || !activeSession || activeSession.role !== 'teacher') return;
  const classesQuery = fs.query(fs.collection(db, 'classes'), fs.where('teacherUid', '==', activeSession.uid));
  const classesSnapshot = await fs.getDocs(classesQuery);
  if (generation !== realtimeGeneration || !activeSession) return;
  classesSnapshot.docs.forEach(item => ['students', 'transactions', 'rewards', 'purchaseRequests', 'achievementDefinitions', 'studentAchievements', 'seasons', 'leaderboard'].forEach(name => listen(`${item.id}:${name}`, fs.collection(db, 'classes', item.id, name))));
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  const generation = realtimeGeneration;
  refreshTimer = setTimeout(() => refresh().catch(error => {
    if (generation === realtimeGeneration && activeSession) console.error('Secure refresh failed', error);
  }), 100);
}

function listen(key, query) {
  if (wiredKeys.has(key)) return;
  wiredKeys.add(key);
  const generation = realtimeGeneration;
  unsubscribers.push(fs.onSnapshot(query, scheduleRefresh, error => {
    if (generation === realtimeGeneration && activeSession) console.error(`Secure listener ${key}`, error);
  }));
}

async function startRealtime(session, options = {}) {
  stopRealtime();
  activeSession = session;
  const generation = realtimeGeneration;
  if (session.role === 'teacher') await reconcileArchivedStudentCatalogs();
  if (options.listen === false) {
    await refresh();
    return;
  }
  if (session.role === 'teacher') {
    const classesQuery = fs.query(fs.collection(db, 'classes'), fs.where('teacherUid', '==', session.uid));
    listen('teacherProfile', teacherProfileRef(session.uid));
    if (!wiredKeys.has('classes')) {
      wiredKeys.add('classes');
      unsubscribers.push(fs.onSnapshot(classesQuery, () => { wireTeacherCollections(generation).then(scheduleRefresh).catch(error => {
        if (generation === realtimeGeneration && activeSession) console.error('Secure class listener', error);
      }); }, error => {
        if (generation === realtimeGeneration && activeSession) console.error('Secure listener classes', error);
      }));
    }
    await wireTeacherCollections(generation);
  } else {
    const bindingRef = fs.doc(db, 'studentBindings', session.uid);
    wiredKeys.add('binding');
    unsubscribers.push(fs.onSnapshot(bindingRef, snapshot => {
      if (!snapshot.exists()) {
        window.dispatchEvent(new CustomEvent('pirate-student-access-revoked'));
        return;
      }
      scheduleRefresh();
    }, () => window.dispatchEvent(new CustomEvent('pirate-student-access-revoked'))));
    const bindingSnapshot = await fs.getDoc(bindingRef);
    if (bindingSnapshot.exists()) {
      const binding = bindingSnapshot.data();
      listen('profile', studentRef(binding.classId, binding.studentId));
      listen('rewards', fs.query(fs.collection(db, 'classes', binding.classId, 'rewards'), fs.where('active', '==', true)));
      listen('requests', fs.query(fs.collection(db, 'classes', binding.classId, 'purchaseRequests'), fs.where('studentId', '==', binding.studentId)));
      listen('transactions', fs.query(fs.collection(db, 'classes', binding.classId, 'transactions'), fs.where('studentId', '==', binding.studentId)));
      listen('awards', fs.query(fs.collection(db, 'classes', binding.classId, 'studentAchievements'), fs.where('studentId', '==', binding.studentId)));
      listen('leaderboard', fs.collection(db, 'classes', binding.classId, 'leaderboard'));
    }
  }
  await refresh();
}

function stopRealtime() {
  realtimeGeneration++;
  activeSession = null;
  unsubscribers.forEach(unsubscribe => unsubscribe());
  unsubscribers = [];
  wiredKeys = new Set();
  clearTimeout(refreshTimer);
}

export function configure(options) {
  db = options.db;
  auth = options.auth;
  fs = options.storeModule;
  return api;
}

const api = {
  applyTeacherTransaction, applyTeacherTransactionsBulk, approvePurchase, archiveStudent, awardManualAchievement,
  awardManualAchievementBulk, createClass, createPurchaseRequest, createStudent, createStudentWithInvite,
  hideReward, refresh, rejectPurchase, saveManualAchievement, saveReward, saveTeacherProfile,
  startNewSeason, startRealtime, stopRealtime
};

export default api;
