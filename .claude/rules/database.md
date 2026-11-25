---
paths:
  - "**/*.{ts,mts,cts,js,mjs,cjs,py,go,rs,java,kt,rb,php,cs,sol,sql}"
  - "**/migrations/**"
  - "**/{src,services,libs,apps,packages,contracts}/**"
---
# database — Mandatory AI Rules

## Query Safety
- ALL queries use parameterized statements — never string-interpolated SQL
- No `SELECT *` in production code — select only needed columns
- Every list query has a `LIMIT` clause
- Use `EXPLAIN ANALYZE` to validate query plans before shipping slow queries

## Indexes
- Add indexes for every `WHERE`, `JOIN ON`, and `ORDER BY` column under load
- Unique constraints on fields that must be unique (email, slug, etc.)
- Composite indexes for multi-column filters (order matters — most selective first)
- Never add an index without a comment explaining why

## Migrations
- One migration per logical change
- Migrations are forward-only — never edit a merged migration
- Every migration must be reversible (include `down` logic)
- Test migrations against a copy of production data before deploying
- Never run migrations in the same deploy step as code changes — migrate first

## Transactions
- Wrap multi-step mutations in a transaction
- Keep transactions short — no external API calls inside a transaction
- Handle deadlocks with retry logic

## Naming Conventions
```
Tables:    snake_case, plural     → users, order_items
Columns:   snake_case             → created_at, user_id
Indexes:   idx_table_column       → idx_users_email
FK:        fk_table_ref           → fk_orders_user_id
```

## Soft Deletes
- Prefer `deleted_at` timestamp over hard deletes for user-facing data
- Filter `WHERE deleted_at IS NULL` in all default queries
- Hard delete only: logs, temp data, audit records with retention policy

## What Claude Must Not Do
- Drop a column or table without an explicit migration file
- Add a NOT NULL column without a default value (breaks existing rows)
- Run `DELETE` or `UPDATE` without a `WHERE` clause
- Create a migration that modifies data in a destructive way without a backup step
