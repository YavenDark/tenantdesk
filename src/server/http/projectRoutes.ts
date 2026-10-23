import { createProject, listProjects, renameProject, type Ctx, type Failure } from "@/server/projects";

type GetCtx = () => Promise<Ctx | null>;
type Params<P> = { params: Promise<P> };

const json = (body: unknown, status: number) => Response.json(body, { status });

const unauthorized = () => json({ error: "unauthorized" }, 401);

export function failureResponse(f: Failure): Response {
  switch (f.error) {
    case "not_found":
      return json({ error: "not found" }, 404);
    case "validation":
      return json({ error: "validation", message: f.message }, 400);
    case "conflict":
      return json({ error: "conflict", message: "A project with this name already exists" }, 409);
  }
}

async function readName(req: Request): Promise<{ name: unknown } | null> {
  try {
    const body: unknown = await req.json();
    return { name: body && typeof body === "object" ? (body as { name?: unknown }).name : undefined };
  } catch {
    return null;
  }
}

const invalidJson = () => json({ error: "validation", message: "Body must be JSON" }, 400);

/**
 * Route handlers take the session lookup as a dependency so tests can exercise
 * them without an HTTP server. Production wiring passes the Auth.js session.
 */
export function createProjectRoutes(getCtx: GetCtx) {
  return {
    async list(_req: Request, { params }: Params<{ tenantId: string }>) {
      const ctx = await getCtx();
      if (!ctx) return unauthorized();
      const { tenantId } = await params;
      const res = await listProjects(ctx, tenantId);
      return res.ok ? json(res.data, 200) : failureResponse(res);
    },

    async create(req: Request, { params }: Params<{ tenantId: string }>) {
      const ctx = await getCtx();
      if (!ctx) return unauthorized();
      const body = await readName(req);
      if (!body) return invalidJson();
      const { tenantId } = await params;
      const res = await createProject(ctx, tenantId, body.name);
      return res.ok ? json(res.data, 201) : failureResponse(res);
    },

    async rename(req: Request, { params }: Params<{ tenantId: string; projectId: string }>) {
      const ctx = await getCtx();
      if (!ctx) return unauthorized();
      const body = await readName(req);
      if (!body) return invalidJson();
      const { tenantId, projectId } = await params;
      const res = await renameProject(ctx, tenantId, projectId, body.name);
      return res.ok ? json(res.data, 200) : failureResponse(res);
    },
  };
}
