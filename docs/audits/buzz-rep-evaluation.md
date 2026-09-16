# Оценка альтернативной реализации `buzz_rep`

Дата проверки: 2026-09-16

## Краткий вывод

`buzz_rep` — не альтернативная реализация всего Bazols, а функционально богатый локальный ETL/аналитический профиль для одного оператора: Python CLI + cron-скрипты + browser-auth + SQLite + Markdown/XLSX-отчёты и уведомления.

Главное достоинство — глубина предметной аналитики: выручка, заказы, стопы, закупки, себестоимость, остатки, ABC, техкарты, продуктовая экономика, драйверы изменения себестоимости и алерты. Главное ограничение — это не многопользовательский продукт: нет web-интерфейса, API для пользователей, RBAC, управления ресторанами, серверной очереди и рассчитанной на горизонтальное масштабирование БД.

Вердикт: **не заменять текущий Bazols этой системой**. Использовать её как источник проверенных формул, контрактов, тестов и отчётной логики, перенося выбранные части в текущую архитектуру NestJS/PostgreSQL/worker. Не переносить профиль Hermes, локальную SQLite, browser-state, доставку и секреты как основу production-системы.

## Что фактически реализовано

| Область | Статус | Доказательство |
| --- | --- | --- |
| CLI для sync/report/status | Реализовано | `src/buzzolls_reporting/cli.py:86-127`, `src/buzzolls_reporting/cli.py:187-215` |
| Read-only firewall по registry/risk/method/path | Реализовано | `src/buzzolls_reporting/security.py:17-19`, `src/buzzolls_reporting/security.py:45-75` |
| Browser-auth и выбор роли | Реализовано, но привязано к UI источника | `src/buzzolls_reporting/session.py:188-213`, `src/buzzolls_reporting/roles.py:74-94` |
| Валидация сессии и schema drift | Реализовано | `src/buzzolls_reporting/client.py:98-168` |
| Raw archive и sanitization | Реализовано без шифрования | `src/buzzolls_reporting/storage.py:91-132` |
| SQLite persistence и миграции | Реализовано | `src/buzzolls_reporting/storage.py:135-211`, `migrations/001_initial.sql` |
| Заказы, выручка, стопы | Реализовано | `src/buzzolls_reporting/pipelines.py:122-212` |
| Закупки, себестоимость, остатки | Реализовано | `src/buzzolls_reporting/pipelines.py:229-281` |
| ABC | Реализовано | `src/buzzolls_reporting/pipelines.py:283-300` |
| Техкарты и продуктовая экономика Level 2 | Реализовано частично | `PROJECT_STATE.md:94-125`; PF-рекурсия и сеты имеют частичное покрытие |
| Драйверы себестоимости | Реализовано | `src/buzzolls_reporting/product_economics.py:880-1294` |
| Markdown/XLSX отчёты | Реализовано | `src/buzzolls_reporting/reports.py:19-78`, `src/buzzolls_reporting/economics_report.py` |
| Мониторинг закупочных цен и dedup | Реализовано | `src/buzzolls_reporting/monitoring.py:103-267` |
| MAX + Telegram fallback | Реализовано отдельным скриптовым контуром | `src/buzzolls_reporting/purchase_alerts.py:246-307` |
| Web UI / пользовательский API / RBAC | Нет | CLI является единственной продуктовой точкой входа; `pyproject.toml:16-17` |
| Мультиресторанность как продукт | Нет | runtime выбирает фиксированный `manager_tradepoint`; `src/buzzolls_reporting/pipelines.py:71-79` |
| CI/CD, Docker, lint/type gates | Нет | в архиве отсутствуют Dockerfile, compose, `.github/workflows`, ruff/mypy/pre-commit |

## Что в реализации хорошо

