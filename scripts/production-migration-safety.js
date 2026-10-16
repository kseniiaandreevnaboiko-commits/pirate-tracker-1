'use strict';

const { createHash } = require('node:crypto');

const PRODUCTION_PROJECT_ID = 'tracker-progress-2b682';
const WRITE_CONFIRMATION = 'MIGRATE_TRACKERAPPS_MAIN_WITHOUT_DELETING_SOURCE';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stable(value[key]);
      return result;
    }, {});
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function verifyBackup(backup, expectedProjectId = PRODUCTION_PROJECT_ID) {
  if (backup?.format !== 'finzozh-legacy-backup-v1') throw new Error('Неверный формат резервной копии.');
  if (backup.projectId !== expectedProjectId) throw new Error(`Резервная копия относится к другому проекту: ${backup.projectId}.`);
  if (backup.sourcePath !== 'trackerApps/main') throw new Error('Неожиданный путь исходного документа.');
  if (!backup.source?.state || !Array.isArray(backup.source.state.classes)) throw new Error('В резервной копии нет state.classes.');
  if (sha256(backup.source) !== backup.sourceSha256) throw new Error('Контрольная сумма резервной копии не совпадает.');
  return true;
}

function assertProductionWrite({ projectId, confirmProject, sourceSha, confirmSourceSha, execute, envConfirmation }) {
  if (!execute) throw new Error('Запись требует флага --execute.');
  if (projectId !== PRODUCTION_PROJECT_ID || confirmProject !== PRODUCTION_PROJECT_ID) throw new Error('Project ID не подтверждён дважды.');
  if (!sourceSha || confirmSourceSha !== sourceSha) throw new Error('SHA-256 исходной копии не подтверждён.');
  if (envConfirmation !== WRITE_CONFIRMATION) throw new Error('Не задана точная переменная PIRATE_PRODUCTION_WRITE_CONFIRMATION.');
  return true;
}

module.exports = { PRODUCTION_PROJECT_ID, WRITE_CONFIRMATION, assertProductionWrite, sha256, stable, verifyBackup };
