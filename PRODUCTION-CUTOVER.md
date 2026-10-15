# Безопасное обновление существующего «ФинЗОЖ»

Этот план относится к существующему Firebase-проекту `tracker-progress-2b682` и прежней ссылке GitHub Pages. Второй сайт и вторая база не создаются. Ни одна команда из раздела переключения не должна выполняться без отдельного подтверждения владельца.

## Что уже подготовлено

- Production-клиент использует `tracker-progress-2b682`; `?emulator=1` действует только на `localhost` и `127.0.0.1`.
- Один и тот же интерфейс работает с защищённой структурой в Emulator и production.
- `firebase-sync.js` и PIN-вход не загружаются в защищённом режиме.
- `/trackerApps/main` остаётся источником резервной копии и не удаляется.
- Инструмент миграции по умолчанию выполняет только backup, dry-run или read-only verify.
- Production-запись требует `--execute`, двойного указания project ID, точного SHA-256 копии и отдельной переменной подтверждения.

## 1. Предварительная проверка

1. Зафиксировать commit-кандидат и прежний production commit `b86982c9649e47c5c20b358c4b69bb24b1252913`.
2. Убедиться, что Email/Password и Anonymous включены в Firebase Authentication.
3. В Auth скопировать UID существующей учительской учётной записи.
4. Проверить, что `/authorizedTeachers/{uid}` существует и содержит `active: true`.
5. Добавить текущий домен GitHub Pages в Authentication → Authorized domains.
6. Выполнить `npm.cmd run test:emulators` и ручной чек-лист из `TZ4V-STAGE1-REPORT.md`.

## 2. Резервная копия — только чтение

Используются Application Default Credentials учётной записи, которой разрешено читать Firestore. Файлы `backups/` игнорируются Git и должны храниться зашифрованно.

```powershell
gcloud auth application-default login
npm.cmd run data:backup -- --project=tracker-progress-2b682 --teacher-uid=<UID> --output=backups\before-cutover.json
```

Проверить в выводе:

- `projectId = tracker-progress-2b682`;
- `teacher.roleExists = true`, `teacher.active = true`;
- сохранён `sourceSha256`;
- JSON открывается и содержит `source.state.classes`.

После этого восстановить копию в чистом Emulator и сравнить классы, учеников, баланс, общий заработок, историю, товары, заявки, покупки, достижения, сезоны и старые ID.

## 3. Dry-run миграции

```powershell
npm.cmd run data:plan -- --project=tracker-progress-2b682 --input=backups\before-cutover.json --output=migration-plans\cutover-plan.json
```

Команда не подключается к Firebase и ничего не записывает. До продолжения:

1. `discrepancies` должен быть пуст или каждое расхождение должно быть письменно разобрано.
2. Сверить агрегаты плана с резервной копией.
3. Сохранить `sourceSha256` и `planSha256` в протоколе перехода.
4. Не редактировать backup или plan вручную: контрольная сумма перестанет совпадать.

## 4. Согласованное переключение

Между закрытием старого документа новыми Rules и публикацией новой страницы возможен короткий перерыв, поэтому действия выполняются в объявленное окно обслуживания.

1. Попросить пользователей закрыть приложение; повторить read-only backup и dry-run.
2. Выполнить миграцию нормализованных коллекций. Она создаёт только отсутствующие документы, прекращает работу при конфликте и не удаляет `/trackerApps/main`.
3. Выполнить read-only verify.
4. Опубликовать новые Firestore Rules.
5. Сразу опубликовать тот же repository/branch в прежний GitHub Pages site — URL не менять.
6. Проверить учительский вход, класс, баланс, достижения, магазин, заявку ученика и рейтинг.

Команда применения формируется только после отдельного подтверждения:

```powershell
$env:PIRATE_PRODUCTION_WRITE_CONFIRMATION='MIGRATE_TRACKERAPPS_MAIN_WITHOUT_DELETING_SOURCE'
npm.cmd run data:apply -- --project=tracker-progress-2b682 --confirm-project=tracker-progress-2b682 --input=migration-plans\cutover-plan.json --confirm-source-sha=<SOURCE_SHA256> --execute
Remove-Item Env:PIRATE_PRODUCTION_WRITE_CONFIRMATION
npm.cmd run data:verify -- --project=tracker-progress-2b682 --input=migration-plans\cutover-plan.json
```

Rules публикуются отдельно и только после успешного verify:

```powershell
firebase deploy --only firestore:rules --project tracker-progress-2b682
```

GitHub Pages должен использовать тот же репозиторий и прежний publishing source. Никакой новый сайт не создаётся.

## 5. Откат

Миграция не удаляет и не изменяет `/trackerApps/main`, поэтому исходные данные остаются доступными для аварийного возврата.

1. Остановить работу пользователей и сохранить диагностическую копию новых коллекций.
2. Вернуть GitHub Pages на commit `b86982c9649e47c5c20b358c4b69bb24b1252913` либо последний подтверждённый production tag.
3. Вернуть прежнюю версию Firestore Rules из того же подтверждённого commit. Это временно восстанавливает старую модель доступа и её известные риски, поэтому откат должен быть коротким.
4. Проверить, что прежнее приложение читает неизменённый `/trackerApps/main`.
5. Не удалять нормализованные коллекции: они нужны для диагностики и повторного безопасного запуска.
6. Сравнить production с backup по SHA-256 и агрегатам перед любым восстановлением данных.

Отмена Firestore import или частично выполненной пакетной записи сама по себе не возвращает прежнее состояние. Поэтому инструмент применяет только операции создания, останавливается на конфликтах и сохраняет legacy-документ.

## 6. Критерии готовности к публикации

- все emulator-тесты проходят;
- ручная визуальная проверка пройдена на 1440, 1024, 768 и 390 px;
- backup восстановлен в Emulator и сверен;
- dry-run не содержит необъяснённых расхождений;
- UID учителя и `/authorizedTeachers/{uid}` проверены;
- домен GitHub Pages разрешён в Firebase Auth;
- назначены окно обслуживания, исполнитель Rules, исполнитель Pages и ответственный за откат;
- владелец отдельно подтвердил production backup, migration apply, Rules deploy и Pages deploy.
