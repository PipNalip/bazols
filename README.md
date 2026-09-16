# Bazols

Внутренняя система отчётности ресторанов: API и web-интерфейс для отчётов по сотрудникам и товарам. Репозиторий развивается как TypeScript npm-workspace с NestJS API, React/MUI frontend и общими runtime-контрактами.

Сейчас реализованы health-срез, безопасная интеграция с источником, DB-backed очередь и worker, ручной admin-only sync API, Argon2id login с server-side sessions/CSRF, роли и администрирование менеджеров и ресторанов. Raw responses шифруются до записи, а полный импорт нормализованных данных атомарен и идемпотентен. Reports API считает рейтинги сотрудников и товаров, а React/MUI frontend поддерживает login/session, выбор ресторана и периода, сортировки, обе вкладки и обязательные состояния ошибок. Production не развёрнут. Оставшиеся функции и инфраструктурные задачи перечислены в `docs/backlog.md` и спецификациях `docs/specs/`.

## Локальный запуск

Требуется Node.js 22 или новее.

```sh
npm install --include=dev
cp .env.example .env
# Замените одинаковым локальным паролем значение
# replace-with-a-local-database-password в POSTGRES_PASSWORD и DATABASE_URL.
# Сгенерируйте отдельные секреты и вставьте их в .env:
#   openssl rand -hex 32      # SESSION_SECRET
#   openssl rand -base64 32   # RAW_DATA_ENCRYPTION_KEY
# Замените остальные значения replace-with-*.
npm run db:up
npm run db:migrate
npm run build
npm run start --workspace @bazols/api
```

API будет доступен по `http://127.0.0.1:8000`; live-check — `/health/live`.

В отдельном процессе запустите worker:

```sh
npm run start:worker --workspace @bazols/api
```

Первого администратора создайте после миграций. Пароль читается только из stdin и не выводится:

```sh
read -rsp 'Temporary admin password: ' BAZOLS_ADMIN_PASSWORD; echo
printf '%s' "$BAZOLS_ADMIN_PASSWORD" | npm run create-admin --workspace @bazols/api -- admin
unset BAZOLS_ADMIN_PASSWORD
```

`APP_ORIGIN` в `.env` должен точно совпадать с origin браузерного frontend. В Production допускается только HTTPS origin; session cookie автоматически получает `Secure`.

Основные реализованные API-маршруты:

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`;
- `POST /api/sync-runs`, `GET /api/sync-runs`, `GET /api/sync-runs/:id`;
- `GET /api/source-discovery`;
- `GET|POST /api/restaurants`, `PATCH /api/restaurants/:id`;
- `GET /api/restaurants/:id/reports/employees`, `GET /api/restaurants/:id/reports/products`;
- `GET|POST /api/users`, `POST /api/users/:id/block`, `POST /api/users/:id/reset-password`, `PUT /api/users/:id/restaurants`.

Все state-changing запросы после login требуют session cookie, точный `Origin` и `X-CSRF-Token` из login/`GET /api/auth/me`.

Frontend для разработки запускается отдельно:

```sh
npm run dev --workspace @bazols/web
```

Локальная PostgreSQL слушает только `127.0.0.1`. Остановить контейнер можно командой `npm run db:down`; именованный volume с данными при этом сохраняется.

## Проверка приложения

```sh
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

`npm run test:e2e` собирает workspaces, запускает реальные NestJS и Vite entry points и проверяет Chromium-сценарий login → период → обе вкладки → смена метрики. Нужны запущенная локальная PostgreSQL и применённые миграции (`npm run db:up && npm run db:migrate`); тест создаёт и удаляет только собственную синтетическую fixture.

## Что внутри

- `.cursor/rules/` — постоянные правила работы в Cursor;
- `.cursor/skills/` — процедуры для отдельных задач;
- `.cursor/commands/` — команды `/checkpoint`, `/check`, `/explain`, `/release`;
- `.agents/skills/` — семь процедур и четыре эквивалента команд для Hermes;
- `AGENTS.md` — общие правила, включая цикл разработки и ограничения безопасности, которые Hermes загружает при старте;
- `CLAUDE.md` — мост к `AGENTS.md` для Claude Code;
- `.gitignore`, `.cursorignore`, `.dockerignore` и permissions — защита от случайной публикации секретов;
- `scripts/validate-template.sh` — самопроверка без установки зависимостей.

## Для кого

