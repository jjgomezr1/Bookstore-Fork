\set ON_ERROR_STOP on

-- ------------------------------------------------------------
-- Auth service: schema auth (customers)
-- ------------------------------------------------------------
GRANT CONNECT ON DATABASE :"db_name" TO :"auth_user";
GRANT USAGE ON SCHEMA auth TO :"auth_user";
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA auth
  TO :"auth_user";

-- ------------------------------------------------------------
-- Catalog service: schema catalog (books)
-- ------------------------------------------------------------
GRANT CONNECT ON DATABASE :"db_name" TO :"catalog_user";
GRANT USAGE ON SCHEMA catalog TO :"catalog_user";
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA catalog
  TO :"catalog_user";

-- ------------------------------------------------------------
-- Orders service: schema orders (orders, order_items)
-- ------------------------------------------------------------
GRANT CONNECT ON DATABASE :"db_name" TO :"orders_user";
GRANT USAGE ON SCHEMA orders TO :"orders_user";
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA orders
  TO :"orders_user";

-- ------------------------------------------------------------
-- Ingestion: read-only access to the operational sources
-- ------------------------------------------------------------
GRANT CONNECT ON DATABASE :"db_name" TO :"ingest_user";
GRANT USAGE ON SCHEMA auth, catalog, orders TO :"ingest_user";
GRANT SELECT
  ON ALL TABLES IN SCHEMA auth, catalog, orders
  TO :"ingest_user";

-- ------------------------------------------------------------
-- Future tables created by the role executing this file inherit
-- the corresponding privileges (for example, stock_reservations
-- if it is added later).
-- ------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA auth
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"auth_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"catalog_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA orders
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"orders_user";

ALTER DEFAULT PRIVILEGES IN SCHEMA auth, catalog, orders
  GRANT SELECT ON TABLES TO :"ingest_user";