import type { Metadata, Viewport } from 'next'
import { Noto_Sans_KR, Geist } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700', '900'],
  display: 'swap',
})

const _geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '(주)포항연합기술지주 | PU Holdings',
  description: 'POSTECH 기술사업화를 선도하는 포항연합기술지주 - 혁신 기술 스타트업 투자 및 육성',
  keywords: ['포항연합기술지주', 'PU Holdings', 'POSTECH', '기술지주', '벤처투자', '스타트업'],
  openGraph: {
    title: '(주)포항연합기술지주 | PU Holdings',
    description: 'POSTECH 기술사업화를 선도하는 포항연합기술지주',
    type: 'website',
    locale: 'ko_KR',
  },
}

export const viewport: Viewport = {
  themeColor: '#1a1a2e',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${notoSansKR.className} antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
