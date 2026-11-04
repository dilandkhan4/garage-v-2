import './globals.css';
import { getLocale } from '@/lib/i18n';
import PWA from '@/components/PWA';
export const metadata = {
  title: { default: 'AutoCare Garage Network', template: '%s | AutoCare' },
  description: 'Vehicle repair, spare parts and technical training.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};
export const viewport = { themeColor: '#0f3d6e', width: 'device-width', initialScale: 1 };
export default async function Root({ children }) {
  const locale = await getLocale();
  return (<html lang={locale}><body>{children}<PWA /></body></html>);
}
