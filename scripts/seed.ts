import "./env";
import bcrypt from "bcryptjs";
import { closePool, withTransaction } from "../src/server/db";
import {
  ALICE, BOB, PROJECT_A, PROJECT_B, SEED_PROJECT_NAMES, TENANT_A, TENANT_B, VERA, seedUsers,
} from "./seed-data";

async function main() {
  const users = await Promise.all(
    seedUsers().map(async (u) => ({ ...u, hash: await bcrypt.hash(u.password, 10) })),
  );

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO tenants (id, name) VALUES ($1, 'Acme'), ($2, 'Globex')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [TENANT_A, TENANT_B],
    );

    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [u.id, u.email, u.hash],
      );
    }

    await client.query(
      `INSERT INTO memberships (user_id, tenant_id, role, active) VALUES
         ($1, $4, 'editor', true),
         ($2, $5, 'editor', true),
         ($3, $4, 'viewer', true)
       ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = EXCLUDED.role, active = EXCLUDED.active`,
      [ALICE, BOB, VERA, TENANT_A, TENANT_B],
    );

    // DO NOTHING: re-seeding must not undo renames made through the app.
    await client.query(
      `INSERT INTO projects (id, tenant_id, name) VALUES ($1, $2, $3), ($4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [PROJECT_A, TENANT_A, SEED_PROJECT_NAMES[PROJECT_A], PROJECT_B, TENANT_B, SEED_PROJECT_NAMES[PROJECT_B]],
    );
  });

  console.log("seeded tenants Acme/Globex, users alice/bob/vera, one project per tenant");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
