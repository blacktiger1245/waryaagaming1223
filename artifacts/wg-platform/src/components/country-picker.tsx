import { useState, useEffect, useRef } from "react";
import { Search, ChevronDown } from "lucide-react";
import { COUNTRIES, countryCodeToFlag } from "@/lib/countries";

/**
 * Searchable country picker with flag preview.
 *
 * Shared by the one-time onboarding flow and the self-service profile editor so
 * both present the exact same country list, search behaviour and flag render.
 */
export function CountryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const selected = COUNTRIES.find((c) => c.name === value);
  const flag = selected ? countryCodeToFlag(selected.code) : null;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5 text-sm transition-colors hover:border-primary/50 focus:outline-none focus:border-primary"
      >
        {flag && <span className="text-xl leading-none">{flag}</span>}
        <span className={`flex-1 text-left ${value ? "text-foreground" : "text-muted-foreground"}`}>
          {value || "Select your country…"}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-md border border-border bg-background shadow-xl overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              placeholder="Search country…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          {/* List */}
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">No results</li>
            ) : (
              filtered.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => { onChange(c.name); setOpen(false); setSearch(""); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-primary/10 hover:text-primary
                      ${value === c.name ? "bg-primary/10 text-primary font-bold" : ""}`}
                  >
                    <span className="text-lg leading-none">{countryCodeToFlag(c.code)}</span>
                    {c.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
