import { Pool, type PoolClient } from "pg";

function sslConfig(): false | { rejectUnauthorized: boolean } {
  const mode = process.env.DATABASE_SSL ?? "no-verify";
  if (mode === "disable") return false;
  return { rejectUnauthorized: mode === "verify" };
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString, ssl: sslConfig(), max: 5 });
}

// Reuse one pool across hot reloads in dev.
const globalForDb = globalThis as unknown as { tenantdeskPool?: Pool };

export function getPool(): Pool {
  globalForDb.tenantdeskPool ??= createPool();
  return globalForDb.tenantdeskPool;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await globalForDb.tenantdeskPool?.end();
  globalForDb.tenantdeskPool = undefined;
}
