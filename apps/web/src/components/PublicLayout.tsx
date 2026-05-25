import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import type { ReactNode } from "react";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-6xl px-5 pt-24 pb-16">{children}</main>
      <SiteFooter />
    </>
  );
}
