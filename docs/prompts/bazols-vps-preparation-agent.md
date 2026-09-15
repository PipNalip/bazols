# Промпт для агента: подготовка Production VPS для Bazols

Скопируйте весь текст ниже в отдельную сессию агента, запущенного непосредственно на целевом Linux VPS.

---

Ты работаешь на Production VPS, предназначенном для Bazols Reporting. Подготовь сервер для будущего запуска приложения по спецификации ниже. Действуй как осторожный production-инженер: сначала собери доказательства, затем вноси только разрешённые изменения и проверяй реальный результат каждого шага.

## Цель

Подготовить один Linux VPS для Docker Compose deployment Bazols:

- Caddy принимает HTTPS на 80/443;
- `app`, `worker` и `migrate` используют один OCI image;
- PostgreSQL работает в отдельном контейнере без публичного порта;
- исходные credentials и ключи находятся только на VPS;
- GitHub deploy вызывает один ограниченный серверный entry point;
- сервер никогда не собирает image и не делает `git pull`;
- фактический Bazols deployment сейчас не выполняется.

Репозиторий: `PipNalip/bazols`
Будущий image: `ghcr.io/pipnalip/bazols@sha256:<digest>`
Полная локальная спецификация проекта: `docs/specs/bazols-delivery.md` — если файл доступен на сервере, прочитай его, но не клонируй публичный репозиторий только ради этого шага.

## Границы разрешения

Этот промпт разрешает:

- read-only аудит VPS;
- установку Docker Engine и Compose plugin из официального репозитория, если сервер поддерживается и Docker отсутствует;
- установку минимальных системных пакетов (`ca-certificates`, `curl`, `gnupg`, `jq`, `age`) через штатный package manager;
- создание отдельного системного пользователя/группы и `/opt/bazols`;
- создание root-owned шаблонов конфигурации, директорий, прав и безопасно сгенерированных локальных ключей;
- настройку log rotation для контейнеров через локальную Docker-конфигурацию только если она не конфликтует с существующей конфигурацией.

Этот промпт НЕ разрешает:

- разворачивать или запускать Bazols application image;
- менять DNS;
- публиковать image;
- менять SSH daemon config, SSH port или существующие authorized keys;
- включать/изменять firewall без отдельного подтверждения;
- удалять контейнеры, volumes, пользователей, файлы или существующие workloads;
- перезапускать Docker, если на сервере уже работают чужие контейнеры, без отдельного подтверждения;
- восстанавливать/удалять БД или backup;
- выводить или запрашивать секреты в чате;
- помещать deploy-пользователя в группу `docker`;
- использовать `curl | sh`, `--privileged`, Docker socket внутри контейнера или `StrictHostKeyChecking=no`.

Если возникает конфликт с существующим сервисом, нестандартная ОС, занятые 80/443, работающие контейнеры, нехватка ресурсов или риск потерять SSH-доступ — остановись и верни конкретный отчёт. Не исправляй такие конфликты самостоятельно.

## Переменные, которые пока считаются неизвестными

Не придумывай значения:

- `BAZOLS_DOMAIN`;
- SSH public key для GitHub deployment;
- GitHub Production reviewer/owner;
- GHCR read-only token для приватного package, если он понадобится;
- `SOURCE_SITE_URL`, `SOURCE_SITE_LOGIN`, `SOURCE_SITE_PASSWORD`;
- backup destination и `age` recipient.

Секреты пользователь должен вводить непосредственно на сервере или через защищённый secret mechanism. Никогда не проси отправить пароль/токен сообщением.

## Фаза 1 — обязательный read-only аудит

До любых изменений собери и кратко отчитай:

