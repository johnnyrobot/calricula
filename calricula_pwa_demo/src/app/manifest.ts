import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard/',
    name: 'Calricula Curriculum Demo',
    short_name: 'Calricula',
    description:
      'A local-first curriculum authoring and compliance demonstration for California community colleges.',
    start_url: '/dashboard/',
    scope: '/',
    display: 'standalone',
    background_color: '#F7F3E9',
    theme_color: '#1F2A44',
    orientation: 'any',
    lang: 'en-US',
    categories: ['education', 'productivity'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
