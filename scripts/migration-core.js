'use strict';

const { AUTO_ACHIEVEMENTS } = require('../achievements.js');
const { SCHEMA_VERSION, getRank } = require('../economy.js');

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const stamp = value => value || new Date(0).toISOString();

function transformLegacyData(source, teacherUid = 'emulator-teacher') {
  const appData = source?.appData || source?.data || source || {};
  const writes = [];
  const discrepancies = [];
  const summary = { classes: 0, students: 0, transactions: 0, rewards: 0, requests: 0, purchases: 0, definitions: 0, awards: 0 };
  const put = (path, data) => writes.push({ path, data });

  for (const legacyClass of appData.classes || []) {
    const classId = String(legacyClass.id);
    const seasons = Array.isArray(legacyClass.seasons) ? legacyClass.seasons : [];
    const currentSeasonId = String(legacyClass.currentSeasonId || seasons.at(-1)?.id || `season-${classId}`);
    summary.classes++;
    put(`classes/${classId}`, { teacherUid, name: legacyClass.name || 'Класс', currentSeasonId, economyVersion: SCHEMA_VERSION, migratedAt: new Date().toISOString() });
    (seasons.length ? seasons : [{ id: currentSeasonId, startedAt: legacyClass.createdAt }]).forEach(season => put(`classes/${classId}/seasons/${season.id}`, {
      teacherUid, classId, status: String(season.id) === currentSeasonId ? 'active' : 'closed', startedAt: stamp(season.startedAt), endedAt: season.endedAt || null
    }));
    AUTO_ACHIEVEMENTS.forEach(definition => put(`classes/${classId}/automaticAchievementDefinitions/${definition.id}`, { ...definition, teacherUid, classId, type: 'automatic', fincoins: 0 }));

    const transactions = legacyClass.transactions || [];
    const rewards = legacyClass.rewards || [];
    const requests = legacyClass.requests || [];
    for (const transaction of transactions) {
      const transactionId = String(transaction.id || transaction.idempotencyKey || `legacy-txn-${summary.transactions}`);
      const studentId = String(transaction.studentId || transaction.student_id || '');
      put(`classes/${classId}/transactions/${transactionId}`, {
        ...transaction, teacherUid, classId, studentId, student_id: studentId,
        balanceDelta: number(transaction.balanceDelta ?? transaction.amount),
        lifetimeDelta: number(transaction.lifetimeDelta), idempotencyKey: transaction.idempotencyKey || transactionId,
        migratedAt: new Date().toISOString()
      });
      summary.transactions++;
    }
    rewards.forEach(reward => {
      const rewardId = String(reward.id);
      put(`classes/${classId}/rewards/${rewardId}`, { ...reward, teacherUid, classId, rewardId, legacyId: rewardId, price: number(reward.price), limit: Math.max(0, number(reward.limit)), active: reward.active !== false });
      summary.rewards++;
    });
    requests.forEach(request => {
      const requestId = String(request.id);
      const studentId = String(request.studentId || request.student_id);
      const rewardId = String(request.rewardId || request.reward_id);
      put(`classes/${classId}/purchaseRequests/${requestId}`, { ...request, teacherUid, classId, requestId, studentId, student_id: studentId, rewardId, reward_id: rewardId });
      summary.requests++;
      if (request.status === 'approved') {
        const matching = transactions.find(item => (item.studentId || item.student_id) === studentId && (item.idempotencyKey === `purchase:${requestId}` || item.idempotencyKey === `purchase_${requestId}`));
        if (matching) {
          put(`classes/${classId}/purchases/${requestId}`, { teacherUid, classId, purchaseId: requestId, requestId, studentId, rewardId, price: Math.abs(number(matching.balanceDelta ?? matching.amount)), purchasedAt: request.processedAt || matching.timestamp, migrated: true });
          summary.purchases++;
        } else discrepancies.push({ type: 'approved_request_without_purchase_transaction', classId, requestId });
      }
    });

    const manualDefinitions = legacyClass.achievements || [];
    manualDefinitions.forEach(definition => {
      const achievementId = String(definition.id);
      put(`classes/${classId}/achievementDefinitions/${achievementId}`, { ...definition, teacherUid, classId, achievementId, id: achievementId, type: 'manual', fincoins: Math.max(0, number(definition.fincoins)), active: definition.active !== false });
      summary.definitions++;
    });

    for (const student of legacyClass.students || []) {
      const studentId = String(student.id);
      const balance = number(student.balance ?? student.fincoins_balance);
      const positiveHistory = transactions.filter(item => String(item.studentId || item.student_id) === studentId).reduce((sum, item) => sum + Math.max(0, number(item.lifetimeDelta ?? item.amount)), 0);
      const lifetimeEarned = student.lifetimeEarned == null ? Math.max(balance, positiveHistory) : number(student.lifetimeEarned);
      if (student.lifetimeEarned == null) discrepancies.push({ type: 'inferred_lifetime_earned', classId, studentId, inferred: lifetimeEarned });
      const purchaseCount = transactions.filter(item => String(item.studentId || item.student_id) === studentId && (item.category === 'purchase' || String(item.description || '').startsWith('Покупка:'))).length;
      const profile = { teacherUid, classId, studentId, legacyId: studentId, displayName: student.name || student.displayName || 'Ученик', avatarId: student.avatarId || 'captain-boy', avatarSrc: student.avatarSrc || student.flag || 'student-avatar-captain-boy.webp', ownerUid: null, balance, lifetimeEarned, purchaseCount, purchaseCounts: {}, seasonId: student.seasonId || currentSeasonId, economyVersion: SCHEMA_VERSION, active: true, migratedAt: new Date().toISOString() };
      put(`classes/${classId}/students/${studentId}`, profile);
      put(`classes/${classId}/leaderboard/${studentId}`, { teacherUid, classId, studentId, displayName: profile.displayName, avatarId: profile.avatarId, avatarSrc: profile.avatarSrc, lifetimeEarned, rank: getRank(lifetimeEarned).name, migratedAt: new Date().toISOString() });
      summary.students++;

      const autoIds = new Set((student.achievements || []).filter(value => AUTO_ACHIEVEMENTS.some(item => item.id === value)));
      AUTO_ACHIEVEMENTS.filter(item => item.metric === 'lifetimeEarned' ? lifetimeEarned >= item.threshold : purchaseCount >= item.threshold).forEach(item => autoIds.add(item.id));
      autoIds.forEach(achievementId => { put(`classes/${classId}/studentAchievements/auto_${studentId}_${achievementId}`, { teacherUid, classId, studentId, achievementId, type: 'automatic', fincoins: 0, migratedAt: new Date().toISOString() }); summary.awards++; });

      const manualIds = new Set();
      (student.achievements || []).filter(value => typeof value === 'string' && value.startsWith('manual_')).forEach(value => manualIds.add(value.slice(7)));
      (student.awardedAchievements || []).forEach(value => value?.achievementId && manualIds.add(value.achievementId));
      manualDefinitions.forEach(value => (value.awarded_to || []).includes(studentId) && manualIds.add(value.id));
      manualIds.forEach(achievementId => {
        const snapshot = (student.awardedAchievements || []).find(value => value.achievementId === achievementId) || {};
        put(`classes/${classId}/studentAchievements/manual_${studentId}_${achievementId}`, { ...snapshot, teacherUid, classId, studentId, achievementId, type: 'manual', fincoins: number(snapshot.fincoinsSnapshot), migratedAt: new Date().toISOString() });
        summary.awards++;
      });
    }
  }
  return { writes, discrepancies, summary };
}

module.exports = { transformLegacyData };
