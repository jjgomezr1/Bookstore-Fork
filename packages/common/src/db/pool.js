import pg from "pg";

const { Pool } = pg;

export const createDatabase = (databaseConfig) => {
  const pool = new Pool({
    host: databaseConfig.host,
    port: databaseConfig.port,
    database: databaseConfig.name,
    user: databaseConfig.user,
    password: databaseConfig.password,
    ssl: databaseConfig.ssl
      ? { rejectUnauthorized: databaseConfig.sslRejectUnauthorized }
      : false,
    max: databaseConfig.poolMax,
    idleTimeoutMillis: databaseConfig.idleTimeoutMs,
    connectionTimeoutMillis: databaseConfig.connectionTimeoutMs,
    options: `-c search_path=${databaseConfig.schema}`,
  });

  const withTransaction = async (operation) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // noop
      }

      throw error;
    } finally {
      client.release();
    }
  };

  const verifyConnection = async () => {
    await pool.query("SELECT 1");
  };

  const close = async () => {
    await pool.end();
  };

  return Object.freeze({ pool, withTransaction, verifyConnection, close });
};