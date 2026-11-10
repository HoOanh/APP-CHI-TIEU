import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'ARC Irobot · Quản lý chi tiêu',
    short_name: 'ARC Irobot',
    description: 'Ghi chép và quản lý chi tiêu cá nhân',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone'],
    background_color: '#f1f5f9',
    theme_color: '#00b878',
    lang: 'vi',
    icons: [
      {
        src: '/pwa-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
