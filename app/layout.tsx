import type { Metadata, Viewport } from 'next'
import { Noto_Sans_KR } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { PopupModal } from '@/components/popup-modal'
import './globals.css'

const notoSansKR = Noto_Sans_KR({
  weight: ['300', '400', '500', '700', '900'],
  display: 'swap',
  preload: false,
})

// metadataBase가 있어야 하위 페이지의 상대 OG 이미지 경로가 절대 URL로 확장된다.
const SITE_URL = process.env.APP_URL || 'https://www.puholdings.co.kr'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: '(주)포항연합기술지주 | PU Holdings',
  description: 'POSTECH 기술사업화를 선도하는 포항연합기술지주 - 혁신 기술 스타트업 투자 및 육성',
  keywords: ['포항연합기술지주', 'PU Holdings', 'POSTECH', '기술지주', '벤처투자', '스타트업', '포항 창업보육센터', '한동대 창업보육센터'],
  alternates: { canonical: '/' },
  openGraph: {
    title: '(주)포항연합기술지주 | PU Holdings',
    description: 'POSTECH 기술사업화를 선도하는 포항연합기술지주',
    type: 'website',
    locale: 'ko_KR',
    siteName: '(주)포항연합기술지주',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: '(주)포항연합기술지주 | PU Holdings',
    description: 'POSTECH 기술사업화를 선도하는 포항연합기술지주',
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
    <html lang="ko" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={`${notoSansKR.className} antialiased`}>
        {children}
        <PopupModal />
        <Analytics />
      </body>
    </html>
  )
}
