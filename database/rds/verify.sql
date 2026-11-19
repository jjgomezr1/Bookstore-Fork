-- ============================================================
-- File: verify.sql
-- Purpose:
--   Verify the technical bootstrap contract for the
--   schema-per-service layout (auth, catalog, orders) without
--   revealing later analytical/data-quality discoveries.
--
-- Required psql variables:
--   auth_user
--   catalog_user
--   orders_user
--   ingest_user
-- ============================================================

\set ON_ERROR_STOP on

\echo ''
\echo '============================================================'
\echo ' BookStore Co. - RDS bootstrap verification'
\echo '============================================================'

\echo ''
\echo '1. Database context'
SELECT current_database() AS database_name,
       current_user AS connected_as,
       current_setting('server_version') AS postgres_version;

\echo ''
\echo '2. Required tables (each one in its own service schema)'
SELECT table_schema, table_name
FROM information_schema.tables
WHERE (table_schema, table_name) IN (
  ('catalog', 'books'),
  ('auth', 'customers'),
  ('orders', 'orders'),
  ('orders', 'order_items')
)
ORDER BY table_schema, table_name;

SELECT COUNT(*) = 4 AS required_tables_ok
FROM information_schema.tables
WHERE (table_schema, table_name) IN (
  ('catalog', 'books'),
  ('auth', 'customers'),
  ('orders', 'orders'),
  ('orders', 'order_items')
)
\gset
\if :required_tables_ok
\else
  \echo 'ERROR: one or more required tables are missing.'
  \quit 1
\endif

\echo ''
\echo '3. Minimal seed row counts'
SELECT 'catalog.books' AS entity, COUNT(*) AS row_count FROM catalog.books
UNION ALL
SELECT 'auth.customers', COUNT(*) FROM auth.customers
UNION ALL
SELECT 'orders.orders', COUNT(*) FROM orders.orders
UNION ALL
SELECT 'orders.order_items', COUNT(*) FROM orders.order_items
ORDER BY entity;

\echo ''
\echo '4. Runtime roles'
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole
FROM pg_roles
WHERE rolname IN (:'auth_user', :'catalog_user', :'orders_user', :'ingest_user')
ORDER BY rolname;

SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'auth_user') AS auth_role_ok,
       EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'catalog_user') AS catalog_role_ok,
       EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'orders_user') AS orders_role_ok,
       EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'ingest_user') AS ingest_role_ok
\gset
\if :auth_role_ok
\else
  \echo 'ERROR: auth service role is missing.'
  \quit 1
\endif
\if :catalog_role_ok
\else
  \echo 'ERROR: catalog service role is missing.'
  \quit 1
\endif
\if :orders_role_ok
\else
  \echo 'ERROR: orders service role is missing.'
  \quit 1
\endif
\if :ingest_role_ok
\else
  \echo 'ERROR: ingestion runtime role is missing.'
  \quit 1
\endif

\echo ''
\echo '5. Operational indexes present in the baseline'
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname IN ('auth', 'catalog', 'orders')
ORDER BY schemaname, tablename, indexname;

\echo ''
\echo '6. updated_at triggers'
SELECT event_object_schema AS table_schema,
       event_object_table AS table_name,
       trigger_name,
       event_manipulation
FROM information_schema.triggers
WHERE trigger_schema IN ('auth', 'catalog', 'orders')
ORDER BY event_object_schema, event_object_table, trigger_name, event_manipulation;

\echo ''
\echo '7. Runtime table privileges'
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema IN ('auth', 'catalog', 'orders')
  AND grantee IN (:'auth_user', :'catalog_user', :'orders_user', :'ingest_user')
ORDER BY grantee, table_schema, table_name, privilege_type;

