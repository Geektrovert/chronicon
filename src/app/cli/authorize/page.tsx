import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Schema } from "effect";
import { cliAuthorization } from "@/lib/cli-auth";
import { pagePrincipal } from "@/server/pages";
import { CliAuthorization } from "@/components/cli-authorization";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata = {
  title: "Authorize CLI",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// oxlint-disable-next-line effecttsgo/async-function -- Request-dependent React server component.
async function Authorization({ searchParams }: Props) {
  await connection();
  const input = await searchParams;

  if (!Schema.is(cliAuthorization)(input))
    return (
      <main className="signin-page">
        <p>This login link is invalid. Run chronicon login again in your terminal.</p>
      </main>
    );
  const principal = await pagePrincipal();

  if (!principal) {
    const next =
      "/cli/authorize?" +
      new URLSearchParams({
        redirectUri: input.redirectUri,
        state: input.state,
        challenge: input.challenge,
      }).toString();

    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  return (
    <CliAuthorization
      input={input}
      account={principal.access === "owner" ? principal.email : principal.name}
    />
  );
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={<LoadingState>Opening authorization…</LoadingState>}>
      <Authorization {...props} />
    </Suspense>
  );
}
