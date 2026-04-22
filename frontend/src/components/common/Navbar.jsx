import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

const navLinks = [
  { name: "Charters", path: "/" },
  { name: "Harbors", path: "/harbors" },
  { name: "Events", path: "/events" },
  { name: "Concierge", path: "/concierge" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isActive = (path) => location.pathname === path;

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 h-[68px] px-6 md:px-10 flex items-center justify-between transition-all duration-300 ${
          scrolled
            ? "bg-white shadow-sm"
            : "bg-transparent"
        }`}
      >
        {/* Logo */}
        <Link
          to="/"
          className={`font-serif text-xl font-semibold tracking-tight transition-colors ${
            scrolled ? "text-navy" : "text-white"
          }`}
        >
          Water City Rental
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-2">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`relative px-4 py-2 text-sm font-medium transition-colors ${
                scrolled
                  ? isActive(link.path)
                    ? "text-primary"
                    : "text-muted hover:text-navy"
                  : isActive(link.path)
                  ? "text-white"
                  : "text-white/80 hover:text-white"
              }`}
            >
              {link.name}
              {isActive(link.path) && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary rounded-full" />
              )}
            </Link>
          ))}
        </div>

        {/* Right: User Icon + Book Now */}
        <div className="hidden md:flex items-center gap-3">
          <button
            className={`p-2 rounded-full transition-colors ${
              scrolled ? "text-navy hover:bg-surface" : "text-white hover:bg-white/10"
            }`}
            aria-label="User account"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" strokeLinecap="round" />
            </svg>
          </button>
          <button className="bg-primary text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-[#b05530] transition-colors shadow-sm">
            Book Now
          </button>
        </div>

        {/* Mobile Hamburger */}
        <button
          className="md:hidden p-2"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={scrolled ? "#1A1A2E" : "#fff"} strokeWidth="2">
            <line x1="4" y1="7" x2="20" y2="7" strokeLinecap="round" />
            <line x1="4" y1="12" x2="20" y2="12" strokeLinecap="round" />
            <line x1="4" y1="17" x2="20" y2="17" strokeLinecap="round" />
          </svg>
        </button>
      </nav>

      {/* Mobile Drawer */}
      <div
        className={`md:hidden fixed inset-0 z-[100] transition-opacity ${
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => setDrawerOpen(false)}
        />

        {/* Drawer Panel */}
        <div
          className={`absolute top-0 right-0 h-full w-80 max-w-[85vw] bg-white shadow-2xl transition-transform duration-300 ${
            drawerOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between p-6 border-b border-[#f0ece8]">
            <span className="font-serif text-lg font-semibold text-navy">Water City Rental</span>
            <button
              onClick={() => setDrawerOpen(false)}
              className="p-2 text-muted hover:text-navy"
              aria-label="Close menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
                <line x1="6" y1="18" x2="18" y2="6" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col p-6 gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setDrawerOpen(false)}
                className={`px-4 py-3 text-base font-medium rounded-lg transition-colors ${
                  isActive(link.path)
                    ? "bg-surface text-primary"
                    : "text-dark hover:bg-surface"
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-[#f0ece8] space-y-3">
            <button className="w-full bg-primary text-white py-3 rounded-full text-sm font-semibold hover:bg-[#b05530] transition-colors">
              Book Now
            </button>
            <button className="w-full border border-[#e8e4df] text-dark py-3 rounded-full text-sm font-medium hover:bg-surface transition-colors">
              Sign In
            </button>
          </div>
        </div>
      </div>
    </>
  );
}