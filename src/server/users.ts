import bcrypt from "bcryptjs";
import { z } from "zod";
import { getPool } from "./db";

const credentialsSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(200),
});

// Compared against when the user does not exist, so both paths cost one bcrypt.
const DUMMY_HASH = bcrypt.hashSync("tenantdesk-dummy-password", 10);

export async function verifyCredentials(input: unknown): Promise<{ id: string; email: string } | null> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return null;

  const { rows } = await getPool().query<{ id: string; email: string; password_hash: string }>(
    "SELECT id, email, password_hash FROM users WHERE email = $1",
    [parsed.data.email],
  );
  const user = rows[0];
  const ok = await bcrypt.compare(parsed.data.password, user?.password_hash ?? DUMMY_HASH);
  return user && ok ? { id: user.id, email: user.email } : null;
}
