import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { listProjects } from "@/server/projects";
import { getCtx } from "@/server/session";
import { listMyTenants } from "@/server/tenants";
import { TENANT_COOKIE } from "./action-state";
import { logoutAction, selectTenantAction } from "./actions";
import { CreateProjectForm, RenameProject } from "./ProjectForms";

export default async function Home() {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");

  const tenants = await listMyTenants(ctx);
  const requested = (await cookies()).get(TENANT_COOKIE)?.value;
  // The cookie is only a request; fall back to a tenant the user actually belongs to.
  const tenant = tenants.find((t) => t.id === requested) ?? tenants[0];

  return (
    <main>
      <h1>TenantDesk</h1>
      <form action={logoutAction}>
        <button type="submit">Sign out</button>
      </form>

      {!tenant ? (
        <p>You have no active tenant memberships.</p>
      ) : (
        <>
          <form action={selectTenantAction}>
            <label>
              Tenant{" "}
              <select name="tenantId" defaultValue={tenant.id} key={tenant.id}>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.role})
                  </option>
                ))}
              </select>
            </label>{" "}
            <button type="submit">Switch</button>
          </form>
          <ProjectList userId={ctx.userId} tenantId={tenant.id} />
        </>
      )}
    </main>
  );
}

async function ProjectList({ userId, tenantId }: { userId: string; tenantId: string }) {
  let res;
  try {
    res = await listProjects({ userId }, tenantId);
  } catch (err) {
    console.error("listProjects failed", err);
    return <p role="alert">Could not load projects. Please try again.</p>;
  }
  if (!res.ok) return <p role="alert">Tenant not found.</p>;

  // UI hint only: the server re-checks the role on every write.
  const canWrite = res.data.role !== "viewer";
  const { projects } = res.data;

  return (
    <section>
      <h2>Projects</h2>
      {canWrite ? <CreateProjectForm tenantId={tenantId} /> : <p>You have read-only access.</p>}
      {projects.length === 0 ? (
        <p>No projects yet.</p>
      ) : (
        <ul>
          {projects.map((p) => (
            <li key={p.id}>{canWrite ? <RenameProject tenantId={tenantId} project={p} /> : p.name}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
