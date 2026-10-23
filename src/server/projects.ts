import { z } from "zod";
import { getPool, withTransaction } from "./db";

/**
 * The only module allowed to read or write projects.
 *
 * Authorization model: `ctx.userId` comes from the server session; `tenantId`
 * is whatever the client asked for and is never trusted. Every statement joins
 * `memberships` on (user_id, tenant_id, active) so the request is authorized by
 * the same SQL that touches the data. Non-members and under-privileged members
 * get the same `not_found` result, so tenant/project existence is not leaked.
 */

export type Ctx = { userId: string };
export type Role = "viewer" | "editor" | "admin";

export type Project = { id: string; name: string; createdAt: Date };

export type Failure =
  | { ok: false; error: "not_found" }
  | { ok: false; error: "validation"; message: string }
  | { ok: false; error: "conflict" };

export type Result<T> = { ok: true; data: T } | Failure;

export const projectNameSchema = z
  .string({ error: "Name must be a string" })
  .trim()
  .min(1, "Name is required")
  .max(100, "Name must be at most 100 characters");

const idSchema = z.uuid();

const NOT_FOUND = { ok: false, error: "not_found" } as const;
const CONFLICT = { ok: false, error: "conflict" } as const;
const WRITE_ROLES = ["editor", "admin"];
const LIST_LIMIT = 100;

function validateName(input: unknown): { ok: true; name: string } | Failure {
  const parsed = projectNameSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation", message: parsed.error.issues[0]?.message ?? "Invalid name" };
  }
  return { ok: true, name: parsed.data };
}

// A malformed id cannot match any row; answer exactly like a missing one.
function validIds(...ids: unknown[]): boolean {
  return ids.every((id) => idSchema.safeParse(id).success);
}

function isUniqueNameViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === "23505" && e.constraint === "projects_tenant_lower_name_key";
}

export async function listProjects(
  ctx: Ctx,
  tenantId: string,
): Promise<Result<{ role: Role; projects: Project[] }>> {
  if (!validIds(ctx.userId, tenantId)) return NOT_FOUND;

  // Driven from memberships: no row means "not a member" -> not_found;
  // one row with null project means "member, but no projects yet".
  const { rows } = await getPool().query<{
    role: Role;
    id: string | null;
    name: string | null;
    created_at: Date | null;
  }>(
    `SELECT m.role, p.id, p.name, p.created_at
       FROM memberships m
       LEFT JOIN projects p ON p.tenant_id = m.tenant_id
      WHERE m.user_id = $1 AND m.tenant_id = $2 AND m.active
      ORDER BY p.created_at DESC NULLS LAST, p.id
      LIMIT $3`,
    [ctx.userId, tenantId, LIST_LIMIT],
  );

  if (rows.length === 0) return NOT_FOUND;

  const projects = rows
    .filter((r) => r.id !== null)
    .map((r) => ({ id: r.id!, name: r.name!, createdAt: r.created_at! }));
  return { ok: true, data: { role: rows[0].role, projects } };
}

export async function createProject(ctx: Ctx, tenantId: string, rawName: unknown): Promise<Result<Project>> {
  const v = validateName(rawName);
  if (!v.ok) return v;
  if (!validIds(ctx.userId, tenantId)) return NOT_FOUND;

  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string; name: string; created_at: Date }>(
        `INSERT INTO projects (tenant_id, name)
         SELECT m.tenant_id, $3
           FROM memberships m
          WHERE m.user_id = $1 AND m.tenant_id = $2 AND m.active AND m.role = ANY($4)
         RETURNING id, name, created_at`,
        [ctx.userId, tenantId, v.name, WRITE_ROLES],
      );
      if (rows.length === 0) return NOT_FOUND;

      const p = rows[0];
      await client.query(
        `INSERT INTO audit_events (tenant_id, actor_id, project_id, action, old_name, new_name)
         VALUES ($1, $2, $3, 'project.created', NULL, $4)`,
        [tenantId, ctx.userId, p.id, p.name],
      );
      return { ok: true, data: { id: p.id, name: p.name, createdAt: p.created_at } } as const;
    });
  } catch (err) {
    if (isUniqueNameViolation(err)) return CONFLICT;
    throw err;
  }
}

export async function renameProject(
  ctx: Ctx,
  tenantId: string,
  projectId: string,
  rawName: unknown,
): Promise<Result<Project>> {
  const v = validateName(rawName);
  if (!v.ok) return v;
  if (!validIds(ctx.userId, tenantId, projectId)) return NOT_FOUND;

  try {
    return await withTransaction(async (client) => {
      // Single authorized UPDATE. The FOR UPDATE subquery locks the row first so
      // old_name is the committed value we actually replaced, even under races.
      const { rows } = await client.query<{ id: string; name: string; created_at: Date; old_name: string }>(
        `UPDATE projects p
            SET name = $4
           FROM (SELECT id, name FROM projects WHERE id = $1 AND tenant_id = $2 FOR UPDATE) old
          WHERE p.id = $1
            AND p.tenant_id = $2
            AND old.id = p.id
            AND EXISTS (
                  SELECT 1 FROM memberships m
                   WHERE m.user_id = $3 AND m.tenant_id = p.tenant_id AND m.active AND m.role = ANY($5)
                )
        RETURNING p.id, p.name, p.created_at, old.name AS old_name`,
        [projectId, tenantId, ctx.userId, v.name, WRITE_ROLES],
      );
      if (rows.length === 0) return NOT_FOUND;

      const p = rows[0];
      await client.query(
        `INSERT INTO audit_events (tenant_id, actor_id, project_id, action, old_name, new_name)
         VALUES ($1, $2, $3, 'project.renamed', $4, $5)`,
        [tenantId, ctx.userId, p.id, p.old_name, p.name],
      );
      return { ok: true, data: { id: p.id, name: p.name, createdAt: p.created_at } } as const;
    });
  } catch (err) {
    if (isUniqueNameViolation(err)) return CONFLICT;
    throw err;
  }
}
