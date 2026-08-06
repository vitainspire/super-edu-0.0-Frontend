import { TeacherSubjectGrade } from '@/components/questions/TeacherSubjectGrade'
import PageHeader from '@/components/theme/PageHeader'

export default function QuestionsPage() {
  return (
    <div className="paper-page pb-28">
      <PageHeader
        title="Blackboard Questions"
        subtitle="AI-generated questions — read from phone onto board"
      />
      <div className="px-5 pt-3 relative z-10">
        <TeacherSubjectGrade />
      </div>
    </div>
  )
}
