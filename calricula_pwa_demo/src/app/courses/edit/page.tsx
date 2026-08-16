import { Suspense } from 'react';
import { CourseEditRouteScreen, CourseLoading } from '@/components/courses';

export default function CourseEditPage() {
  return (
    <Suspense fallback={<CourseLoading label="Preparing the course editor…" />}>
      <CourseEditRouteScreen />
    </Suspense>
  );
}
