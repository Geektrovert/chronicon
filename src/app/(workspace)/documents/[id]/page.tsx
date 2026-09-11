import { DocumentStream } from "@/components/document-stream";
import { documentPageData, documentPageHeader, pagePrincipal } from "@/server/pages";

// oxlint-disable-next-line effecttsgo/async-function -- Next metadata boundary shares the request-scoped page lookup.
export async function generateMetadata({ params }: PageProps<"/documents/[id]">) {
  if (!(await pagePrincipal())) return { title: "Sign in" };
  const { id } = await params;

  return { title: (await documentPageHeader(id)).document.title };
}

// oxlint-disable-next-line effecttsgo/async-function -- Next route params and server data are awaited at the page boundary.
export default async function Page({ params }: PageProps<"/documents/[id]">) {
  const { id } = await params;

  return <DocumentStream key={id} heading={documentPageHeader(id)} report={documentPageData(id)} />;
}
