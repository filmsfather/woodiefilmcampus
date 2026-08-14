import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import ClientClockInitializer from "@/components/ClientClockInitializer"
import DateUtil from "@/lib/date-util"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { Toaster } from "sonner"

import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "woodiefilmcampus",
  description: "Woodie Film Campus internal platform",
  // 학습일지 등 원문이 그대로 전달되어야 하는 화면이 브라우저 자동 번역으로 변형되는 것을 막는다.
  other: {
    google: "notranslate",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  DateUtil.clearServerClock()
  DateUtil.initServerClock()
  const serverNow = DateUtil.nowUTC().toISOString()

  return (
    <html lang="ko" translate="no" className="notranslate">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-slate-50 antialiased`}>
        <ClientClockInitializer serverNow={serverNow} />
        {children}
        <SpeedInsights />
        <Toaster />
      </body>
    </html>
  )
}