1. ОС, версия, архитектура и kernel.
2. CPU count, RAM, swap, размер/свободное место и filesystem для `/` и `/var/lib/docker`.
3. Текущий hostname и timezone; рекомендуемый системный timezone — UTC.
4. Наличие Docker Engine, Compose plugin, Caddy, nginx, Apache, PostgreSQL.
5. Все running containers только по имени/image/status/ports — без env и inspect секретов.
6. Кто слушает TCP 22, 80 и 443.
7. Состояние firewall (`ufw`, `nftables` или `firewalld`) без изменений.
8. Наличие unattended security updates без их включения.
9. Наличие `/opt/bazols`, пользователя `bazols-deploy`, конфликтующих UID/GID и systemd units.
10. Наличие активных systemd failures.
11. Возможность резолвить и подключаться по HTTPS к `ghcr.io` и исходному site host только если host уже задан локально; не выводи полный source URL/query.

Не читай `.env`, shell history, private keys, Docker container env или contents существующих БД. Не печатай IP/hostname в публичный отчёт, если канал не считается приватным; можешь обозначить их `[REDACTED]`.

### Условия остановки после аудита

Остановись и запроси решение, если:

- ОС не Ubuntu LTS/Debian stable или package manager неизвестен;
- архитектура не `amd64`/`arm64`;
- свободного диска меньше 15 GiB;
- RAM меньше 2 GiB;
- 80/443 уже заняты;
- Docker уже обслуживает существующие workloads;
- `/opt/bazols` содержит пользовательские данные;
- система сообщает degraded/failed storage/network units;
- изменение package repository или daemon config может повлиять на существующий runtime.

Если блокеров нет, продолжай подготовку.

## Фаза 2 — системная подготовка

### Docker

1. Если Docker отсутствует, установи Docker Engine и Compose plugin только по официальной инструкции Docker для обнаруженной ОС с keyring и подписанным apt repository.
2. Не используй convenience script.
3. Если Docker уже установлен и исправен, не переустанавливай и не обновляй его без необходимости.
4. Проверь `docker version`, `docker compose version` и запуск безопасного hello-world только если это не затрагивает существующий runtime.
5. Не добавляй обычных пользователей в группу `docker`.
6. Если `/etc/docker/daemon.json` отсутствует, создай минимальную log rotation конфигурацию (`json-file`, ограниченный размер и количество файлов). Если файл существует, сначала прочитай только несекретные настройки, подготовь diff и не перезапускай Docker без подтверждения.

### Пользователь и каталоги

Создай системного пользователя `bazols-deploy` без пароля. Не выдавай ему общий root и не добавляй в `docker` group.

Создай структуру:

```text
/opt/bazols/
  bin/
  secrets/
  state/
  backups/
  runtime/
```

Права:

- root владеет `bin`, `secrets` и production config;
- `secrets` и будущий `prod.env` доступны только root (`0700`/`0600`);
- deploy user может читать status и вызывать только будущие allowlisted sudo commands;
- backup directory не world-readable;
- никакого рекурсивного `chmod 777`.

Не создавай широкий sudo rule вроде `docker *`. Подготовь, но не активируй sudoers drop-in до появления финального `/opt/bazols/bin/deploy`. Будущий rule должен разрешать только точный root-owned executable, без shell-команд и wildcard subcommands.

### Секретный файл

Создай `/opt/bazols/secrets/prod.env` с mode `0600`, не выводя содержимое.

Можно безопасно сгенерировать и записать локально:

- PostgreSQL password;
- `SESSION_SECRET`;
- `RAW_DATA_ENCRYPTION_KEY` как 32 random bytes в base64.

Запиши placeholders, но не реальные значения, для:

- `BAZOLS_DOMAIN`;
- `SOURCE_SITE_URL`;
- `SOURCE_SITE_LOGIN`;
- `SOURCE_SITE_PASSWORD`;
- `BAZOLS_IMAGE`.

Сформируй `DATABASE_URL` из локально созданного PostgreSQL password без печати значения. Не сохраняй секреты в shell history: используй безопасный скрипт/temporary file с restrictive umask, затем удали временный файл штатным безопасным способом и проверь permissions. Не показывай checksums коротких паролей/токенов.

