import { redirect } from 'next/navigation'

import { CctvConsentClient } from './CctvConsentClient'
import {
  getAuthContext,
  isProfileComplete,
  resolveDashboardPath,
} from '@/lib/auth'
import {
  CCTV_CONSENT_AGREEMENT_LABEL,
  CCTV_CONSENT_HEADING,
  CCTV_CONSENT_INTRO,
  CCTV_CONSENT_SECTIONS,
} from '@/lib/consents'

export default async function CctvConsentPage() {
  const { session, profile, cctvConsented } = await getAuthContext()

  if (!session) {
    redirect('/login')
  }

  if (!profile || !isProfileComplete(profile)) {
    redirect('/complete-profile')
  }

  if (profile.status !== 'approved') {
    redirect('/pending-approval')
  }

  if (cctvConsented) {
    redirect(resolveDashboardPath(profile.role))
  }

  return (
    <CctvConsentClient
      heading={CCTV_CONSENT_HEADING}
      intro={CCTV_CONSENT_INTRO}
      sections={CCTV_CONSENT_SECTIONS}
      agreementLabel={CCTV_CONSENT_AGREEMENT_LABEL}
      memberName={profile.name ?? profile.email ?? ''}
    />
  )
}
