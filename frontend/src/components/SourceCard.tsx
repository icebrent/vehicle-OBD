import type { ReactNode } from "react";
export function SourceCard({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <section
      className={`panel controls workspace-source-card ${className}`}
      aria-label={label}
    >
      {children}
    </section>
  );
}