1. **Сильная предметная модель и необычно глубокое покрытие тестами.** В исходниках около 7 тыс. строк, в тестах около 6,1 тыс. строк. Есть тесты для идемпотентности, миграций, сверки выручки, temporal pricing, рекурсии ПФ, unit conversion, freshness, dedup и fallback-доставки.
2. **Fail-closed подход к интеграции.** Небезопасные risk classes и write-like routes блокируются до запроса (`security.py:45-75`), HTTP 200 не считается достаточным признаком валидной сессии (`client.py:101-112`), breaking schema drift останавливает нормализацию (`client.py:120-156`).
3. **Детерминированность.** Регулярные расчёты не требуют LLM; события получают стабильные SHA-идентификаторы (`monitoring.py:103-117`), повторная доставка защищена ключами digest.
4. **Хорошая финансовая семантика.** Official COGS отделён от Level 2, упаковка отделена от сырья, future-price leakage проверяется, а неполное покрытие не маскируется под точный результат.
5. **Прозрачная операционная телеметрия.** Runs, endpoint runs, schema fingerprints, retries, role/unit, reconciliation и health сохраняются отдельно (`migrations/001_initial.sql:13-60`).
6. **Полезные готовые активы для переноса.** Наиболее ценны алгоритмы `product_economics`, `price_reliability`, `reconciliation`, нормализаторы, schema contracts и соответствующие тестовые сценарии.

## Что плохо или рискованно

### Критично

1. **Архив содержит секреты и runtime state.** Внутри есть `.env`, backup `.env`, `auth.json`, session/runtime state и несколько рабочих SQLite DB. Эти файлы имеют права `0644`. Значения не читались. Внутренний `.gitignore` защищает `.env`, но не покрывает backup `.env`, `auth.json`, `state.db`, `projects.db`, `sessions/` и `verification_evidence.db` (`.gitignore:1-24`). Архив нельзя коммитить или передавать. Если он выходил за пределы доверенной машины, credentials следует отозвать и заменить.
2. **Чистое развёртывание невоспроизводимо.** `pyproject.toml` объявляет пустой список runtime dependencies (`pyproject.toml:5-14`), хотя код и тесты используют `openpyxl`, а browser runtime — Playwright. `requirements.txt` содержит только Playwright. Вложенный Windows venv после переноса не запускается, поскольку привязан к отсутствующему локальному Python.
3. **Проект не самодостаточен.** Canonical KB находится вне архива (`README.md:15-17`, `knowledge.py:81-95`). В `.env` остались Windows-пути. Из-за отсутствующей KB полный suite в текущем окружении дал **376 passed, 30 failed, 1 error**. Большинство падений связано с внешним KB/Windows paths; два CLI-теста проходят отдельно, но падают в полном suite, что дополнительно показывает зависимость тестов от порядка/общего process environment.
4. **Секреты Telegram извлекаются regex-поиском из другого Python-скрипта** (`purchase_alerts.py:278-288`). Это хрупкий и небезопасный способ управления credentials.

### Высокий риск

