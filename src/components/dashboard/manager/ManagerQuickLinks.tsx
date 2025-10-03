import Link from 'next/link'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function ManagerQuickLinks() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-lg">반 관리</CardTitle>
          <CardDescription>
            반을 생성하고 담임·담당 교사 및 학생 배정을 한 곳에서 처리할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link href="/dashboard/manager/classes">반 관리 열기</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

