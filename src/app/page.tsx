import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 py-20">
      <div className="flex w-full max-w-md flex-col items-center gap-10 text-center">
        <Image
          src="/logo.png"
          alt="Woodie Film Campus 로고"
          width={260}
          height={72}
          priority
        />
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/login">로그인</Link>
        </Button>
      </div>
    </div>
  )
}
