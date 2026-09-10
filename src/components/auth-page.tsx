import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { pagePrincipal } from "@/server/pages";
import { signInDestination } from "@/lib/cli-auth";
import { SignIn } from "./sign-in";
import { LoadingState } from "./ui/loading-state";

export type AuthPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  create?: boolean;
};

// oxlint-disable-next-line effecttsgo/async-function -- Request-dependent React server component.
async function AccountForm({ searchParams, create }: AuthPageProps) {
  await connection();
  const query = await searchParams;
  const next = signInDestination(typeof query.next === "string" ? query.next : null);
  if (await pagePrincipal()) redirect(next);
  return <SignIn create={create} next={next} />;
}

export function AuthPage(props: AuthPageProps) {
  return (
    <Suspense fallback={<LoadingState>Loading account form…</LoadingState>}>
      <AccountForm {...props} />
    </Suspense>
  );
}
