"use server";

import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { createProject, renameProject, type Failure } from "@/server/projects";
import { getCtx } from "@/server/session";
import type { ActionState } from "./action-state";

export const TENANT_COOKIE = "tenantdesk.tenant";

function failureState(f: Failure): ActionState {
  switch (f.error) {
    case "not_found":
      return { status: "error", message: "Not found." };
    case "validation":
      return { status: "error", message: f.message };
    case "conflict":
      return { status: "error", message: "A project with this name already exists." };
  }
}

const UNEXPECTED: ActionState = { status: "error", message: "Something went wrong. Please try again." };

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
    return { status: "ok" };
  } catch (err) {
    if (err instanceof AuthError) return { status: "error", message: "Invalid email or password." };
    throw err; // includes the success redirect
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

/** Records which tenant the user wants to see. A preference, never an authorization. */
export async function selectTenantAction(formData: FormData) {
  const tenantId = String(formData.get("tenantId") ?? "");
  (await cookies()).set(TENANT_COOKIE, tenantId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/");
}

export async function createProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getCtx();
  if (!ctx) return { status: "error", message: "Your session has expired. Please sign in again." };
  try {
    const res = await createProject(ctx, String(formData.get("tenantId") ?? ""), formData.get("name"));
    if (!res.ok) return failureState(res);
  } catch (err) {
    console.error("createProject failed", err);
    return UNEXPECTED;
  }
  revalidatePath("/");
  return { status: "ok", message: "Project created." };
}

export async function renameProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getCtx();
  if (!ctx) return { status: "error", message: "Your session has expired. Please sign in again." };
  try {
    const res = await renameProject(
      ctx,
      String(formData.get("tenantId") ?? ""),
      String(formData.get("projectId") ?? ""),
      formData.get("name"),
    );
    if (!res.ok) return failureState(res);
  } catch (err) {
    console.error("renameProject failed", err);
    return UNEXPECTED;
  }
  revalidatePath("/");
  return { status: "ok", message: "Renamed." };
}
