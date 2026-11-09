"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function WorkspaceLink({
  href,
  children,
  exact: exactMatch = false,
  activePaths = [],
}: {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
  activePaths?: string[];
}) {
  const path = usePathname();
  const exact = exactMatch || href === "/" || href === "/workspace" || href === "/admin";
  const active =
    path === href ||
    activePaths.some(p=>path===p||path.startsWith(`${p}/`)) ||
    (!exact && path.startsWith(`${href}/`)) ||
    (href === "/admin" && path.startsWith("/admin/applications/"));
  return (
    <Link href={href} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
