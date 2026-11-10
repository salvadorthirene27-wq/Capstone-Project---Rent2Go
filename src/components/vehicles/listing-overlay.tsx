"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";

export function ListingFilters({children}: {children: ReactNode}) {
  const details = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  function close(focus = false) {
    if (details.current) details.current.open = false;
    if (focus) trigger.current?.focus();
  }
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!details.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return <details ref={details} className="agency-listing-filter"
    onKeyDown={event => { if (event.key === "Escape" && details.current?.open) { event.stopPropagation(); close(true); } }}>
    <summary ref={trigger} className="button secondary"><span className="agency-filter-label"><SlidersHorizontal size={19} aria-hidden="true"/>Filters</span></summary>
    <div className="agency-filter-popup">
      <div className="agency-overlay-heading"><h2>Filters</h2><button type="button" onClick={() => close(true)}>Cancel</button></div>
      {children}
    </div>
  </details>;
}

export function ListingEditDialog({children, backHref, title}: {children: ReactNode; backHref: string; title: string}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);
  return <dialog ref={dialog} className="agency-edit-dialog" aria-labelledby="agency-edit-title"
    onCancel={event => { event.preventDefault(); back.current?.click(); }}>
    <header className="agency-overlay-heading">
      <h2 id="agency-edit-title">{title}</h2>
      <Link ref={back} href={backHref} replace scroll={false}>Cancel</Link>
    </header>
    {children}
  </dialog>;
}
