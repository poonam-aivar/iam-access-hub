"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Zap,
  FileText,
  Shield,
  BookOpen,
  ClipboardList,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  section?: "main" | "admin";
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="h-5 w-5" />,
    section: "main",
  },
  {
    label: "Instant Access (SSO)",
    href: "/lane-a",
    icon: <Zap className="h-5 w-5" />,
    section: "main",
  },
  {
    label: "Request Access",
    href: "/lane-b",
    icon: <FileText className="h-5 w-5" />,
    section: "main",
  },
  {
    label: "Approval Queue",
    href: "/admin/approvals",
    icon: <ClipboardList className="h-5 w-5" />,
    section: "admin",
  },
  {
    label: "Policy Library",
    href: "/admin/policies",
    icon: <BookOpen className="h-5 w-5" />,
    section: "admin",
  },
  {
    label: "Audit Logs",
    href: "/admin/audit",
    icon: <Shield className="h-5 w-5" />,
    section: "admin",
  },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const mainNav = navItems.filter((item) => item.section === "main");
  const adminNav = navItems.filter((item) => item.section === "admin");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform bg-card border-r transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-2 border-b px-6">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">IAM Access Hub</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-auto lg:hidden"
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            <p className="px-3 text-xs font-medium uppercase text-muted-foreground mb-2">
              Access
            </p>
            {mainNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === item.href
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}

            <p className="px-3 pt-6 text-xs font-medium uppercase text-muted-foreground mb-2">
              DevOps
            </p>
            {adminNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === item.href
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Footer */}
          <div className="border-t p-4">
            <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
              <LogOut className="h-5 w-5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center gap-4 border-b bg-card px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xs font-medium text-primary">P</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
