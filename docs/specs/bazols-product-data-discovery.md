# Bazols Product Data Discovery

**Статус:** read-only исследование завершено 2026-09-16 для business issue #35
**Граница:** только локальное исследование разрешённой учётной записи; Production и внешние изменения не выполнялись

## Цель

Проверить, какие данные источника можно безопасно использовать для карточек продуктов, истории цены и расчёта себестоимости/валовой маржи до реализации импорта и отчётов.

## Метод и ограничения

- Сначала исследован JavaScript-клиент источника без авторизации, чтобы найти используемые им GET-маршруты.
- Затем выполнена ограниченная цепочка `Authenticate → GetPermissions → SetRole` и только точечные GET-запросы.
- Redirect не выполнялись. Ответ `Forbidden` фиксировался по безопасному pathname без перехода.
- Реальные response body, идентификаторы, названия, реквизиты, cookies и персональные данные не сохранялись в Git и не выводились в отчёт.
- В репозитории находятся только полностью вымышленные fixtures из `test/fixtures/source/`.

## Подтверждённые read-only операции

Следующие операции доступны хотя бы в одном уже выданном контексте подразделения/роли и добавлены в закрытый allowlist коннектора:

| Операция | Параметры | Подтверждённые данные |
|---|---|---|
| `GET /Products/Home/GetAllProducts` | `isRemove=false` | ID и название продукта, признаки удаления/приготовления, тип, net weight и код единицы измерения |
| `GET /InventoryControl/TechnicalCards/GetAllProductionMaterials` | нет | ID и название материала, тип/категория, код и короткая подпись единицы измерения, признак удаления |
| `GET /InventoryControl/TechnicalCards/GetProductById` | `productId` | связь с продуктом, наличие техкарт и признаки доступа; денежных показателей нет |
| `GET /InventoryControl/TechnicalCards/GetPagedTechnicalCard` | `productId`, `startIndex`, `pageSize` | техкарты, строковая подпись периода, active/deactivated flags, материалы и source-formatted количества |
| `GET /InventoryControl/AutoCostProduct/GetAutoCostProducts` | `date`, `page`, `count` | product ID, официальный AutoCost по unit/trade area, средний AutoCost, числовые `price`, `fc`, `extraCharge` |
| `GET /InventoryControl/AutoCostMaterials/GetAutoCostMaterials` | `startDate`, `endDate`, `page`, `count`, optional repeated `departmentIds`, half-finished flag | история AutoCost материала по датам, unit/department и числовой код валюты |
| `GET /InventoryControl/MaterialSupply/GetAvailableDepartments` | `unitId` | разрешённые supply departments для выбранного unit/role |
| `GET /InventoryControl/MaterialSupply/GetMaterialSuppliesWithLimit` | date-time range, `unitId`, `departmentId`, `startIndex`, `pageSize` | история поставок, цена и налог строки, количество и единица измерения |

Во время ограниченной проверки источник вернул непустые каталоги, материалы, техкарту, product AutoCost и material AutoCost. Supply endpoint был доступен, но в узком текущем диапазоне вернул пустой список; его структура подтверждена только по санитизированному локальному snapshot альтернативной реализации. Количество записей использовалось только как диагностический агрегат и не является стабильным продуктовым контрактом.

### Permissions

- Каталог продуктов был доступен во всех проверенных уже выданных контекстах подразделения/роли.
- Операции материалов и техкарт были доступны в одном разрешённом подразделении и возвращали `Forbidden` в другом независимо от выбранной из выданных ролей. Следовательно, доступ подразделения является обязательной предпосылкой; наличие конкретного номера роли само по себе доступ не гарантирует.
- Product и material AutoCost доступны в двух ролях первого разрешённого unit. Запрос material AutoCost успешно работает и без `departmentIds`; role из результата permissions по-прежнему выбирается явно.
- Supply departments и supplies доступны в одной роли второго unit. Cost и supply endpoints поэтому нельзя вызывать в одном произвольно выбранном контексте: worker должен выбирать подтверждённый unit/role для каждой операции и проверять restaurant mapping.
- Реальные unit IDs и role IDs не фиксируются в коде или документации. Коннектор обязан использовать только результат текущего `GetPermissions` и явно настроенное сопоставление ресторана.
- Текущий ответ permissions использует `data.permissions[]`, `unitId` и числовые роли. На границе они нормализуются в существующий внутренний формат строковых IDs/roles; неизвестная форма отклоняется.

## Недоступные операции

JavaScript-клиент источника содержит read-only GET-маршруты:

- `/Products/Menu/GetMenu`;
- `/Products/Menu/GetProductsPrices`.

Во всех проверенных уже выданных контекстах подразделения/роли источник перенаправлял их на `/Infrastructure/Error/Forbidden`. Redirect не выполнялся. Эти маршруты **не добавлены** в allowlist Bazols и не могут считаться доступным источником текущей цены.

## Семантика данных

### Идентичность и единицы

- Продукт идентифицируется source product ID; название является отображаемым атрибутом и не заменяет ID.
- Материал идентифицируется source material ID.
- Каталог продуктов содержит числовой код единицы net weight.
- Материалы содержат числовой код и короткую текстовую подпись единицы измерения.
- Количества в техкартах приходят как source-formatted строки. До отдельной нормализации нельзя предполагать конкретный десятичный разделитель или переводить их в money/quantity автоматически.

### Цена продажи

Доступный отчёт `EmployeesRating/GetData` содержит для фактически проданной позиции:

- `productPrice` — цена позиции, зафиксированная в заказе;
- `priceWithDiscountForOrder` — фактически отнесённая на позицию сумма после скидки заказа;
- валюту денежного значения.

