"use client";
import { usePathname } from "next/navigation";
import { NavRail, TopBar } from ".";

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === "/login") return <main className="page">{children}</main>;
  return <><TopBar /><div className="app-layout"><NavRail /><main className="page">{children}</main></div></>;
}
