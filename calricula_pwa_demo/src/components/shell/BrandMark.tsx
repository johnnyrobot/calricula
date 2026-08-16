import Link from "next/link";

interface BrandMarkProps {
  href?: string;
  inverse?: boolean;
  compact?: boolean;
}

export function BrandMark({
  href = "/",
  inverse = false,
  compact = false,
}: BrandMarkProps) {
  return (
    <Link
      className="brand-lockup"
      href={href}
      aria-label="Calricula home"
      style={inverse ? { color: "var(--on-navy)" } : undefined}
    >
      <span className="brand-crest" aria-hidden="true">
        C
      </span>
      <span>
        <span className="brand-wordmark">Calricula</span>
        {!compact && (
          <span className="brand-subtitle">Curriculum of record</span>
        )}
      </span>
    </Link>
  );
}
