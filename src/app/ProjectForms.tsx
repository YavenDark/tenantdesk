"use client";

import { useActionState, useState } from "react";
import { createProjectAction, renameProjectAction } from "./actions";
import { idle } from "./action-state";

export function CreateProjectForm({ tenantId }: { tenantId: string }) {
  const [state, action, pending] = useActionState(createProjectAction, idle);
  return (
    <form action={action}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <label>
        New project <input name="name" maxLength={100} disabled={pending} />
      </label>{" "}
      <button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create"}
      </button>
      {state.message && <span role={state.status === "error" ? "alert" : "status"}> {state.message}</span>}
    </form>
  );
}

export function RenameProject({ tenantId, project }: { tenantId: string; project: { id: string; name: string } }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: typeof idle, formData: FormData) => {
    const next = await renameProjectAction(prev, formData);
    if (next.status === "ok") setEditing(false);
    return next;
  }, idle);

  if (!editing) {
    return (
      <>
        {project.name} <button onClick={() => setEditing(true)}>Rename</button>
        {state.status === "ok" && <span role="status"> {state.message}</span>}
      </>
    );
  }

  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="projectId" value={project.id} />
      <input name="name" defaultValue={project.name} maxLength={100} disabled={pending} autoFocus />{" "}
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>{" "}
      <button type="button" onClick={() => setEditing(false)} disabled={pending}>
        Cancel
      </button>
      {state.status === "error" && <span role="alert"> {state.message}</span>}
    </form>
  );
}
