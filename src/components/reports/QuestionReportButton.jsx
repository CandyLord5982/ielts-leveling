import { useState, useEffect } from 'react'
import { Flag } from 'lucide-react'
import ReportModal from './ReportModal'
import { usePermissions } from '../../hooks/usePermissions'
import { supabase } from '../../supabase/client'

const stripHtml = (s) => (typeof s === 'string' ? s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '')

const getQuestionPreview = (q) => {
  if (!q) return ''
  const raw =
    q.question_text ||
    q.question ||
    q.text ||
    q.prompt ||
    q.sentence ||
    q.word ||
    q.title ||
    ''
  const preview = stripHtml(raw)
  return preview.length > 120 ? preview.slice(0, 120) + '…' : preview
}

const fetchFolderPath = async (folderId) => {
  if (!folderId) return ''
  const parts = []
  let currentId = folderId
  let safety = 8
  while (currentId && safety-- > 0) {
    const { data, error } = await supabase
      .from('exercise_folders')
      .select('id, name, parent_folder_id')
      .eq('id', currentId)
      .single()
    if (error || !data) break
    parts.unshift(data.name)
    currentId = data.parent_folder_id
  }
  return parts.join(' / ')
}

const QuestionReportButton = ({
  exercise,
  question,
  questionIndex,
  userAnswer = null,
  className = '',
  size = 16
}) => {
  const { canCreateContent } = usePermissions()
  const [open, setOpen] = useState(false)
  const [folderPath, setFolderPath] = useState('')

  useEffect(() => {
    if (!open || !exercise?.folder_id) return
    let cancelled = false
    fetchFolderPath(exercise.folder_id).then(path => {
      if (!cancelled) setFolderPath(path)
    })
    return () => { cancelled = true }
  }, [open, exercise?.folder_id])

  if (canCreateContent && canCreateContent()) return null
  if (!exercise) return null

  const preview = getQuestionPreview(question)
  const contextInfo = {
    exerciseId: exercise.id,
    exerciseTitle: exercise.title,
    exerciseType: exercise.exercise_type || exercise.type,
    folderPath,
    inBank: exercise.is_in_bank !== false,
    questionIndex,
    questionId: question?.id,
    questionPreview: preview,
    userAnswer
  }

  const prefill = {
    category: 'bug',
    subject: `[Câu ${typeof questionIndex === 'number' ? questionIndex + 1 : '?'}] ${exercise.title || 'Báo lỗi câu hỏi'}`,
    message: ''
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        title="Báo lỗi câu hỏi này"
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-gray-500 hover:text-orange-600 hover:bg-orange-50 transition-colors ${className}`}
      >
        <Flag size={size} />
        <span className="hidden sm:inline">Báo lỗi</span>
      </button>
      <ReportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        prefill={prefill}
        attachmentRequired={false}
        contextInfo={contextInfo}
      />
    </>
  )
}

export default QuestionReportButton
