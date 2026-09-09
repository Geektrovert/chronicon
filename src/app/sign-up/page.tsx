import { AuthPage, type AuthPageProps } from "@/components/auth-page";

export const metadata = { title: "Create account" };

export default function Page(props: AuthPageProps) {
  return <AuthPage {...props} create />;
}
