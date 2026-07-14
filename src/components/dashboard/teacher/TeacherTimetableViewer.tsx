import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  compareScheduleEntries,
  DAY_OF_WEEK_LABELS,
  formatScheduleTimeRange,
  type ClassScheduleEntry,
} from '@/types/timetable'

export interface TeacherClassSummary {
  id: string
  name: string
  description: string | null
  homeroomTeacherName: string | null
  students: Array<{ id: string; name: string | null; email: string | null }>
}

interface TeacherTimetableViewerProps {
  entries: ClassScheduleEntry[]
  classes: TeacherClassSummary[]
}

export function TeacherTimetableViewer({ entries, classes }: TeacherTimetableViewerProps) {
  const sorted = [...entries].sort(compareScheduleEntries)

  const byDay = new Map<number, ClassScheduleEntry[]>()
  for (const entry of sorted) {
    const current = byDay.get(entry.dayOfWeek) ?? []
    current.push(entry)
    byDay.set(entry.dayOfWeek, current)
  }

  return (
    <section className="space-y-8">
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">내 수업 시간표</h2>
          <p className="text-sm text-slate-500">담당 수업을 요일별로 확인하세요.</p>
        </div>

        {sorted.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 px-4 py-16 text-center text-sm text-slate-500">
            아직 배정된 수업이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from(byDay.entries()).map(([dayOfWeek, dayEntries]) => (
              <div key={dayOfWeek} className="rounded-lg border border-slate-200">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">
                  {DAY_OF_WEEK_LABELS[dayOfWeek]}요일
                </div>
                <div className="divide-y divide-slate-100">
                  {dayEntries.map((entry) => (
                    <div key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                      <span className="w-14 shrink-0 font-medium text-slate-900">{entry.period}교시</span>
                      <span className="w-28 shrink-0 text-slate-600">{formatScheduleTimeRange(entry)}</span>
                      <span className="font-medium text-slate-800">{entry.className}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">소속 반</h2>
          <p className="text-sm text-slate-500">담당하고 있는 반의 기본 정보를 확인하세요.</p>
        </div>

        {classes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
            아직 소속된 반이 없습니다.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {classes.map((classItem) => (
              <Card key={classItem.id} className="border-slate-200">
                <CardHeader>
                  <CardTitle className="text-base text-slate-900">{classItem.name}</CardTitle>
                  {classItem.description ? (
                    <p className="text-sm text-slate-500">{classItem.description}</p>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <p>
                    <span className="font-medium text-slate-700">담임: </span>
                    {classItem.homeroomTeacherName ?? '미지정'}
                  </p>
                  <div>
                    <p className="font-medium text-slate-700">학생 ({classItem.students.length}명)</p>
                    {classItem.students.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-500">배정된 학생이 없습니다.</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {classItem.students.map((student) => (
                          <Badge key={student.id} variant="outline" className="text-xs">
                            {student.name ?? student.email ?? '이름 없음'}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
