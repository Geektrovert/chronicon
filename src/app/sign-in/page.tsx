import { SignIn } from "@/components/sign-in";
import { LoadingState } from "@/components/ui/loading-state";
import { pagePrincipal } from "@/server/pages";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export const metadata = { title: "Sign in" };

// oxlint-disable-next-line effecttsgo/async-function -- Session-dependent React server component.
async function SignInPage() {
  await connection();
  if (await pagePrincipal()) redirect("/");
  return <SignIn />;
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingState>Opening sign in…</LoadingState>}>
      <SignInPage />
    </Suspense>
  );
}
