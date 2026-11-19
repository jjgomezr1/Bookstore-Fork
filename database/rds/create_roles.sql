-- ============================================================
-- File: create_roles.sql
-- Purpose:
--   Ensure the database login roles required by BookStore Co.
--   exist and converge to the credentials supplied at runtime.
--
-- Required psql variables:
--   auth_user,    auth_password
--   catalog_user, catalog_password
--   orders_user,  orders_password
--   ingest_user,  ingest_password
-- ============================================================

\set ON_ERROR_STOP on

SELECT format(
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'catalog_user')
      THEN 'ALTER ROLE %I LOGIN PASSWORD %L'
    ELSE 'CREATE ROLE %I LOGIN PASSWORD %L'
  END,
  :'catalog_user',
  :'catalog_password'
)
\gexec

SELECT format(
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'auth_user')
      THEN 'ALTER ROLE %I LOGIN PASSWORD %L'
    ELSE 'CREATE ROLE %I LOGIN PASSWORD %L'
  END,
  :'auth_user',
  :'auth_password'
)
\gexec

SELECT format(
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'orders_user')
      THEN 'ALTER ROLE %I LOGIN PASSWORD %L'
    ELSE 'CREATE ROLE %I LOGIN PASSWORD %L'
  END,
  :'orders_user',
  :'orders_password'
)
\gexec

SELECT format(
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'ingest_user')
      THEN 'ALTER ROLE %I LOGIN PASSWORD %L'
    ELSE 'CREATE ROLE %I LOGIN PASSWORD %L'
  END,
  :'ingest_user',
  :'ingest_password'
)
\gexec
