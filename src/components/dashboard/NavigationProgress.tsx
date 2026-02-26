"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

export function NavigationProgress() {
  const pathname = usePathname()
  const [isNavigating, setIsNavigating] = useState(false)
  const prevPathRef = useRef(pathname)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      setIsNavigating(false)
      prevPathRef.current = pathname
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [pathname])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a")
      if (!anchor) return

      const href = anchor.getAttribute("href")
      if (!href) return

      if (
        href.startsWith("http") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        anchor.hasAttribute("download") ||
        anchor.getAttribute("target") === "_blank"
      ) {
        return
      }

      try {
        const url = new URL(href, window.location.origin)
        if (url.pathname !== pathname) {
          setIsNavigating(true)
          timeoutRef.current = setTimeout(() => setIsNavigating(false), 30000)
        }
      } catch {
        // invalid URL, ignore
      }
    }

    document.addEventListener("click", handleClick, true)
    return () => document.removeEventListener("click", handleClick, true)
  }, [pathname])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  if (!isNavigating) return null

  return (
    <div className="fixed top-0 right-0 left-0 z-[100]">
      <div className="h-0.5 w-full overflow-hidden bg-slate-200">
        <div
          className="h-full rounded-r bg-slate-600"
          style={{
            animation: "nav-progress 1.5s ease-in-out infinite",
          }}
        />
      </div>
      <style jsx>{`
        @keyframes nav-progress {
          0% {
            width: 0%;
            margin-left: 0%;
          }
          50% {
            width: 60%;
            margin-left: 20%;
          }
          100% {
            width: 0%;
            margin-left: 100%;
          }
        }
      `}</style>
    </div>
  )
}
