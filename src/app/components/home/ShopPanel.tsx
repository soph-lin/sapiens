"use client";

import { useMemo, useState } from "react";
import { Search, ShoppingBag, Sparkles, X } from "lucide-react";
import Image from "next/image";
import { getShopDisplayAssetPath, SHOP_ITEM_GROUPS } from "@/lib/game";

type ShopPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function ShopPanel({ isOpen, onClose }: ShopPanelProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredGroups = useMemo(
    () =>
      SHOP_ITEM_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (!normalizedQuery) return true;
          return [item.name, item.description, group.label, item.assetPath]
            .join(" ")
            .toLocaleLowerCase()
            .includes(normalizedQuery);
        }),
      })).filter((group) => group.items.length > 0),
    [normalizedQuery],
  );
  const resultCount = filteredGroups.reduce(
    (count, group) => count + group.items.length,
    0,
  );

  return (
    <aside
      id="shop-panel"
      aria-label="Shop"
      aria-hidden={!isOpen}
      className={`pointer-events-auto fixed right-4 top-4 z-20 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-cyan-100/15 bg-slate-950/95 p-5 text-cyan-50 shadow-2xl shadow-black/50 backdrop-blur-xl transition duration-300 sm:right-8 sm:top-8 ${
        isOpen
          ? "translate-y-0 opacity-100"
          : "pointer-events-none -translate-y-3 opacity-0"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-cyan-200/60">
            <ShoppingBag size={15} aria-hidden />
            <p className="text-[0.65rem] uppercase tracking-[0.22em]">Shop</p>
          </div>
          <h2 className="text-xl tracking-tight">Small wonders</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close shop"
          className="rounded-full p-1.5 text-cyan-100/55 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-200/70"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl border border-cyan-100/10 bg-cyan-100/[0.06] px-4 py-3">
        <span className="text-sm text-cyan-100/65">Stardust</span>
        <span className="flex items-center gap-2 text-lg tabular-nums">
          <Sparkles size={17} className="text-fuchsia-200" aria-hidden />
          0
        </span>
      </div>

      <div className="relative mt-5">
        <Search
          size={16}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-100/45"
        />
        <label htmlFor="shop-item-search" className="sr-only">
          Search shop items
        </label>
        <input
          id="shop-item-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search little wonders"
          autoComplete="off"
          className="w-full rounded-xl border border-cyan-100/10 bg-cyan-100/[0.06] py-2.5 pl-9 pr-10 text-sm text-cyan-50 outline-none placeholder:text-cyan-100/35 focus:border-cyan-100/35 focus:ring-2 focus:ring-cyan-200/20"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear item search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-cyan-100/45 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-200/70"
          >
            <X size={15} aria-hidden />
          </button>
        ) : null}
      </div>

      <p
        className="mt-2 text-[0.65rem] text-cyan-100/35"
        aria-live="polite"
      >
        {resultCount} {resultCount === 1 ? "item" : "items"}
      </p>

      <div className="scrollbar-no-track mt-3 max-h-[min(52vh,34rem)] space-y-6 overflow-y-auto pr-1">
        {filteredGroups.map((group) => (
          <section key={group.category} aria-labelledby={`${group.category}-heading`}>
            <h3
              id={`${group.category}-heading`}
              className="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-cyan-100/45"
            >
              {group.label}
            </h3>
            <div className="space-y-2">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled
                  aria-label={`${item.name}, ${item.price} Stardust. Purchasing coming soon.`}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/10 px-3 py-2 text-left opacity-75 transition hover:border-cyan-100/25 disabled:cursor-not-allowed"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                    <Image
                      src={getShopDisplayAssetPath(item)}
                      alt=""
                      width={40}
                      height={40}
                      className="size-10 object-contain"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{item.name}</span>
                    <span className="mt-0.5 block text-xs leading-4 text-cyan-100/45">
                      {item.description}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-cyan-100/60">
                    {item.price} ✦
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
        {resultCount === 0 ? (
          <div className="rounded-xl border border-dashed border-cyan-100/15 px-4 py-7 text-center">
            <p className="text-sm text-cyan-50/80">No little wonders found.</p>
            <p className="mt-1 text-xs text-cyan-100/40">
              Try a different constellation of letters.
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-4 rounded-full border border-cyan-100/20 px-3 py-1.5 text-xs text-cyan-100/70 transition hover:border-cyan-100/45 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-200/70"
            >
              Clear search
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
