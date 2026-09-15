# Промпт для агента: подключение Bazols VM к Tailscale

Скопируйте текст ниже агенту, запущенному непосредственно на уже подготовленной Bazols VM. Этот шаг следует выполнять только после решения использовать прямой Tailscale transport для GitHub deployment.

---

Ты работаешь на выделенной Bazols Production VM. Подключи саму VM к существующему tailnet и подготовь безопасную основу для будущего прямого GitHub Actions → VM deployment.

## Зафиксированная архитектура

- Публичный HTTPS завершает NAS.
- NAS позже будет проксировать только Bazols hostname на приватный Caddy ingress VM.
- GitHub-hosted deployment runner входит в tailnet как ephemeral node через Tailscale workload identity federation.
- Runner tag: `tag:bazols-deploy`.
- VM tag: `tag:bazols-prod`.
- Runner получает доступ только к TCP 22 VM.
- На VM используется обычный OpenSSH и Linux-пользователь `bazols-deploy`.
- Tailscale SSH не используется.
- Существующий root jump host не используется GitHub Actions.

## Границы разрешения

Этот prompt разрешает:

- read-only сетевой аудит VM;
- установку стабильного Tailscale client из официального Tailscale repository для Debian;
- запуск/enable штатного `tailscaled` systemd service;
- интерактивное enrollment VM в существующий tailnet без публикации auth key;
- отключение Tailscale SSH;
- подготовку `~bazols-deploy/.ssh` с безопасными правами;
- установку только предоставленного deploy **public key** после проверки его формата и fingerprint.

Этот prompt не разрешает:

- менять NAS, DNS или публичный reverse proxy;
- менять guest/Proxmox firewall;
- менять `/etc/ssh/sshd_config`, SSH port или перезапускать SSH;
- открывать SSH в интернет;
- включать Tailscale SSH, subnet routes, exit-node mode или Funnel;
- применять tailnet policy без отдельного подтверждения администратора tailnet;
- создавать Tailscale OAuth secret или reusable auth key;
- получать GitHub deploy private key в чате или хранить его на VM;
- выдавать `bazols-deploy` широкий sudo или membership в `docker` group;
- запускать Bazols, Caddy, PostgreSQL, migration или deployment;
- выводить Tailscale IP, MagicDNS name, public/private keys или auth URLs в публичный отчёт.

Не используй `curl | sh`. Не удаляй существующие Tailscale devices или настройки.

## Фаза 1 — read-only preflight

Проверь и отчитай без секретов:

1. ОС/архитектуру и доступность официального stable Tailscale repository.
2. Установлен ли Tailscale и активен ли `tailscaled`.
3. Нет ли уже существующего enrollment, advertised routes, exit-node или Tailscale SSH.
4. Работает ли обычный OpenSSH на TCP 22.
5. Существует ли `bazols-deploy`; подтвердить, что он не в `docker` group и не имеет широкого sudo.
6. Не конфликтуют ли DNS/routes с private LAN, NAS и текущим административным SSH path.
7. Сохрани текущий network/service state для rollback без чтения secret files.

Остановись, если VM уже принадлежит неизвестному tailnet, рекламирует routes/exit node, имеет конфликтующие Tailscale настройки или установка может оборвать текущий SSH path.

## Фаза 2 — установка и enrollment

1. Если Tailscale отсутствует, установи stable package по официальной Debian-инструкции с signed keyring/repository.
2. Enable/start `tailscaled`; проверь systemd status.
3. Выполни enrollment интерактивно штатным способом. Не проси auth key в чате и не сохраняй reusable key.
4. Не включай Tailscale SSH. Убедись readback-командой, что он выключен.
5. Не рекламируй subnet routes и не включай exit-node.
6. После enrollment попроси администратора tailnet назначить этой VM `tag:bazols-prod` и подтвердить это в Tailscale admin console.
7. Не считай tag назначенным по hostname или сообщению пользователя: выполни доступный device/readback либо попроси подтверждение из admin console.
8. Зафиксируй стабильный MagicDNS/device identity только в приватной operator documentation, не в публичном Git repo.

## Фаза 3 — OpenSSH deploy identity

