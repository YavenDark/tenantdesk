import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/server/db";
import { createProject, listProjects, renameProject } from "@/server/projects";
import { ALICE, PROJECT_A, PROJECT_B, SEED_PROJECT_NAMES, TENANT_A, TENANT_B, VERA } from "../scripts/seed-data";

// Runs against the real database. Assertions are deltas around seeded fixtures,
// and every test restores what it changed, so the suite is safe to re-run.

const alice = { userId: ALICE };
const vera = { userId: VERA };
const runId = Date.now().toString(36);

async function projectRow(id: string) {
  const { rows } = await getPool().query("SELECT id, tenant_id, name FROM projects WHERE id = $1", [id]);
  return rows[0];
}

async function auditCount(projectId: string) {
  const { rows } = await getPool().query<{ n: string }>(
    "SELECT count(*) AS n FROM audit_events WHERE project_id = $1",
    [projectId],
  );
  return Number(rows[0].n);
}

async function projectCount(tenantId: string) {
  const { rows } = await getPool().query<{ n: string }>(
    "SELECT count(*) AS n FROM projects WHERE tenant_id = $1",
    [tenantId],
  );
  return Number(rows[0].n);
}

async function restoreSeedNames() {
  for (const [id, name] of Object.entries(SEED_PROJECT_NAMES)) {
    await getPool().query("UPDATE projects SET name = $2 WHERE id = $1", [id, name]);
  }
}

beforeAll(async () => {
  // Fail loudly if the DB was not migrated/seeded instead of producing confusing results.
  expect(await projectRow(PROJECT_A)).toBeDefined();
  expect(await projectRow(PROJECT_B)).toBeDefined();
  await restoreSeedNames();
});

afterEach(restoreSeedNames);

afterAll(closePool);

describe("cross-tenant access (alice is editor in A only)", () => {
  it("cannot list tenant B", async () => {
    expect(await listProjects(alice, TENANT_B)).toEqual({ ok: false, error: "not_found" });
  });

  it("cannot rename B's project: not found, DB unchanged, no audit row", async () => {
    const before = await projectRow(PROJECT_B);
    const auditsBefore = await auditCount(PROJECT_B);

    // Both the honest tenant id and a spoofed "my tenant" id must fail identically.
    expect(await renameProject(alice, TENANT_B, PROJECT_B, `hijack-${runId}`)).toEqual({ ok: false, error: "not_found" });
    expect(await renameProject(alice, TENANT_A, PROJECT_B, `hijack-${runId}`)).toEqual({ ok: false, error: "not_found" });

    expect(await projectRow(PROJECT_B)).toEqual(before);
    expect(await auditCount(PROJECT_B)).toBe(auditsBefore);
  });

  it("cannot create in tenant B", async () => {
    const countBefore = await projectCount(TENANT_B);
    expect(await createProject(alice, TENANT_B, `intrude-${runId}`)).toEqual({ ok: false, error: "not_found" });
    expect(await projectCount(TENANT_B)).toBe(countBefore);
  });
});

describe("viewer (vera in A)", () => {
  it("can list A", async () => {
    const res = await listProjects(vera, TENANT_A);
    expect(res.ok && res.data.role).toBe("viewer");
    expect(res.ok && res.data.projects.map((p) => p.id)).toContain(PROJECT_A);
  });

  it("cannot create: forbidden (reported as not found), DB unchanged", async () => {
    const countBefore = await projectCount(TENANT_A);
    expect(await createProject(vera, TENANT_A, `viewer-made-${runId}`)).toEqual({ ok: false, error: "not_found" });
    expect(await projectCount(TENANT_A)).toBe(countBefore);
  });

  it("cannot rename: forbidden (reported as not found), DB unchanged, no audit row", async () => {
    const before = await projectRow(PROJECT_A);
    const auditsBefore = await auditCount(PROJECT_A);
    expect(await renameProject(vera, TENANT_A, PROJECT_A, `viewer-${runId}`)).toEqual({ ok: false, error: "not_found" });
    expect(await projectRow(PROJECT_A)).toEqual(before);
    expect(await auditCount(PROJECT_A)).toBe(auditsBefore);
  });
});

