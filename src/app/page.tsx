import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-white px-6 py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-2 text-center">
        <Image
          src="/logo_02.png"
          alt="Woodie Film Campus 로고"
          width={338}
          height={94}
          sizes="(max-width: 640px) 260px, 338px"
          className="h-auto w-[260px] sm:w-[338px]"
          priority
        />
        <h1 className="w-[260px] text-3xl font-semibold tracking-tight text-[#5a6450] sm:w-[338px] sm:text-4xl">
          WOODIE CAMPUS 2.0
        </h1>
        <Button asChild size="lg" className="mt-6 w-full max-w-[220px]">
          <Link href="/login">로그인</Link>
        </Button>
      </div>
    </div>
  )
}
