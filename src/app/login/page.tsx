import { redirect } from "next/navigation";
import { getCtx } from "@/server/session";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getCtx()) redirect("/");
  return (
    <main>
      <h1>TenantDesk — sign in</h1>
      <LoginForm />
    </main>
  );
}
