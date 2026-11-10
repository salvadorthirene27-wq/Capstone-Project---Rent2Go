import type { ReactNode } from "react";

export function DashboardMetrics({
  items,
  children,
}: {
  items: { label: string; value: string | number }[];
  children?: ReactNode;
}) {
  return (
    <section className="figma-dashboard-board" aria-label="Dashboard summary">
      <dl className="figma-metrics">
        {items.map(({ label, value }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}