5. **Нет продуктовой security boundary.** Это локальный профиль без login/RBAC/API isolation. Raw JSON санитизируется, но не шифруется на диске (`storage.py:91-132`). Текущий Bazols уже шифрует raw snapshots и имеет server-side sessions, CSRF и restaurant-scope access.
6. **Есть воспроизведённый дефект rerun.** В `run_product_economics_v2` вызывается `db.connect().execute(...)` на context manager (`product_economics.py:889-898`). На временной мигрированной DB с существующим предыдущим периодом получен `AttributeError: '_GeneratorContextManager' object has no attribute 'execute'`; следующая корректная транзакция не выполняется.
7. **Миграции зависят от отдельного tracker и `executescript`.** Проект уже пережил drift `duplicate column name: run_slot`, что прямо отражено в `PROJECT_STATE.md:7-16`. Это симптом хрупкой схемы миграций и восстановления.
8. **Документация противоречива.** `PROJECT_STATE.md:7-9` говорит об operational confirmation, но `PROJECT_STATE.md:30-31` и `:80-92` одновременно оставляют timed fire pending. `reporting.toml:65-71` отключает delivery, тогда как отдельный production alert job включён в `config/schedules.json:66-84`.
9. **Product-economics частично обходит общий security/client слой.** `sync_pf_recipes` выполняет один gate-check, после чего напрямую вызывает transport provider; HTML-рецепт запрашивается по константному пути и сохраняется без общей проверки session/schema и `sanitize_payload` (`economics_sync.py:109-140`).
10. **Production gate слабее конфигурации, которую подразумевает проект.** `config/lanes.json:3` содержит пустой production allowlist, но `RegistryGate` для production проверяет только `production_eligible` (`security.py:59-62`). Загруженные `live_call_allowed` и `validation_policy` не участвуют в решении (`knowledge.py:171-186`). CLI ограничивает production сильнее, но прямой вызов client/pipeline способен это ограничение обойти.
11. **Доставка алертов не атомарна относительно ledger.** Сначала выполняется внешний MAX/Telegram send (`purchase_alerts_cron.py:293-317`), а затем сохраняется `DELIVERED` (`purchase_alerts_cron.py:326-356`). Crash между этими шагами приведёт к повторной отправке. Нужен transactional outbox/idempotency protocol.
12. **Ошибка до основного `try/finally` оставляет lock.** После `acquire_lock()` вызывается `ensure_schema()` до входа в `try` (`purchase_alerts_cron.py:197-207`), поэтому startup/schema failure не вызывает `release_lock()`. TTL-recovery есть, но следующий запуск может блокироваться до двух часов (`purchase_alerts_cron.py:53-70`).
13. **Production monitoring фактически читает через shadow lane.** Job позиционируется как production, но supplies и costs вызываются с `Lane.SHADOW` (`purchase_monitor_cron.py:161-176`). Это может быть намеренной защитой, однако telemetry и operational naming не отражают реальный режим.

### Средний риск

14. **Монолитность.** `product_economics.py` — 1294 строки; `run_product_economics_v2` занимает более 400 строк. Это усложняет безопасные изменения и повторное использование.
15. **Row-by-row writes и синхронный runtime.** Большие наборы записываются циклами в одной SQLite connection (`product_economics.py:1233-1271`). Несколько cron-процессов могут писать в общую SQLite, но нет общего writer coordinator, bounded retry/backoff для `SQLITE_BUSY` или contention-тестов.
16. **Фиксированные pagination ceilings.** Orders ограничены 20×50 строками (`pipelines.py:124-130`), supplies — 50×100 на отдел (`pipelines.py:234-239`), costs — 100×500 (`pipelines.py:247-256`). В economics sync отдельные запросы ограничены 100 tech cards, 200 PF records и 500 AutoCost records без общего pagination guard (`economics_sync.py:66-79`, `:109-126`, `:273-291`).
17. **Неоднородная отчётная семантика.** Daily предпочитает официальный `revenue_daily`, а weekly/monthly считают выручку из `orders.amount` (`reports.py:25-54`). Это способно давать разные значения «выручки» в соседних отчётах.
18. **Дублирующееся определение функции.** `sync_autocost_day` определён дважды, и второе определение молча затеняет первое (`economics_sync.py:148-170`, `:248-270`).
19. **Нет retention policy.** Raw JSON, snapshots, reports и DB растут локально. Архив уже содержит около 1,32 GB извлечённых данных/окружения.
20. **Нет лицензии и release-процесса.** До внешнего переиспользования правовой статус неизвестен.

## Масштабируемость

Оценка по 10-балльной шкале, где 10 — production-ready для нескольких ресторанов и параллельных пользователей.

