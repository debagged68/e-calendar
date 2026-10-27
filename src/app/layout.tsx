import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Our Family Calendar', description: 'Everything that matters, together.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html> }
