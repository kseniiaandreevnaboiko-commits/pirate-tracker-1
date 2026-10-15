# Локальная проверка защищённой авторизации

Контур ТЗ № 4А работает только с Firebase demo project `demo-pirate-auth`. Режим
включается только на `localhost`/`127.0.0.1` и только с параметром
`?emulator=1`. Production-конфигурация `firebase-sync.js` в этом режиме не
загружается.

## Подготовка на Windows

Нужны Node.js, Firebase CLI и JDK 21. Для текущего рабочего места JDK установлен
в `%LOCALAPPDATA%\pirate-emulator-tools\jdk-21.0.12.1+1`. Из-за кириллицы в пути
Firebase CLI используется локальная junction-ссылка:

```powershell
New-Item -ItemType Directory -Path .tools -Force
New-Item -ItemType Junction -Path .tools\jdk-21 -Target "$env:LOCALAPPDATA\pirate-emulator-tools\jdk-21.0.12.1+1"
npm.cmd install
```

Каталог `.tools` и данные эмуляторов не входят в Git.

## Запуск

```powershell
npm.cmd run emulators
```

Приложение: `http://127.0.0.1:5000/?emulator=1`

Emulator UI: `http://127.0.0.1:4000/`

## Явное создание первого тестового учителя

Приложение не создаёт учителя и не назначает роль автоматически. В отдельном
окне PowerShell, пока эмуляторы запущены:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
$env:PIRATE_TEACHER_EMAIL='teacher@example.test'
$env:PIRATE_TEACHER_PASSWORD='change-this-test-password'
npm.cmd run seed:teacher
```

Скрипт отказывается работать без обеих переменных хостов эмуляторов.

## Тесты

```powershell
npm.cmd test
npm.cmd run test:emulators
```

Вторая команда сама запускает чистые Auth и Firestore emulators, выполняет
тесты и завершает их. Она не использует реальные данные и не публикует rules.

## Ручной UI-сценарий

1. Войти тестовым email/паролем учителя.
2. Открыть «Доступ учеников», создать класс и ученика.
3. Открыть ссылку или QR-код приглашения в другом профиле браузера.
4. Убедиться, что кабинет ученика открывается повторно после перезагрузки.
5. Перевыпустить приглашение учителем и убедиться, что старое устройство и
   старый код больше не дают доступ.
6. Проверить восстановление пароля по ссылке, которую печатает Auth emulator,
   и смену пароля в панели учителя.
