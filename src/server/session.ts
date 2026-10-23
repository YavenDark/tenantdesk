import { auth } from "@/auth";
import type { Ctx } from "./projects";

/** The ONLY source of identity: the server-side session. */
export async function getCtx(): Promise<Ctx | null> {
  const session = await auth();
  const userId = session?.user?.id;
  return userId ? { userId } : null;
}
