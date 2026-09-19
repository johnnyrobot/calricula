import { FilePlus2 } from 'lucide-react';
import Link from 'next/link';

export function CourseCatalogHeader({
  courseCount,
}: {
  courseCount?: number;
}) {
  return (
    <header className="mb-7 flex flex-col gap-5 border-b border-hairline-strong pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.17em] text-gold-ink">
          Curriculum catalog
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Course Outlines of Record
        </h1>
        <p
          aria-live="polite"
          className="mt-2 min-h-5 font-sans text-sm text-muted"
        >
          {courseCount == null
            ? 'Opening the local curriculum workspace…'
            : `${courseCount} ${
                courseCount === 1 ? 'outline' : 'outlines'
              } in the local curriculum workspace`}
        </p>
      </div>
      <Link href="/courses/new/" className="luminous-button-primary self-start sm:self-auto">
        <FilePlus2 aria-hidden="true" className="h-4 w-4" />
        New course
      </Link>
    </header>
  );
}