describe("name validation", () => {
  const invalid: [string, unknown][] = [
    ["empty", ""],
    ["whitespace only", "   "],
    ["101 chars", "x".repeat(101)],
    ["number", 42],
    ["null", null],
    ["object", { name: "x" }],
  ];

  it.each(invalid)("rejects %s on rename and create", async (_label, value) => {
    const before = await projectRow(PROJECT_A);
    const auditsBefore = await auditCount(PROJECT_A);

    expect(await renameProject(alice, TENANT_A, PROJECT_A, value)).toMatchObject({ ok: false, error: "validation" });
    expect(await createProject(alice, TENANT_A, value)).toMatchObject({ ok: false, error: "validation" });

    expect(await projectRow(PROJECT_A)).toEqual(before);
    expect(await auditCount(PROJECT_A)).toBe(auditsBefore);
  });

  it("accepts exactly 100 chars after trimming", async () => {
    const name = "  " + `${runId}-`.padEnd(100, "y") + "  ";
    const res = await renameProject(alice, TENANT_A, PROJECT_A, name);
    expect(res.ok && res.data.name).toBe(name.trim());
  });
});

describe("authorized writes", () => {
  it("alice renames A's project: success and exactly one audit row", async () => {
    const newName = `  Apollo ${runId}  `;
    const auditsBefore = await auditCount(PROJECT_A);

    const res = await renameProject(alice, TENANT_A, PROJECT_A, newName);

    expect(res).toMatchObject({ ok: true, data: { id: PROJECT_A, name: newName.trim() } });
    expect((await projectRow(PROJECT_A)).name).toBe(newName.trim());
    expect(await auditCount(PROJECT_A)).toBe(auditsBefore + 1);

    const { rows } = await getPool().query(
      `SELECT tenant_id, actor_id, action, old_name, new_name FROM audit_events
        WHERE project_id = $1 ORDER BY id DESC LIMIT 1`,
      [PROJECT_A],
    );
    expect(rows[0]).toEqual({
      tenant_id: TENANT_A,
      actor_id: ALICE,
      action: "project.renamed",
      old_name: SEED_PROJECT_NAMES[PROJECT_A],
      new_name: newName.trim(),
    });
  });

  it("duplicate name in the same tenant (case-insensitive) is a conflict", async () => {
    const name = `Dup ${runId}`;
    const created = await createProject(alice, TENANT_A, name);
    expect(created.ok).toBe(true);
    try {
      expect(await createProject(alice, TENANT_A, name.toUpperCase())).toEqual({ ok: false, error: "conflict" });
      expect(await renameProject(alice, TENANT_A, PROJECT_A, name.toLowerCase())).toEqual({ ok: false, error: "conflict" });
    } finally {
      if (created.ok) {
        await getPool().query("DELETE FROM audit_events WHERE project_id = $1", [created.data.id]);
        await getPool().query("DELETE FROM projects WHERE id = $1", [created.data.id]);
      }
    }
  });
});

describe("transactional audit", () => {
  const FAIL_MARKER = "__fail_audit__";

  beforeAll(async () => {
    // Real failure injected in the database: the audit INSERT raises for a marker name.
    await getPool().query(`
      CREATE OR REPLACE FUNCTION tenantdesk_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.new_name LIKE '${FAIL_MARKER}%' THEN
          RAISE EXCEPTION 'forced audit failure (test)';
        END IF;
        RETURN NEW;
      END $$;
      DROP TRIGGER IF EXISTS tenantdesk_test_fail_audit ON audit_events;
      CREATE TRIGGER tenantdesk_test_fail_audit BEFORE INSERT ON audit_events
        FOR EACH ROW EXECUTE FUNCTION tenantdesk_test_fail_audit();
    `);
  });

  afterAll(async () => {
    await getPool().query(`
      DROP TRIGGER IF EXISTS tenantdesk_test_fail_audit ON audit_events;
      DROP FUNCTION IF EXISTS tenantdesk_test_fail_audit();
    `);
  });

  it("audit failure rolls back the rename", async () => {
    const before = await projectRow(PROJECT_A);
    const auditsBefore = await auditCount(PROJECT_A);

    await expect(renameProject(alice, TENANT_A, PROJECT_A, `${FAIL_MARKER}${runId}`)).rejects.toThrow(
      /forced audit failure/,
    );

    expect(await projectRow(PROJECT_A)).toEqual(before);
    expect(await auditCount(PROJECT_A)).toBe(auditsBefore);
  });

  it("audit failure rolls back the create", async () => {
    const countBefore = await projectCount(TENANT_A);
    await expect(createProject(alice, TENANT_A, `${FAIL_MARKER}new-${runId}`)).rejects.toThrow(/forced audit failure/);
    expect(await projectCount(TENANT_A)).toBe(countBefore);
  });
});