### GHCR

Не проси GHCR token в чате. Если package публичный, проверь, нужен ли login вообще. Если package приватный, дай оператору инструкцию выполнить `docker login ghcr.io` интерактивно с отдельным read-only package token. Не принимай token как аргумент командной строки и не печатай Docker auth config.

### Backup

1. Установи `age`, если доступен из штатного репозитория.
2. Не генерируй единственную recovery private key на VPS.
3. Оставь placeholder для `BACKUP_AGE_RECIPIENT`.
4. Создай root-owned backup directory и документируй, что backup нельзя считать готовым, пока не выбран off-host destination и не выполнен тест восстановления.

### Firewall и TLS

- Не меняй firewall в этой сессии.
- Отчитай текущие правила и подготовь минимальный предлагаемый diff: сохранить рабочий SSH доступ, разрешить 80/443, не открывать PostgreSQL или application port.
- Не запускай Caddy без `BAZOLS_DOMAIN` и корректного DNS.
- Не выпускай сертификат на временный/выдуманный domain.

## Фаза 3 — подготовить, но не активировать deployment boundary

Создай root-owned шаблоны с комментариями/placeholders:

- `/opt/bazols/compose.yaml.pending`;
- `/opt/bazols/Caddyfile.pending`;
- `/opt/bazols/bin/deploy.pending`;
- `/opt/bazols/bin/backup-postgres.pending`.

Они не должны запускаться и не должны содержать реальные секреты.

Требования к будущему deploy script:

1. `set -Eeuo pipefail` и exclusive lock.
2. Принимает ровно один аргумент вида `ghcr.io/pipnalip/bazols@sha256:<64 hex>`.
3. Никогда не принимает shell fragment, compose override или произвольную команду.
4. Проверяет disk space и текущий runtime.
5. Pull точного digest.
6. Запускает preflight target image.
7. Создаёт и проверяет encrypted PostgreSQL backup.
8. Сохраняет current/previous image atomically.
9. Запускает one-shot migration из target image.
10. Recreate `app` и `worker` из одного digest.
11. Проверяет Compose health, HTTPS `/health/live` и `/health/ready` с timeout.
12. При application health failure возвращает предыдущий image для app/worker.
13. Никогда автоматически не восстанавливает БД.
14. Пишет безопасный журнал без env, credentials, URL query и response bodies.

Не создавай production-ready executable из неполного шаблона приложения. Финальный script должен прийти из проверенного репозитория и пройти тесты до активации.

## Фаза 4 — проверка результата

Проверь и сообщи реальные результаты:

- Docker Engine/Compose доступны либо назван точный blocker;
- `bazols-deploy` не входит в docker group и не имеет широкого sudo;
- `/opt/bazols` имеет ожидаемую структуру и владельцев;
- `prod.env` существует, mode `0600`, но содержимое не выводится;
- placeholders перечислены только по именам;
- 80/443 не были открыты/закрыты этой сессией;
- Docker containers Bazols не запущены;
- application image не загружен и не deployed;
- pending templates не executable;
- текущие риски и действия пользователя перечислены отдельно.

## Формат финального отчёта

```text
RESULT: READY | PARTIALLY_READY | BLOCKED

Read-only audit:
- OS/arch:
- CPU/RAM/disk:
- Existing Docker/workloads:
- Ports 22/80/443:
- Firewall:

Changes actually made:
- ...

Verification actually run:
- command/category → result

Not done by design:
- no Bazols deployment
- no DNS changes
- no firewall changes
- no database restore/delete

User input still required:
- domain/DNS
- deployment SSH public key
- source credentials entered locally
- GHCR read access if needed
- age recipient and off-host backup destination
- explicit approval to activate firewall/TLS/deploy

Blockers/risks:
- ...
```

Не называй сервер готовым к Production, если backup restore не проверен, domain/DNS не заданы, health checks приложения ещё не существуют или deploy script остаётся pending.

---
