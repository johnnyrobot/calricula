import type { ReactNode } from "react";

interface MetricPanelProps {
  label: string;
  value: number | string;
  suffix?: string;
  detail: ReactNode;
}

export function MetricPanel({
  label,
  value,
  suffix,
  detail,
}: MetricPanelProps) {
  return (
    <article className="metric-panel">
      <p className="metric-label">{label}</p>
      <p className="metric-value">
        {value}
        {suffix && <small> {suffix}</small>}
      </p>
      <p className="metric-detail">{detail}</p>
    </article>
  );
}
