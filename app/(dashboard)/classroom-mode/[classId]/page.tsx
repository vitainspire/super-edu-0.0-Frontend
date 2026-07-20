'use client'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import AttendanceForm from '@/components/attendance/AttendanceForm'

// Classroom Mode's own entry point — attendance is step one. Deliberately lives outside
// classes/[classId]/ so it never inherits that section's Students/Attendance/Syllabus/...
// tab layout; this flow (attendance -> lesson -> feedback) is meant to be standalone.
export default function ClassroomModeEntryPage() {
  const { classId } = useParams<{ classId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const endTime = searchParams.get('endTime')

  const lessonHref = `/classroom-mode/${classId}/lesson${endTime ? `?endTime=${encodeURIComponent(endTime)}` : ''}`

  return (
    <AttendanceForm
      classId={classId}
      postSaveAction={{
        label: 'Continue to Lesson',
        icon: <ArrowRight size={16} />,
        onClick: () => router.push(lessonHref),
      }}
    />
  )
}
