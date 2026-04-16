"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import { LENSES } from "@/lib/constants";
import type { Lens } from "@/lib/types";

const dropdownMenuContentClass =
  "z-50 min-w-[12rem] overflow-hidden rounded-md border border-neutral-200 bg-white p-1 shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";
const dropdownMenuItemClass =
  "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-neutral-100 data-[highlighted]:bg-neutral-100";

export function ControlBar({
  currentLens,
  onLensChange,
}: {
  currentLens: Lens;
  onLensChange: (lens: Lens) => void;
}) {
  const t = useTranslations("lens");
  const tLang = useTranslations("language");
  const locale = useLocale();

  return (
    <header className="absolute left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-neutral-200 bg-neutral-50/95 px-6 shadow-sm backdrop-blur">
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-neutral-900 hover:text-neutral-700"
        >
          Opportunity Atlas
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
              aria-label={t("label")}
            >
              {t(currentLens.labelKey)}
              <span className="text-neutral-400" aria-hidden>
                ▼
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className={dropdownMenuContentClass}>
            {LENSES.map((lens) => (
              <DropdownMenuItem
                key={lens.id}
                className={dropdownMenuItemClass}
                onSelect={() => onLensChange(lens)}
              >
                {t(lens.labelKey)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          Home
        </Link>
        <nav className="flex items-center gap-1" aria-label={tLang("label")}>
        <Link
          href="/map"
          locale="en"
          className={`rounded px-2 py-1 text-sm font-medium ${locale === "en" ? "bg-neutral-100 text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"}`}
        >
          {tLang("en")}
        </Link>
        <Link
          href="/map"
          locale="nl"
          className={`rounded px-2 py-1 text-sm font-medium ${locale === "nl" ? "bg-neutral-100 text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"}`}
        >
          {tLang("nl")}
        </Link>
      </nav>
      </div>
    </header>
  );
}
