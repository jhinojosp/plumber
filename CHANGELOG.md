# Changelog

## [Unreleased]

## [v0.1.0] — 2025-08-31
### Added
- CSV ingestion with date parsing (`Fecha`, `Fecha de Compra`)
- Expense data viewer (expenses/payments split)
- Category editor with persistent `categories.json`
- Pie chart of expenses by category
- SQLite DB with idempotent (delta) ingestion + file-hash guard


## [v0.2.0] — 2025-08-31
### Added
- SQLite DB ingestion with duplicate protection (delta by date/desc/amount)
- File-hash guard to skip exact re-uploads
- DB summary widget (rows + file size)

### Changed
- App title: “plumber”

[Unreleased]: https://github.com/jhinojosp/plumber/compare/v0.2.0...HEAD
[v0.2.0]: https://github.com/jhinojosp/plumber/releases/tag/v0.2.0
[v0.1.0]: https://github.com/jhinojosp/plumber/releases/tag/v0.1.0