\echo ''
\echo '8. Least-privilege checks'
-- Each service can read and write the tables of its own schema.
SELECT
  has_table_privilege(:'auth_user', 'auth.customers', 'SELECT')
  AND has_table_privilege(:'auth_user', 'auth.customers', 'INSERT')
  AND has_table_privilege(:'auth_user', 'auth.customers', 'UPDATE')
  AS auth_privileges_ok,
  has_table_privilege(:'catalog_user', 'catalog.books', 'SELECT')
  AND has_table_privilege(:'catalog_user', 'catalog.books', 'UPDATE')
  AS catalog_privileges_ok,
  has_table_privilege(:'orders_user', 'orders.orders', 'SELECT')
  AND has_table_privilege(:'orders_user', 'orders.orders', 'INSERT')
  AND has_table_privilege(:'orders_user', 'orders.orders', 'UPDATE')
  AND has_table_privilege(:'orders_user', 'orders.order_items', 'SELECT')
  AND has_table_privilege(:'orders_user', 'orders.order_items', 'INSERT')
  AS orders_privileges_ok,
  -- The ingestion identity is read-only across all service schemas.
  has_table_privilege(:'ingest_user', 'catalog.books', 'SELECT')
  AND has_table_privilege(:'ingest_user', 'auth.customers', 'SELECT')
  AND has_table_privilege(:'ingest_user', 'orders.orders', 'SELECT')
  AND NOT has_table_privilege(:'ingest_user', 'catalog.books', 'INSERT')
  AND NOT has_table_privilege(:'ingest_user', 'catalog.books', 'UPDATE')
  AND NOT has_table_privilege(:'ingest_user', 'catalog.books', 'DELETE')
  AS ingest_privileges_ok
\gset
\if :auth_privileges_ok
\else
  \echo 'ERROR: auth service privileges are not as expected.'
  \quit 1
\endif
\if :catalog_privileges_ok
\else
  \echo 'ERROR: catalog service privileges are not as expected.'
  \quit 1
\endif
\if :orders_privileges_ok
\else
  \echo 'ERROR: orders service privileges are not as expected.'
  \quit 1
\endif
\if :ingest_privileges_ok
\else
  \echo 'ERROR: ingestion role is not read-only as expected.'
  \quit 1
\endif

\echo ''
\echo '9. Schema isolation between services'
-- A service must not be able to read another service's data,
-- even though all schemas live in the same RDS instance.
SELECT :'catalog_user' AS role_name,
       has_table_privilege(:'catalog_user', 'orders.orders', 'SELECT') AS reads_orders,
       has_table_privilege(:'catalog_user', 'auth.customers', 'SELECT') AS reads_customers,
       NULL::boolean AS reads_books
UNION ALL
SELECT :'orders_user',
       NULL,
       has_table_privilege(:'orders_user', 'auth.customers', 'SELECT'),
       has_table_privilege(:'orders_user', 'catalog.books', 'SELECT')
UNION ALL
SELECT :'auth_user',
       has_table_privilege(:'auth_user', 'orders.orders', 'SELECT'),
       NULL,
       has_table_privilege(:'auth_user', 'catalog.books', 'SELECT');

SELECT
  NOT has_table_privilege(:'catalog_user', 'orders.orders', 'SELECT')
  AND NOT has_table_privilege(:'catalog_user', 'auth.customers', 'SELECT')
  AND NOT has_table_privilege(:'orders_user', 'catalog.books', 'SELECT')
  AND NOT has_table_privilege(:'orders_user', 'auth.customers', 'SELECT')
  AND NOT has_table_privilege(:'auth_user', 'orders.orders', 'SELECT')
  AND NOT has_table_privilege(:'auth_user', 'catalog.books', 'SELECT')
  AS isolation_ok
\gset
\if :isolation_ok
\else
  \echo 'ERROR: a service role can read another service schema.'
  \quit 1
\endif

\echo ''
\echo '10. Referential-integrity sanity check (inside the orders schema)'
-- order_items -> orders is a real foreign key (same service).
-- order_items.book_id -> catalog.books is a logical reference only:
-- it is guaranteed by the order saga (Catalog reserves stock before
-- Orders persists the order), not by a cross-schema constraint.
SELECT COUNT(*) = 0 AS referential_integrity_ok
FROM orders.order_items oi
LEFT JOIN orders.orders o ON o.order_id = oi.order_id
WHERE o.order_id IS NULL
\gset
\if :referential_integrity_ok
\else
  \echo 'ERROR: orphan order_items were found.'
  \quit 1
\endif

\echo ''
\echo 'Verification completed successfully.'
