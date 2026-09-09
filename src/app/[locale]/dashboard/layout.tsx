import { enforcePageAccess } from "@/lib/enforce-page-access";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await enforcePageAccess("dashboard", locale);
  return children;
}
