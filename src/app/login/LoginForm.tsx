"use client";

import { useActionState } from "react";
import { loginAction } from "../actions";
import { idle } from "../action-state";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, idle);
  return (
    <form action={action}>
      <p>
        <label>
          Email <input name="email" type="email" required autoComplete="username" />
        </label>
      </p>
      <p>
        <label>
          Password <input name="password" type="password" required autoComplete="current-password" />
        </label>
      </p>
      <button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {state.status === "error" && <p role="alert">{state.message}</p>}
    </form>
  );
}
