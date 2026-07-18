"use client";

import Link from "next/link";
import NextImage from "next/image";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpenText,
  ClipboardList,
  ExternalLink,
  Image,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  Shapes,
  ShoppingBag,
  Sparkles,
  Users,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/generator", label: "Template Generator", icon: Sparkles },
  { href: "/admin/assets", label: "Asset Management", icon: Image },
  { href: "/admin/templates", label: "Product Templates", icon: ShoppingBag },
  { href: "/admin/layouts", label: "Banner Layouts", icon: Shapes },
  { href: "/admin/shopify-sync", label: "Shopify Sync", icon: RefreshCw },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/support", label: "Support Guide", icon: BookOpenText },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings }
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-slate-600 transition-colors",
              "hover:bg-slate-100 hover:text-slate-950",
              isActive && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function AdminActions() {
  return (
    <div className="grid gap-2">
      <a
        href="https://teamsportbanners.vercel.app/"
        target="_blank"
        rel="noreferrer"
        className="flex h-10 items-center justify-center gap-2 rounded-md border bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-100"
      >
        <ExternalLink className="h-4 w-4" />
        Open Customer Tool
      </a>
      <form action="/api/admin/logout" method="post">
        <button className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-3 text-sm font-bold text-red-700 hover:bg-red-50" type="submit">
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </form>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-white/92 backdrop-blur lg:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <Link href="/admin" className="flex items-center gap-3 font-black tracking-tight text-slate-950">
            <NextImage src="/team-sport-banners-logo.svg" alt="Team Sport Banners" width={36} height={36} className="rounded-md object-contain" />
            <span>TSBanner Admin</span>
          </Link>
          <Button variant="outline" size="icon" onClick={() => setOpen(true)} aria-label="Open admin navigation">
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r bg-white/95 px-4 py-5 shadow-admin lg:block">
        <Link href="/admin" className="mb-7 flex items-center gap-3 rounded-md px-2">
          <NextImage src="/team-sport-banners-logo.svg" alt="Team Sport Banners" width={44} height={44} className="object-contain" />
          <div>
            <div className="text-sm font-black uppercase tracking-wide text-slate-950">TSBanner</div>
            <div className="text-xs font-semibold text-muted-foreground">Sports Design Platform</div>
          </div>
        </Link>
        <SidebarNav />
        <div className="absolute bottom-5 left-4 right-4 border-t bg-white pt-4">
          <p className="mb-3 text-xs font-semibold text-slate-500">Synced from the live customer tool at deployment.</p>
          <AdminActions />
        </div>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-slate-950/40" aria-label="Close admin navigation" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-[86vw] max-w-sm border-r bg-white p-4 shadow-admin">
            <div className="mb-5 flex items-center justify-between">
              <Link href="/admin" className="flex items-center gap-3 font-black text-slate-950" onClick={() => setOpen(false)}>
                <NextImage src="/team-sport-banners-logo.svg" alt="Team Sport Banners" width={40} height={40} className="object-contain" />
                <span>TSBanner Admin</span>
              </Link>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close admin navigation">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarNav onNavigate={() => setOpen(false)} />
            <div className="mt-5 border-t pt-4">
              <AdminActions />
            </div>
          </aside>
        </div>
      ) : null}

      <main className="lg:pl-72">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
