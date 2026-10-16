(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PirateEconomy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const SCHEMA_VERSION = 2;
  const RANKS = [
    { min: 0, max: 49, name: 'Юнга', emoji: '🐚' },
    { min: 50, max: 119, name: 'Матрос', emoji: '⛵' },
    { min: 120, max: 219, name: 'Боцман', emoji: '🧭' },
    { min: 220, max: 339, name: 'Капитан', emoji: '🏴‍☠️' },
    { min: 340, max: 569, name: 'Адмирал', emoji: '⚓' },
    { min: 570, max: Infinity, name: 'Король пиратов', emoji: '👑' }
  ];

  const numberOr = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const nonNegative = value => Math.max(0, numberOr(value));

  function getBalance(student) {
    if (!student) return 0;
    return nonNegative(student.balance !== undefined ? student.balance : student.fincoins_balance);
  }

  function getLifetimeEarned(student) {
    return nonNegative(student?.lifetimeEarned);
  }

  function setBalance(student, value) {
    const balance = nonNegative(value);
    student.balance = balance;
    // Compatibility for older UI/data readers. `balance` is the canonical field.
    student.fincoins_balance = balance;
    return balance;
  }

  function setLifetimeEarned(student, value) {
    student.lifetimeEarned = nonNegative(value);
    return student.lifetimeEarned;
  }

  function getRank(lifetimeEarned) {
    const earned = nonNegative(lifetimeEarned);
    for (let i = RANKS.length - 1; i >= 0; i--) {
      if (earned >= RANKS[i].min) return RANKS[i];
    }
    return RANKS[0];
  }

  function getNextRank(lifetimeEarned) {
    const earned = nonNegative(lifetimeEarned);
    return RANKS.find(rank => earned < rank.min) || null;
  }

  function getProgressPercent(lifetimeEarned) {
    const earned = nonNegative(lifetimeEarned);
    const current = getRank(earned);
    const next = getNextRank(earned);
    if (!next) return 100;
    return Math.min(100, Math.max(0, Math.round(((earned - current.min) / (next.min - current.min)) * 100)));
  }

  function deriveLifetimeEarned(transactions, studentId) {
    return Math.max(0, (transactions || [])
      .filter(transaction => transaction.student_id === studentId)
      .reduce((total, transaction) => {
        if (Number.isFinite(Number(transaction.lifetimeDelta))) return total + Number(transaction.lifetimeDelta);
        const amount = numberOr(transaction.amount);
        return total + (amount > 0 ? amount : 0);
      }, 0));
  }

  function getLegacyReconciliation(transactions, studentId, balance) {
    const studentTransactions = (transactions || []).filter(transaction => transaction.student_id === studentId);
    const netBalance = studentTransactions.reduce((total, transaction) => total + numberOr(transaction.balanceDelta, numberOr(transaction.amount)), 0);
    return {
      netBalance,
      estimatedLifetimeEarned: deriveLifetimeEarned(studentTransactions, studentId),
      isReconciled: Math.abs(netBalance - balance) < 0.0001
    };
  }

  function migrateStudent(student, transactions, seasonId) {
    let changed = false;
    const legacyBalance = getBalance(student);
    if (student.balance !== legacyBalance || student.fincoins_balance !== legacyBalance) {
      setBalance(student, legacyBalance);
      changed = true;
    }
    if (!Number.isFinite(Number(student.lifetimeEarned))) {
      const reconciliation = getLegacyReconciliation(transactions, student.id, legacyBalance);
      student.lifetimeEarned = reconciliation.isReconciled ? reconciliation.estimatedLifetimeEarned : 0;
      student.economyMigration = {
        version: SCHEMA_VERSION,
        source: reconciliation.isReconciled ? 'reconciled_positive_transactions' : 'unresolved_legacy_history',
        seasonScope: 'legacy-unscoped',
        needsReview: !reconciliation.isReconciled,
        legacyBalance,
        transactionNetBalance: reconciliation.netBalance,
        suggestedLifetimeEarned: reconciliation.estimatedLifetimeEarned
      };
      changed = true;
    } else if (student.lifetimeEarned < 0) {
      student.lifetimeEarned = 0;
      changed = true;
    }
    if (student.economyVersion !== SCHEMA_VERSION) {
      student.economyVersion = SCHEMA_VERSION;
      changed = true;
    }
    if (!student.seasonId) {
      student.seasonId = seasonId;
      changed = true;
    }
    return changed;
  }

  function migrateData(data) {
    let changed = false;
    (data?.classes || []).forEach(cls => {
      if (!Array.isArray(cls.transactions)) { cls.transactions = []; changed = true; }
      if (!Array.isArray(cls.seasons)) { cls.seasons = []; changed = true; }
      if (!cls.currentSeasonId) {
        cls.currentSeasonId = `season_legacy_${cls.id || 'class'}`;
        changed = true;
      }
      if (!cls.seasons.some(season => season.id === cls.currentSeasonId)) {
        cls.seasons.push({
          id: cls.currentSeasonId,
          startedAt: cls.createdAt || null,
          migrationStatus: 'legacy-unscoped'
        });
        changed = true;
      }
      (cls.students || []).forEach(student => {
        if (migrateStudent(student, cls.transactions, cls.currentSeasonId)) changed = true;
      });
      if (cls.economyVersion !== SCHEMA_VERSION) {
        cls.economyVersion = SCHEMA_VERSION;
        changed = true;
      }
    });
    return changed;
  }

  function applyTransaction(student, cls, input) {
    if (!student || !cls) return { ok: false, reason: 'missing-target' };
    if (!Array.isArray(cls.transactions)) cls.transactions = [];
    const idempotencyKey = input.idempotencyKey || null;
    if (idempotencyKey) {
      const existing = cls.transactions.find(transaction => transaction.idempotencyKey === idempotencyKey);
      if (existing) return { ok: true, duplicate: true, transaction: existing };
    }
    migrateStudent(student, cls.transactions, cls.currentSeasonId || null);
    const balanceDelta = numberOr(input.balanceDelta);
    const lifetimeDelta = numberOr(input.lifetimeDelta);
    const nextBalance = getBalance(student) + balanceDelta;
    if (nextBalance < 0) return { ok: false, reason: 'insufficient-balance' };
    setBalance(student, nextBalance);
    setLifetimeEarned(student, getLifetimeEarned(student) + lifetimeDelta);
    const transaction = {
      id: input.id,
      student_id: student.id,
      amount: balanceDelta,
      balanceDelta,
      lifetimeDelta,
      type: balanceDelta === 0 && lifetimeDelta !== 0 ? 'correction' : balanceDelta >= 0 ? 'income' : 'expense',
      category: input.category || (lifetimeDelta > 0 ? 'earning' : 'balance_correction'),
      description: input.description || (balanceDelta >= 0 ? 'Начисление' : 'Списание'),
      timestamp: input.timestamp,
      seasonId: cls.currentSeasonId || null
    };
    if (idempotencyKey) transaction.idempotencyKey = idempotencyKey;
    cls.transactions.push(transaction);
    if (transaction.category === 'lifetime_correction' && student.economyMigration) {
      student.economyMigration.needsReview = false;
      student.economyMigration.resolvedAt = input.timestamp;
      student.economyMigration.resolution = 'teacher_lifetime_correction';
    }
    return { ok: true, duplicate: false, transaction };
  }

  function startNewSeason(cls, seasonId, timestamp) {
    if (!cls || !seasonId) return { ok: false, reason: 'missing-target' };
    if (!Array.isArray(cls.seasons)) cls.seasons = [];
    const currentSeason = cls.seasons.find(season => season.id === cls.currentSeasonId);
    if (currentSeason && !currentSeason.endedAt) {
      currentSeason.endedAt = timestamp;
      currentSeason.studentSummary = (cls.students || []).map(student => ({
        studentId: student.id,
        balance: getBalance(student),
        lifetimeEarned: getLifetimeEarned(student),
        rank: getRank(getLifetimeEarned(student)).name
      }));
    }
    cls.seasons.push({ id: seasonId, startedAt: timestamp });
    cls.currentSeasonId = seasonId;
    (cls.students || []).forEach(student => {
      setBalance(student, 0);
      setLifetimeEarned(student, 0);
      student.seasonId = seasonId;
      delete student.economyMigration;
    });
    return { ok: true, seasonId };
  }

  return {
    SCHEMA_VERSION,
    RANKS,
    getBalance,
    getLifetimeEarned,
    setBalance,
    setLifetimeEarned,
    getRank,
    getNextRank,
    getProgressPercent,
    deriveLifetimeEarned,
    getLegacyReconciliation,
    migrateStudent,
    migrateData,
    applyTransaction,
    startNewSeason
  };
});
