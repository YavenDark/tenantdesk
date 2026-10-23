import { createProjectRoutes } from "@/server/http/projectRoutes";
import { getCtx } from "@/server/session";

const routes = createProjectRoutes(getCtx);

export const PATCH = routes.rename;
