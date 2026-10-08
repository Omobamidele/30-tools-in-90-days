"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { Search } from "@/ui/icons";
import type { SearchHit } from "@/services/search";
import { searchAction } from "../../../app/(app)/search-action";

type Nav = { label: string; href: string; keywords?: string };

const kindLabel: Record<SearchHit["kind"], string> = { event: "Event", client: "Client", supplier: "Supplier", contract: "Contract", change: "Change" };

// ⌘K / Ctrl+K: jump to any record or start common actions (docs/04 §4). Also "/" from anywhere.
export function CommandMenu({ nav, actions }: { nav: Nav[]; actions: Nav[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable;
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Loading starts in the change handler; the effect only runs the debounced search.
  function changeQuery(v: string) {
    setQ(v);
    setLoading(v.trim().length >= 2);
  }

  useEffect(() => {
    const n = ++seq.current;
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      const res = await searchAction(q);
      if (n !== seq.current) return;
      setLoading(false);
      setHits(res.ok ? res.data : []);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  // Short queries show nothing, without clearing state inside the effect.
  const shown = q.trim().length >= 2 ? hits : [];

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full items-center gap-2 rounded-control border border-white/15 bg-white/5 px-2.5 text-table text-on-midnight-muted transition-colors hover:border-white/30 hover:bg-white/10"
      >
        <Search size={15} aria-hidden />
        <span className="flex-1 truncate text-left">Search…</span>
        <kbd className="hidden rounded-[4px] border border-white/20 px-1 font-sans text-[11px] font-medium text-on-midnight-muted sm:inline">
          Ctrl K
        </kbd>
      </button>
      <D.Root open={open} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-ink/30" />
          <D.Content aria-describedby={undefined} className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden panel shadow-pop">
            <D.Title className="sr-only">Search and commands</D.Title>
            <Command shouldFilter={false} label="Search and commands">
              <div className="flex items-center gap-2 border-b border-rule px-3">
                <Search size={16} className="text-muted" aria-hidden />
                <Command.Input value={q} onValueChange={changeQuery} placeholder="Search events, contracts, clients, suppliers, CR-12…" className="h-11 w-full bg-transparent text-body outline-none" />
              </div>
              <Command.List className="max-h-[55vh] overflow-y-auto p-1.5">
                {q.trim().length >= 2 && !loading && shown.length === 0 ? <Command.Empty className="px-3 py-6 text-center text-table text-muted">Nothing matches “{q}”.</Command.Empty> : null}
                {shown.length ? (
                  <Command.Group heading="Results" className="text-meta text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
                    {shown.map((h) => (
                      <Command.Item key={`${h.kind}-${h.id}`} value={`${h.kind}-${h.id}`} onSelect={() => go(h.href)} className="flex cursor-pointer items-center gap-3 rounded-control px-2 py-1.5 text-table text-ink data-[selected=true]:bg-sunken">
                        <span className="w-16 shrink-0 text-meta text-muted">{kindLabel[h.kind]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{h.title}</span>
                          <span className="block truncate text-meta text-muted">{h.subtitle}</span>
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}
                {q.trim().length < 2 ? (
                  <>
                    <Command.Group heading="Actions" className="text-meta text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
                      {actions.map((a) => (
                        <Command.Item key={a.href} value={a.label} onSelect={() => go(a.href)} className="cursor-pointer rounded-control px-2 py-1.5 text-table text-ink data-[selected=true]:bg-sunken">
                          {a.label}
                        </Command.Item>
                      ))}
                    </Command.Group>
                    <Command.Group heading="Go to" className="text-meta text-muted [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
                      {nav.map((a) => (
                        <Command.Item key={a.href} value={`go ${a.label}`} onSelect={() => go(a.href)} className="cursor-pointer rounded-control px-2 py-1.5 text-table text-ink data-[selected=true]:bg-sunken">
                          {a.label}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  </>
                ) : null}
              </Command.List>
            </Command>
          </D.Content>
        </D.Portal>
      </D.Root>
    </>
  );
}
