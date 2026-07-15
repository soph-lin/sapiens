"use client";

import { ShoppingBag, Sparkles, X } from "lucide-react";

type ShopPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

const SHOP_ITEMS = [
  { name: "Star chart", description: "A map for curious eyes.", price: 25 },
  { name: "Comet trail", description: "Leave a little light behind.", price: 50 },
  { name: "Moon lamp", description: "A soft glow for quiet nights.", price: 75 },
];

export default function ShopPanel({ isOpen, onClose }: ShopPanelProps) {
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

      <div className="mt-5 space-y-2">
        {SHOP_ITEMS.map((item) => (
          <button
            key={item.name}
            type="button"
            disabled
            className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 px-4 py-3 text-left opacity-75 transition hover:border-cyan-100/25 disabled:cursor-not-allowed"
          >
            <span>
              <span className="block text-sm">{item.name}</span>
              <span className="mt-0.5 block text-xs text-cyan-100/45">
                {item.description}
              </span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-cyan-100/60">
              {item.price} ✦
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
