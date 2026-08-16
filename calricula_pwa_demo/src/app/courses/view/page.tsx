import { Suspense } from 'react';
import { CourseViewRouteScreen, CourseLoading } from '@/components/courses';

export default function CourseViewPage() {
  return (
    <Suspense fallback={<CourseLoading label="Opening the Course Outline of Record…" />}>
      <CourseViewRouteScreen />
    </Suspense>
  );
}
