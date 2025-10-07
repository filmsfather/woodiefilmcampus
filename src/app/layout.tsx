import Link from "next/link"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import ClientClockInitializer from "@/components/ClientClockInitializer"
import DateUtil from "@/lib/date-util"

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
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} bg-slate-50 antialiased`}>
        <ClientClockInitializer serverNow={serverNow} />
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center px-4 py-3">
              <Link href="/dashboard" className="text-lg font-semibold text-slate-900 hover:text-slate-600">
                woodiefilmcampus
              </Link>
            </div>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  )
}
