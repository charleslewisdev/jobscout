import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

const allNavItems = [
  { to: "/", label: "Dashboard", icon: "~", adminOnly: false, userOnly: false },
  { to: "/matches", label: "Matches", icon: "#", adminOnly: false, userOnly: false },
  { to: "/my-profile", label: "My Profile", icon: "@", adminOnly: false, userOnly: true },
  { to: "/candidates", label: "Candidates", icon: "@", adminOnly: true, userOnly: false },
  { to: "/pipeline", label: "Pipeline", icon: ">", adminOnly: true, userOnly: false },
  { to: "/sources", label: "Sources", icon: "%", adminOnly: false, userOnly: false },
  { to: "/portland-guide", label: "Portland", icon: "!", adminOnly: false, userOnly: false },
  { to: "/users", label: "Users", icon: "&", adminOnly: true, userOnly: false },
];

function useScrollDirection(ref: React.RefObject<HTMLElement | null>) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  const onScroll = useCallback(() => {
    if (ticking.current || !ref.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) { ticking.current = false; return; }
      const y = el.scrollTop;
      const delta = y - lastY.current;
      if (delta > 10 && y > 60) setHidden(true);
      else if (delta < -5) setHidden(false);
      lastY.current = y;
      ticking.current = false;
    });
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref, onScroll]);

  return hidden;
}

export function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const navHidden = useScrollDirection(mainRef);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleItems = allNavItems.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.userOnly || !isAdmin),
  );

  // Scroll active tab into view on route change
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const active = container.querySelector("[data-active='true']");
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar — hidden on mobile */}
      <nav className="hidden md:flex w-56 shrink-0 border-r border-slate-800/80 bg-slate-925 flex-col">
        <div className="p-5 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 32 24" fill="none" className="w-8 h-6 shrink-0" aria-hidden="true">
              <circle cx="10" cy="11" r="7" stroke="#f5a623" strokeWidth="2" fill="none"/>
              <circle cx="22" cy="11" r="7" stroke="#f5a623" strokeWidth="2" fill="none"/>
              <circle cx="10" cy="11" r="1.5" fill="#fbbf24"/>
              <circle cx="22" cy="11" r="1.5" fill="#fbbf24"/>
              <path d="M13.5 5.5Q16 3.5 18.5 5.5" stroke="#f5a623" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>
            <div>
              <h1 className="font-mono text-lg font-medium tracking-tight text-amber-450 leading-none">
                JobScout
              </h1>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                portland job matcher
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 py-3 flex flex-col gap-0.5">
          {visibleItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "text-amber-400 bg-amber-400/[0.06] border-r-2 border-amber-400"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`
              }
            >
              <span className="font-mono text-xs w-4 text-center opacity-60">
                {icon}
              </span>
              {label}
            </NavLink>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800/80">
          {user && (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs text-slate-300 font-medium truncate">
                  {user.name}
                </p>
                <p className="text-[10px] text-slate-600 font-mono">
                  {user.role}
                </p>
              </div>
              <button
                onClick={logout}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors font-mono shrink-0 ml-2"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Main content */}
      <main ref={mainRef} className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <div className="max-w-6xl mx-auto p-4 md:p-6">
          <Outlet />
        </div>
      </main>

      {/* Bottom tab bar — mobile only */}
      <nav
        className={`md:hidden fixed bottom-0 left-0 right-0 bg-slate-925/95 backdrop-blur-sm border-t border-slate-800/80 z-50 transition-transform duration-300 ${
          navHidden ? "translate-y-full" : "translate-y-0"
        }`}
      >
        <div
          ref={scrollRef}
          className="flex overflow-x-auto scrollbar-none"
        >
          {visibleItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `shrink-0 flex flex-col items-center gap-0.5 px-4 py-2.5 text-[10px] transition-colors ${
                  isActive
                    ? "text-amber-400"
                    : "text-slate-500 active:text-slate-300"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className="font-mono text-sm" data-active={isActive}>{icon}</span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
