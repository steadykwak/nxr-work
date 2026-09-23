import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'NXR Work', description: '업무와 미팅을 한곳에서' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
