import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import Link from "next/link";

export function StatusScreen({ code, title, detail, children }: {
  code: number;
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return <main id="main-content" className="figma-error">
    <p className="figma-error-code">Rent2Go · Status {code}</p>
    <div className="figma-error-banner">
      <span aria-hidden="true">{code}</span>
      <h1>{title} <CircleAlert aria-hidden="true" size={25}/></h1>
    </div>
    <div className="figma-error-detail">
      <p>{detail}</p>
      <div className="actions">{children}</div>
    </div>
    <div className="figma-error-help"><Link href="/help">Rent2Go help center</Link></div>
  </main>;
}
