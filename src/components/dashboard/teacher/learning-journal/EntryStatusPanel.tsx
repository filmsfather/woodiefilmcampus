interface EntryStatusPanelProps {
  status: 'draft' | 'published' | 'archived'
}

function getStatusLabel(status: EntryStatusPanelProps['status']) {
  switch (status) {
    case 'draft':
      return '작성 중'
    case 'published':
      return '공개 완료'
    case 'archived':
      return '보관'
    default:
      return status
  }
}

export function EntryStatusPanel({ status }: EntryStatusPanelProps) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">공개 상태</h2>
        <p className="text-sm text-slate-500">작성이 완료되면 원장 선생님이 검토 후 공개합니다.</p>
      </div>

      <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
        현재 상태: <span className="font-medium text-slate-900">{getStatusLabel(status)}</span>
      </div>
    </div>
  )
}