Шаблон рассчитан на человека, который описывает продукт обычными словами, а инженерную дисциплину поручает агенту. В Cursor работают его rules, skills и commands. В Hermes работают `AGENTS.md` и навыки из `.agents/skills/` после подключения проекта. Другие агенты получают общий контракт через `AGENTS.md`; поддержку остального следует проверить в конкретном клиенте.

## Как использовать

### Новый проект

1. Скопируйте содержимое репозитория в пустую папку проекта.
2. Выберите стек вместе с агентом.
3. Запишите точные команды установки, запуска, тестов и линтера в секцию `Commands` файла `AGENTS.md`.
4. Создайте локальный `.env` из `.env.example`, если приложению нужны настройки.
5. Запустите `sh scripts/validate-template.sh`.

### Hermes Agent

Запускайте Hermes из корня проекта, чтобы он загрузил `AGENTS.md`. Наличие `AGENTS.md` означает, что Hermes не загружит `.cursor/rules/*.mdc` как отдельные правила; важные общие правила уже перенесены в `AGENTS.md`. Модель Codex выбирается в конфигурации Hermes и не меняет этот порядок.

Актуальный Hermes ищет навыки в `.agents/skills/` внутри Git-проекта. Первый раз выполните `hermes skills trust` в папке проекта, затем начните новую сессию и проверьте список через `hermes skills list` или `/skills`. Навыки `check`, `checkpoint`, `explain` и `release` доступны как `/check`, `/checkpoint`, `/explain` и `/release`. Доверяйте только репозиторию, содержимое которого вы проверили. [Правила загрузки файлов](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files) и [проектные навыки](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) описаны в документации Hermes.

В Hermes v0.18.2 команды `skills trust` ещё нет. Для этой версии откройте профиль через `hermes config edit` и добавьте папку проекта в раздел `skills.external_dirs` (используйте свой абсолютный путь):

```yaml
skills:
  external_dirs:
    - <project-path>/.agents/skills
```

После сохранения начните новую сессию и проверьте `hermes skills list`. Если профиль уже содержит раздел `skills`, добавьте только `external_dirs` в него, не создавая второй раздел. Такой путь подключает навыки к профилю, поэтому они могут быть видны и вне проекта; при поддержке проектных навыков используйте `hermes skills trust` вместо этого обходного пути. Если папка проекта ещё не является Git-репозиторием, актуальное автоматическое обнаружение проектных навыков также не сработает.

Когда меняете процедуру или команду Cursor, обновите и соответствующий `SKILL.md` в `.agents/skills/`. Самопроверка сравнивает их содержимое и обнаруживает расхождение.

### Существующий проект

Не копируйте папку поверх проекта вслепую. Переносите файлы по одному, объединяя существующие `AGENTS.md`, `.gitignore`, `.dockerignore` и agent settings. Существующие проектные правила важнее шаблонных.

## Безопасность

Шаблон снижает риск, но не является security boundary. Ignore-файлы не заменяют ротацию утёкшего ключа, проверку Git diff и реальные права доступа. Настоящие секреты никогда не должны попадать в Git, сообщения агенту или публичные артефакты.

`.cursor/permissions.json` направляет классификатор только в режиме Cursor Auto-review. Это не запрет на уровне операционной системы и не конфигурация Cursor CLI: у CLI отдельная система разрешений. Проверьте выбранный Run Mode в настройках Cursor перед работой.

Hermes не применяет `.cursor/permissions.json` и `.cursorignore`. Его разрешения и выбор локального или изолированного терминала задаются в профиле Hermes; [настройки approvals и terminal backend](https://hermes-agent.nousresearch.com/docs/user-guide/configuration) описаны отдельно. Правило не показывать секреты есть в `AGENTS.md`, но ignore-файлы и текстовые инструкции не заменяют реальные права доступа. `.gitignore` продолжает действовать для Git, а `.dockerignore` — для Docker.

## Проверка исходного template-контракта

```sh
sh scripts/validate-template.sh
sh tests/test-template.sh
```

## Что ещё не включено

- универсальный Dockerfile;
- CI/CD и deployment scripts;
- настройки конкретной Jira, GitHub, GitLab или облака;
- автоматический push или публикация.

Эти части добавляются по утверждённым спецификациям. Production deployment выполняется вручную с доверенной рабочей станции; GitHub не получает доступ в tailnet.

## Лицензия

MIT — см. `LICENSE`.
