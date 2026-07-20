import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Bitter, Fredoka } from 'next/font/google'
import { AppProvider } from '@/lib/context'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
})

const bitter = Bitter({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['600', '700', '800', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
})

// Playful rounded display font used only for the student portal's headings —
// kept separate from --font-serif (Bitter) so the teacher portal's paper/ink
// aesthetic is untouched.
const fredoka = Fredoka({
  subsets: ['latin'],
  variable: '--font-kid',
  weight: ['500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'EduTeach — AI Teacher Companion',
  description: 'AI Teacher Companion for Government & NGO Schools',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'EduTeach',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1d4ed8',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${bitter.variable} ${fredoka.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  )
}
