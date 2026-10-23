import "./env";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { closePool, getPool, withTransaction } from "../src/server/db";

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

async function main() {
  await getPool().query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const applied = await withTransaction(async (client) => {
      // Serialize concurrent migrators.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('tenantdesk_migrations'))");
      const { rowCount } = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
      if (rowCount) return false;
      await client.query(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      return true;
    });
    console.log(`${applied ? "applied" : "skipped"} ${file}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
