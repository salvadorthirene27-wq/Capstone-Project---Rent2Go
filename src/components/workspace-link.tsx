"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function WorkspaceLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const exact = href === "/" || href === "/workspace" || href === "/admin";
  const active =
    path === href ||
    (!exact && path.startsWith(`${href}/`)) ||
    (href === "/admin" && path.startsWith("/admin/applications/"));
  return (
    <Link href={href} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
