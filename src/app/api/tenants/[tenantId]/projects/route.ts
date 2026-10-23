import { createProjectRoutes } from "@/server/http/projectRoutes";
import { getCtx } from "@/server/session";

const routes = createProjectRoutes(getCtx);

export const GET = routes.list;
export const POST = routes.create;
