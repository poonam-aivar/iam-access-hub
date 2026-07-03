import { DashboardShell } from "@/components/dashboard-shell";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
