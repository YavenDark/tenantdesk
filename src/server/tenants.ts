import { getPool } from "./db";
import type { Ctx, Role } from "./projects";

export type TenantOption = { id: string; name: string; role: Role };

/** Tenants the session user can switch to: active memberships only. */
export async function listMyTenants(ctx: Ctx): Promise<TenantOption[]> {
  const { rows } = await getPool().query<TenantOption>(
    `SELECT t.id, t.name, m.role
       FROM memberships m
       JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = $1 AND m.active
      ORDER BY t.name`,
    [ctx.userId],
  );
  return rows;
}
