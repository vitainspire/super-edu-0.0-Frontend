'use client'
import { useParams } from 'next/navigation'
import AttendanceForm from '@/components/attendance/AttendanceForm'

export default function AttendancePage() {
  const { classId } = useParams<{ classId: string }>()
  return <AttendanceForm classId={classId} />
}
