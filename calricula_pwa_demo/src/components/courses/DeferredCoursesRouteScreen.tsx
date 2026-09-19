'use client';

import dynamic from 'next/dynamic';

import { CourseCatalogHeader } from './CourseCatalogHeader';
import { CourseLoading } from './CoursePrimitives';

const CoursesRouteScreen = dynamic(
  () =>
    import('./CourseRouteScreens').then(
      (module) => module.CoursesRouteScreen,
    ),
  {
    loading: () => (
      <>
        <CourseCatalogHeader />
        <CourseLoading label="Opening the course catalog…" />
      </>
    ),
    ssr: false,
  },
);

export function DeferredCoursesRouteScreen() {
  return <CoursesRouteScreen />;
}
