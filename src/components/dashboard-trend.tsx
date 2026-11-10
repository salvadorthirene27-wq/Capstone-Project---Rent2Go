import { money } from "@/modules/partners/presentation";

const dateLabel = new Intl.DateTimeFormat("en-PH", { month:"short", day:"numeric", timeZone:"UTC" });

export function DashboardTrend({ points, label, currency = false }: {
  points: { day: string; amount: number }[];
  label: string;
  currency?: boolean;
}) {
  const max = Math.max(1, ...points.map(point=>point.amount));
  const positions = points.map(({day, amount}, index) => ({
    day: dateLabel.format(new Date(`${day}T00:00:00Z`)),
    value: currency ? money(amount) : String(amount),
    x: 10 + index * 130,
    y: 105 - amount * 86 / max,
  }));
  return <figure className="figma-trend">
    <figcaption>{label}</figcaption>
    <svg aria-hidden="true" viewBox="0 0 800 115" preserveAspectRatio="none">
      {[19,40,62,84,105].map(y=><line className="figma-trend-grid" key={y} x1={10} x2={790} y1={y} y2={y}/>)}
      <polyline points={positions.map(({x,y})=>`${x},${y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
      {positions.map(({day,x,y})=><circle key={day} cx={x} cy={y} r="4" fill="currentColor"/>)}
    </svg>
    <ul>{positions.map(({day,value})=><li key={day}><span>{day}</span><strong>{value}</strong></li>)}</ul>
  </figure>;
}
