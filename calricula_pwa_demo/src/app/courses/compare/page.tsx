import { Suspense } from 'react';
import { CourseCompareRouteScreen, CourseLoading } from '@/components/courses';

export default function CourseComparePage() {
  return (
    <Suspense fallback={<CourseLoading label="Preparing the version comparison…" />}>
      <CourseCompareRouteScreen />
    </Suspense>
  );
}
