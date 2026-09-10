"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Factory,
  Home,
  QrCode,
  Package,
  LayoutDashboard,
  PlusCircle,
  GitMerge,
  Settings,
  FileText,
  ShieldAlert,
  Server,
  Search,
  Menu,
  X,
  Building2,
  User,
} from "lucide-react";
import { LanguagePicker } from "@/components/language-picker";

export interface NavLinkItem {
  href: string;
  label: string;
}

interface NavbarProps {
  appName: string;
  links: NavLinkItem[];
  organizationName?: string | null;
  userName?: string | null;
}

export function Navbar({
  appName,
  links,
  organizationName,
  userName,
}: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");

  // Map route hrefs to clean Lucide icons
  const getIcon = (href: string) => {
    switch (href) {
      case "/app":
        return <Home className="h-4 w-4" />;
      case "/app/worker":
        return <QrCode className="h-4 w-4 text-emerald-400" />;
      case "/app/products":
        return <Package className="h-4 w-4" />;
      case "/app/dashboard":
        return <LayoutDashboard className="h-4 w-4" />;
      case "/app/products/new":
        return <PlusCircle className="h-4 w-4 text-indigo-400" />;
      case "/app/workflows":
        return <GitMerge className="h-4 w-4" />;
      case "/app/settings":
        return <Settings className="h-4 w-4" />;
      case "/app/reports":
        return <FileText className="h-4 w-4" />;
      case "/app/audit":
        return <ShieldAlert className="h-4 w-4" />;
      case "/app/platform":
        return <Server className="h-4 w-4 text-amber-400" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const handleQuickSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSearch.trim()) return;
    const searchVal = quickSearch.trim();
    // Redirect to products list with search query or direct product view
    router.push(`/app/products?search=${encodeURIComponent(searchVal)}`);
  };

  // Keyboard shortcut listener ('/' to focus search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        document.getElementById("priority-global-search")?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className="border-b bg-slate-900 text-slate-100 shadow-md print:hidden">
      {/* Top Header Bar */}
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5">
        {/* Brand & Organization Badge */}
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="flex items-center gap-2 text-lg font-bold tracking-tight text-white transition-opacity hover:opacity-90"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-inner">
              <Factory className="h-5 w-5 text-white" />
            </div>
            <span>{appName}</span>
          </Link>
          {organizationName ? (
            <div className="hidden items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300 ring-1 ring-slate-700/60 sm:flex">
              <Building2 className="h-3.5 w-3.5 text-blue-400" />
              <span>{organizationName}</span>
            </div>
          ) : null}
        </div>

        {/* Global Quick Search (Priority Barcode Lookup) */}
        <form
          onSubmit={handleQuickSearchSubmit}
          className="relative hidden max-w-md flex-1 md:block"
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="priority-global-search"
              type="text"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder="Search barcode or serial... (Press '/' to focus)"
              className="w-full rounded-lg bg-slate-800/90 py-1.5 pl-9 pr-9 text-xs text-white placeholder-slate-400 border border-slate-700 focus:border-blue-500 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
              /
            </kbd>
          </div>
        </form>

        {/* Right Controls: User Info & Language Picker */}
        <div className="flex items-center gap-3">
          {userName ? (
            <div className="hidden items-center gap-1.5 text-xs text-slate-300 sm:flex">
              <User className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-medium text-white">{userName}</span>
            </div>
          ) : null}
          <div className="rounded-lg bg-slate-800 p-1 border border-slate-700">
            <LanguagePicker />
          </div>

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white md:hidden"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Navigation Sub-bar (Priority Navigation Tabs) */}
      <nav className="border-t border-slate-800/80 bg-slate-950/80 px-4">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto py-1.5">
          {links.map((l) => {
            const isActive =
              pathname === l.href ||
              (l.href !== "/app" && pathname.startsWith(l.href));
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-blue-600 text-white shadow-xs font-semibold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {getIcon(l.href)}
                <span>{l.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile Collapsible Navigation Menu */}
      {mobileMenuOpen && (
        <div className="border-t border-slate-800 bg-slate-900 px-4 py-3 md:hidden">
          <form onSubmit={handleQuickSearchSubmit} className="mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder="Search barcode or serial..."
                className="w-full rounded-lg bg-slate-800 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-400 border border-slate-700 focus:outline-none"
              />
            </div>
          </form>
          <div className="grid grid-cols-2 gap-1.5">
            {links.map((l) => {
              const isActive =
                pathname === l.href ||
                (l.href !== "/app" && pathname.startsWith(l.href));
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                    isActive
                      ? "bg-blue-600 text-white font-semibold"
                      : "bg-slate-800/80 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {getIcon(l.href)}
                  <span className="truncate">{l.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
