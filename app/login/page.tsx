import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/serverSession";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const userId = await getSessionUserId();
  if (userId) {
    redirect("/dashboard");
  }

  return <LoginForm />;
}
