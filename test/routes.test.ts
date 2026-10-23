import { afterAll, afterEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/server/db";
import { createProjectRoutes } from "@/server/http/projectRoutes";
import { verifyCredentials } from "@/server/users";
import { ALICE, PROJECT_A, PROJECT_B, SEED_PROJECT_NAMES, TENANT_A, TENANT_B, VERA, seedUsers } from "../scripts/seed-data";

// Route handlers are exercised with the session lookup injected; everything
// below it (module, SQL, database) is real.

const as = (userId: string | null) => createProjectRoutes(async () => (userId ? { userId } : null));
const params = <P>(p: P) => ({ params: Promise.resolve(p) });
const req = (method: string, body?: unknown) =>
  new Request("http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

async function nameOf(id: string) {
  const { rows } = await getPool().query("SELECT name FROM projects WHERE id = $1", [id]);
  return rows[0]?.name;
}

async function auditCount(projectId: string) {
  const { rows } = await getPool().query("SELECT count(*)::int AS n FROM audit_events WHERE project_id = $1", [projectId]);
  return rows[0].n as number;
}

afterEach(async () => {
  for (const [id, name] of Object.entries(SEED_PROJECT_NAMES)) {
    await getPool().query("UPDATE projects SET name = $2 WHERE id = $1", [id, name]);
  }
});

afterAll(closePool);

describe("unauthenticated", () => {
  const anon = as(null);

  it("GET, POST and PATCH return 401 and touch nothing", async () => {
    const auditsBefore = await auditCount(PROJECT_A);

    expect((await anon.list(req("GET"), params({ tenantId: TENANT_A }))).status).toBe(401);
    expect((await anon.create(req("POST", { name: "x" }), params({ tenantId: TENANT_A }))).status).toBe(401);
    const patch = await anon.rename(req("PATCH", { name: "x" }), params({ tenantId: TENANT_A, projectId: PROJECT_A }));
    expect(patch.status).toBe(401);
    expect(await patch.json()).toEqual({ error: "unauthorized" });

    expect(await nameOf(PROJECT_A)).toBe(SEED_PROJECT_NAMES[PROJECT_A]);
    expect(await auditCount(PROJECT_A)).toBe(auditsBefore);
  });
});

describe("authorization over HTTP", () => {
  it("alice gets 404 listing and renaming tenant B's project; B unchanged", async () => {
    const auditsBefore = await auditCount(PROJECT_B);
    const list = await as(ALICE).list(req("GET"), params({ tenantId: TENANT_B }));
    expect(list.status).toBe(404);
    expect(await list.json()).toEqual({ error: "not found" });

    const patch = await as(ALICE).rename(req("PATCH", { name: "pwned" }), params({ tenantId: TENANT_B, projectId: PROJECT_B }));
    expect(patch.status).toBe(404);
    expect(await nameOf(PROJECT_B)).toBe(SEED_PROJECT_NAMES[PROJECT_B]);
    expect(await auditCount(PROJECT_B)).toBe(auditsBefore);
  });

  it("vera (viewer) gets the same 404 on create and rename", async () => {
    const create = await as(VERA).create(req("POST", { name: "viewer project" }), params({ tenantId: TENANT_A }));
    expect(create.status).toBe(404);
    const patch = await as(VERA).rename(req("PATCH", { name: "nope" }), params({ tenantId: TENANT_A, projectId: PROJECT_A }));
    expect(patch.status).toBe(404);
    expect(await nameOf(PROJECT_A)).toBe(SEED_PROJECT_NAMES[PROJECT_A]);
  });

  it("malformed ids are 404, not 500", async () => {
    const res = await as(ALICE).rename(req("PATCH", { name: "ok" }), params({ tenantId: "nope", projectId: "' OR 1=1 --" }));
    expect(res.status).toBe(404);
  });
});

describe("validation over HTTP", () => {
  it.each([[""], ["   "], ["x".repeat(101)], [123], [null], [undefined]])("name %j -> 400", async (name) => {
    const res = await as(ALICE).rename(req("PATCH", { name }), params({ tenantId: TENANT_A, projectId: PROJECT_A }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "validation" });
  });

  it("non-JSON body -> 400", async () => {
    const res = await as(ALICE).rename(req("PATCH", "not json"), params({ tenantId: TENANT_A, projectId: PROJECT_A }));
    expect(res.status).toBe(400);
  });
});

describe("success over HTTP", () => {
  it("alice renames A's project -> 200 and exactly one audit row", async () => {
    const auditsBefore = await auditCount(PROJECT_A);
    const res = await as(ALICE).rename(
      req("PATCH", { name: "  Apollo HTTP  " }),
      params({ tenantId: TENANT_A, projectId: PROJECT_A }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: PROJECT_A, name: "Apollo HTTP" });
    expect(await auditCount(PROJECT_A)).toBe(auditsBefore + 1);
  });
});

describe("credentials", () => {
  const [aliceSeed] = seedUsers();

  it("accepts the seeded password and rejects a wrong one or unknown user", async () => {
    expect(await verifyCredentials({ email: aliceSeed.email, password: aliceSeed.password })).toEqual({
      id: ALICE,
      email: aliceSeed.email,
    });
    expect(await verifyCredentials({ email: aliceSeed.email, password: "wrong" })).toBeNull();
    expect(await verifyCredentials({ email: "nobody@acme.test", password: "x" })).toBeNull();
    expect(await verifyCredentials({ email: 1, password: [] })).toBeNull();
  });
});
