"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Bell, Building2, CalendarDays, CarFront, ChevronRight, Search, ShieldCheck, Trash2, Wallet } from "lucide-react";
import type { NotificationInbox } from "@/modules/notifications/service";
import { notificationLabels } from "@/modules/notifications/presentation";
import { date } from "@/modules/partners/presentation";

type Query = NotificationInbox["filters"];
type Target = Pick<NotificationInbox["items"][number], "source" | "id">;
const icons = { PARTNER: Building2, BOOKING: CalendarDays, FINANCE: Wallet, VEHICLE: CarFront, REMITTANCE: Wallet, GOVERNANCE: ShieldCheck };
const tabs = { ALL: "All", UNREAD: "Unread", READ: "Read", DELETED: "Deleted" } as const;

function relativeDate(value: string, reference: string) {
  const minutes = Math.floor((Date.parse(reference) - Date.parse(value)) / 60_000);
  if (minutes <= 0) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  return date(value);
}

export function FullNotificationInbox({ data, disabled, busy, feedback, pagination, onFilter, onAction, onRead }: {
  data: NotificationInbox | null;
  disabled: boolean;
  busy: boolean;
  feedback: ReactNode;
  pagination: ReactNode;
  onFilter: (query: Partial<Query>) => void;
  onAction: (action: string, options?: { item: Target }) => void;
  onRead: (item: Target) => void;
}) {
  const [search, setSearch] = useState(data?.filters.search ?? "");
  const selected = data?.filters.status ?? "ALL";
  const counts = { ALL: data ? data.unread + data.read : undefined, UNREAD: data?.unread, READ: data?.read, DELETED: undefined };

  return <section className="figma-panel full-inbox" aria-labelledby="full-inbox-title" aria-busy={busy}>
    <h1 id="full-inbox-title">Notifications</h1>
    <div className="full-inbox-toolbar">
      <div className="full-inbox-filters" role="group" aria-label="Filter notifications">
        {(Object.keys(tabs) as (keyof typeof tabs)[]).map(status =>
          <button type="button" key={status} aria-pressed={selected === status} disabled={disabled}
            onClick={() => onFilter({ status })}>{tabs[status]}{counts[status] !== undefined && <span>{counts[status]}</span>}</button>)}
      </div>
      <form className="full-inbox-search" onSubmit={event => { event.preventDefault(); onFilter({ search: search.trim() || undefined }); }}>
        <button type="submit" disabled={disabled} aria-label="Search notifications"><Search size={18}/></button>
        <input type="search" value={search} disabled={disabled} aria-label="Search notifications" maxLength={120}
          placeholder="Search notifications…" onChange={event => setSearch(event.target.value)}/>
      </form>
      {selected !== "DELETED" && <button className="full-inbox-text-action" type="button" disabled={disabled || !data?.unread}
        onClick={() => onAction("MARK_ALL_READ")}>Mark all as read</button>}
    </div>
    {feedback}
    <div className="full-inbox-list">
      {data && !data.items.length && <div className="notification-empty"><Bell size={26} aria-hidden="true"/>
        <p>{data.filters.search ? "No matching notifications." : selected === "UNREAD" ? "You’re all caught up." : selected === "DELETED" ? "No deleted notifications." : "No notifications in this view."}</p>
      </div>}
      {data?.items.map(item => {
        const Icon = icons[item.source], label = notificationLabels[item.source], target = { source: item.source, id: item.id };
        return <article className="full-inbox-row" key={`${item.source}:${item.id}`}>
          <span className="full-inbox-kind"><Icon size={23} aria-hidden="true"/></span>
          <div className="full-inbox-row-copy"><h2>{label}</h2><p>{item.message}</p></div>
          <time dateTime={item.createdAt} title={date(item.createdAt)}>{relativeDate(item.createdAt,data.preparedAt)}</time>
          <div className="full-inbox-row-actions">
            {selected === "DELETED" ? <button type="button" className="full-inbox-text-action" disabled={disabled}
              onClick={() => onAction("RESTORE_ONE",{ item: target })}>Restore</button> : <>
              {!item.readAt && <button className="notification-icon" type="button" disabled={disabled}
                aria-label={`Mark ${label} as read`} title="Mark as read" onClick={() => onRead(target)}><span className="full-inbox-dot"/></button>}
              <button type="button" className="notification-icon full-inbox-delete" disabled={disabled}
                aria-label={`Delete notification: ${label}`} onClick={() => onAction("DELETE_ONE",{ item: target })}><Trash2 size={17} aria-hidden="true"/></button>
              {item.link && <Link className="notification-icon" href={item.link} aria-label={`Open ${label}`}><ChevronRight size={18} aria-hidden="true"/></Link>}
            </>}
          </div>
        </article>;
      })}
    </div>
    {pagination}
    <footer className="full-inbox-footer">
      <Link href="/workspace/account#notification-preferences">Notification preferences</Link>
      {selected !== "DELETED" && <button className="full-inbox-text-action" type="button" disabled={disabled || !data?.read}
        onClick={() => onAction("DELETE_READ")}>Delete read</button>}
    </footer>
  </section>;
}
