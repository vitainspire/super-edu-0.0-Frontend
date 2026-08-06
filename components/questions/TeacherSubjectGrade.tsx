'use client'
import { useApp } from '@/lib/context'
import QuestionGenerator from './QuestionGenerator'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export function TeacherSubjectGrade() {
  const { teacher } = useApp()
  return (
    <ErrorBoundary label="question generator">
      <QuestionGenerator
        subject={teacher?.subject ?? 'Mathematics'}
        grade={teacher?.grade ?? '6'}
      />
    </ErrorBoundary>
  )
}
