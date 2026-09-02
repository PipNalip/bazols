# Changelog

Все заметные изменения Base Template фиксируются здесь.

Формат основан на Keep a Changelog, версии следуют Semantic Versioning.

## [Unreleased]

### Added

- Независимое white-label ядро для AI-assisted разработки.
- Семь нейтральных Cursor rules, семь Agent Skills и четыре команды.
- Защита секретов для Git, Cursor и Docker build context.
- Проверяемая политика отдельного подтверждения push и deployment.
- Самодостаточные contract tests и validator.

### Fixed

- Расширено исключение service-account credentials, SSH-ключей и registry authentication files во всех трёх защитных слоях.
- Frontmatter rules и skills теперь проверяется строгим поддерживаемым форматом, а release contract отклоняет встроенные команды публикации.