| Измерение | Оценка | Причина |
| --- | ---: | --- |
| Один ресторан, ночные batch jobs | 7/10 | Для этого сценария система детально проработана и идемпотентна |
| Глубина аналитики | 8/10 | Существенно выше текущего Bazols |
| Рост объёма данных | 4/10 | SQLite, raw files, row loops, фиксированные лимиты |
| Параллельные jobs | 3/10 | Один browser context, локальная SQLite, нет job queue |
| Несколько ресторанов | 2/10 | Фиксированные role/unit assumptions, нет tenant model |
| Несколько пользователей | 1/10 | Нет web/API auth/RBAC |
| Горизонтальное масштабирование | 1/10 | Локальные paths/state/SQLite/browser session |
| Переносимость и воспроизводимость | 2/10 | Внешний KB, Windows paths, неполные dependencies |
| Наблюдаемость расчётов | 7/10 | Runs, fingerprints, health, reconciliation хорошо моделируются |
| Безопасность исходного кода | 6/10 | Сильный read-only gate, но локальный trust boundary |
| Безопасность поставленного архива | 1/10 | Секреты, auth state и DB включены в архив |
| Поддерживаемость | 4/10 | Хорошие тесты, но монолиты и несколько параллельных execution paths |

## Сравнение с текущим Bazols

| Область | Текущий Bazols | `buzz_rep` |
| --- | --- | --- |
| Product surface | Web + API + admin | CLI + файлы + cron |
| Пользователи и доступ | Sessions, CSRF, roles, restaurant scope | Локальный оператор, browser role |
| Persistence | PostgreSQL + Prisma | SQLite + raw files |
| Jobs | DB-backed queue + worker | Cron/scripts |
| Raw data | Шифруется до записи | Санитизируется, но не шифруется |
| Мультиресторанность | Явная модель ресторанов | Практически один configured tradepoint |
| Аналитика | Employee/product ratings | Намного шире: revenue/cost/stock/ABC/tech cards/drivers |
| Эксплуатация | Основа для серверного продукта | Основа для локальной автоматизации |
| Масштабирование | Значительно лучше | Ограничено одной машиной |

## Что стоит перенести

1. Формулы и тестовые сценарии из `product_economics.py`, но разбить на небольшие pure-domain modules.
2. `price_reliability.py`, monitoring event identity/dedup и классификацию событий.
3. Reconciliation выручки и health semantics.
4. Schema-drift и read-only registry guard как дополнительную защиту source connector.
5. Набор sanitized golden fixtures и доменные regression cases.
6. Структуру XLSX/owner reports как требования к будущему reporting layer.

## Что не стоит переносить как основу

- Hermes profile целиком;
- вложенный venv/runtime/browser binaries;
- `.env`, auth/session state и рабочие DB;
- SQLite schema как production persistence;
- browser-driven role selection как основной integration transport;
- MAX/Telegram credential discovery из соседнего скрипта;
- hardcoded Windows paths и внешний KB без versioned package contract.

## Проверки

- RAR integrity: PASS, 10 364 файлов, 925 директорий, 1 317 361 507 байт после распаковки.
- In-memory Python syntax compile (`src`, `scripts`, `tests`, 77 файлов): PASS.
- CLI `--help`: PASS.
- Pytest в чистом временном окружении с pytest/openpyxl: **376 passed, 30 failed, 1 error за 53.29 s**. Основной blocker — отсутствующий внешний canonical KB и Windows absolute paths из поставленного profile environment. Два упавших CLI-теста затем прошли по отдельности, то есть suite также имеет order/environment coupling.
- Rerun product economics с существующим предыдущим периодом: FAIL, воспроизведён `AttributeError` на `db.connect().execute`.
- В рамках первоначального аудита живые Buzzolls endpoints и внешняя доставка не вызывались. После аудита отдельный утверждённый read-only discovery проверил четыре cost/supply GET endpoint через существующую учётку Bazols; mutation и delivery не выполнялись.
- Содержимое secret-файлов и рабочих DB не читалось. Из санитизированных raw snapshots программно извлекались только endpoint metadata и структурная схема ключей/типов; business values не выводились и не переносились в fixtures.