Это исторические данные конкретной продажи. Они не доказывают текущую цену меню: товар мог не продаваться после изменения цены, а значение заказа может зависеть от скидок и контекста продажи. Поэтому уведомления об изменении текущей цены по этим данным не строятся.

### Себестоимость, налоги и валовая маржа

Второй read-only discovery подтвердил официальные product/material monetary endpoints и доступность supply route:

- product AutoCost содержит `autoCost` по unit, `averageAutoCost` по trade area и числовые `price`, `fc`, `extraCharge`;
- material AutoCost содержит `autoCost` по материалу, дате, unit и department, а также числовой код `currency`;
- непустая структура supply history с `Price`, `Tax`, quantity `Metrics.Value` и кодом единицы измерения подтверждена только санитизированным snapshot альтернативной реализации; live-запрос подтвердил доступ к route и успешный пустой envelope, но не подтвердил строки поставок.

Следствия:

- issue #36 **разблокирован по доступности source feed**, но ещё требует production orchestration, полной пагинации, нормализации decimal money, restaurant/unit mapping, persistence и reconciliation;
- официальный product AutoCost является предпочтительным первичным COGS snapshot; material AutoCost подтверждён для детализации, а supplies остаются provisional до live-подтверждения непустой строки;
- числовой currency code пока не сопоставлен с ISO currency, а семантика `Price`/`Tax` поставки и включение упаковки в официальный AutoCost требуют сверки с source UI;
- поле `price` в product AutoCost не считается доказанной текущей menu price до отдельной reconciliation, поэтому issue #38 пока не разблокирован;
- при отсутствии применимого AutoCost себестоимость остаётся `unknown`, а не нулём.

Целевой расчёт для #37 фиксируется так:

- `net sales` = сумма `priceWithDiscountForOrder` проданных позиций за период;
- `COGS` = сумма полной эффективной себестоимости каждой проданной позиции на момент продажи, включая все обязательные ингредиенты и упаковку в одной подтверждённой валюте;
- `gross margin amount` = `net sales - COGS`;
- `gross margin rate` = `gross margin amount / net sales`, только когда `net sales > 0`;
- если хотя бы для одной включённой позиции отсутствует применимая стоимость, единица, валюта или подтверждённая дата действия, COGS и оба margin-показателя для агрегата равны `unknown`, а не частичной сумме;
- налоговая база источником не раскрыта, поэтому показатели нельзя маркировать как до- или после-налоговые до отдельного подтверждения.

Выбор между `lossMaterialQuantityToString` и `productionMaterialQuantityToString` как эффективным количеством не зафиксирован. Issue #36 может импортировать официальный product AutoCost без угадывания этой формулы; recipe-based Level 2 decomposition должна оставаться отдельной последующей моделью с явным coverage.

### Период действия и история

Product AutoCost запрашивается на конкретную дату, а material AutoCost возвращает массив дат. Этого достаточно для основного snapshot history в #36 при условии хранения source date и запрета future leakage. Timestamp supplies присутствует в provisional snapshot-контракте, но не считается live-подтверждённым до получения непустого разрешённого ответа.

`GetPagedTechnicalCard` возвращает строковую подпись `datePeriod` и признаки активности, но в проверенном контракте нет отдельных машиночитаемых `validFrom`/`validTo`. До подтверждения формата строка сохраняется только как source label и не используется для recipe-based исторической стоимости.

Текущая цена меню и её история недоступны. История цен из заказов отражает только наблюдавшиеся продажи и не является полным журналом изменения меню.

## Missing-data и fail-closed правила

- Пустой каталог, список техкарт, AutoCost page, departments или supplies — допустимый ответ, отличимый от ошибки контракта.
- Отсутствующая себестоимость остаётся `unknown`; подстановка нуля запрещена.
- `NaN`, infinity, отрицательный cost/price и неизвестная структура monetary rows отклоняются до persistence.
- Отсутствующий ID, обязательный признак или обязательный массив отклоняется как `SOURCE_CONTRACT_INVALID` до будущей публикации данных.
- Неуспешный envelope отклоняется как `SOURCE_RESPONSE_UNSUCCESSFUL`.
- Существующий импорт отчётов продолжает сохранять последний успешный набор при ошибке; product/cost import в этой задаче не добавляется.
- Изменение permissions-контракта (`data.permissions`, `unitId`, числовые роли) нормализуется в существующий внутренний формат; неизвестная структура по-прежнему отклоняется.

## Синтетический контракт

Добавлены полностью вымышленные fixtures:

- product catalog: success, empty, invalid;
- production materials: success;
- technical cards: success, empty, invalid;
- product AutoCost: success, empty и invalid mutation test;
- material AutoCost: success, empty и invalid mutation test;
- supply departments: success, empty и invalid mutation test;
- material supplies: success, empty, invalid mutation test и PascalCase failed-envelope test;
- current permissions shape с числовыми ролями.

Privacy guard проверяет allowlist полей, синтетические UUID/названия, reserved domains и отсутствие credential-like данных. Fixtures не являются копиями живых ответов.

## Решение для следующих задач

1. Issue #36 можно реализовывать на основе official product/material AutoCost; supplies можно подключать как дополнительную purchase-price history только после live-подтверждения непустой строки.
2. Каталог продуктов, техкарты и AutoCost должны импортироваться раздельными checkpointed stages; частичная ошибка не должна публиковать частичный новый snapshot.
3. #37 разблокируется после #36 и reconciliation с source UI на пилотном ресторане.
4. Для #38 поле product AutoCost `price` сначала нужно доказать как текущую menu price; цены проданных позиций недостаточны.
5. Любое дальнейшее расширение allowlist требует нового read-only подтверждения метода, параметров, permissions и fail-closed схемы.