1. Создай `~bazols-deploy/.ssh` с owner `bazols-deploy`, mode `0700`.
2. Не создавай deploy private key на VM.
3. Если deploy public key ещё не предоставлен, оставь `authorized_keys` отсутствующим/пустым и отчитай blocker.
4. Если public key предоставлен безопасным локальным способом:
   - принимается только `ssh-ed25519` public key;
   - покажи оператору только fingerprint для сверки, не весь key;
   - установи его в `authorized_keys` с owner `bazols-deploy`, mode `0600`;
   - не удаляй и не перезаписывай неизвестные существующие keys без подтверждения.
5. Не активируй sudoers для pending deploy script. Это делается после появления проверенного root-owned `/opt/bazols/bin/deploy`.
6. Не добавляй пользователя в `docker` group.

Deploy private key в дальнейшем хранится только в GitHub Environment `production` как `PROD_SSH_PRIVATE_KEY`. Public key хранится на VM.

## Фаза 4 — tailnet policy handoff

Не применяй policy автоматически. Подготовь администратору tailnet минимальный policy diff и проверь его встроенными policy tests перед применением.

Требуемая семантика:

- owner может назначать `tag:bazols-prod` только Bazols server;
- federated GitHub identity может создавать только ephemeral `tag:bazols-deploy` nodes;
- `tag:bazols-deploy` может обращаться только к `tag:bazols-prod` по `tcp:22`;
- deploy tag не получает wildcard-доступ к tailnet;
- Bazols VM не становится subnet router/exit node;
- NAS ingress policy проектируется отдельно и не добавляется в этот diff.

Проверь точный синтаксис against current Tailscale policy schema. Не копируй непроверенный пример вслепую.

Для GitHub Actions должна быть создана Tailscale federated identity с минимальным `auth_keys` scope и ограничением на репозиторий/Production workflow, если текущий интерфейс Tailscale это поддерживает. Используются:

- `TS_OAUTH_CLIENT_ID` — federated identity client ID;
- `TS_AUDIENCE` — federated identity audience;
- GitHub `id-token: write` только у Production deploy job;
- pinned `tailscale/github-action` full commit SHA;
- runner tag `tag:bazols-deploy`;
- action connectivity check/ping до целевой VM.

Долгоживущий `TS_OAUTH_SECRET` и reusable auth key не использовать.

## Фаза 5 — проверка

После установки/enrollment проверь:

- `tailscaled` active;
- VM online в ожидаемом tailnet;
- VM имеет подтверждённый `tag:bazols-prod` либо это явно pending;
- Tailscale SSH off;
- no advertised subnet routes;
- no exit-node mode;
- обычный SSH продолжает работать по старому административному пути;
- после policy activation TCP 22 доступен только ожидаемым admin/deploy identities;
- `bazols-deploy` не в docker group и не имеет широкого sudo;
- authorized key присутствует только если public key был предоставлен;
- никакие Bazols containers не запущены;
- firewall, NAS, DNS и application не менялись.

Не выполняй первый GitHub connection test, пока federated identity, GitHub Environment, deploy public key и tailnet policy не активированы отдельными подтверждёнными действиями.

## Rollback этой подготовки

Если установка/enrollment нарушает сеть:

1. не удаляй пакеты и не меняй firewall автоматически;
2. используй сохранённый старый административный SSH path;
3. останови дальнейшую активацию;
4. отключи только новый Tailscale interface/service, если это необходимо для восстановления прежней связности и действие безопасно;
5. верни точный отчёт и запроси решение.

Удаление Tailscale device из admin console, удаление package или очистка state требует отдельного подтверждения.

## Финальный отчёт

```text
RESULT: TAILSCALE_READY | PARTIALLY_READY | BLOCKED

Actually changed:
- ...

Readback:
- tailscaled:
- enrolled expected tailnet:
- server tag confirmed:
- Tailscale SSH:
- routes/exit-node:
- OpenSSH old path:
- bazols-deploy groups/sudo:
- deploy public key installed:

Still pending outside VM:
- tailnet policy approval/readback
- federated identity
- GitHub Environment values
- first ephemeral runner connectivity test
- NAS ingress/DNS/firewall
- application deploy

Secrets/addresses printed: NO
```

Статус `TAILSCALE_READY` означает только готовность приватного deployment transport. Он не означает `env-ready`, `prod-ready` или что Bazols уже развёрнут.

---
