import { useEffect, useRef } from 'react'
import { createAttemptRecorder } from '../utils/attemptRecorder'

// One attempt recorder per exercise screen (see utils/attemptRecorder.js).
// `enabled` should be false for teachers/admins previewing, tests, and signed-out users.
// Unsent answers are flushed when the tab is hidden or closed and when the screen unmounts.
export const useAttemptRecorder = (exerciseId, enabled) => {
  const ref = useRef(null)
  if (!ref.current || ref.current.exerciseId !== exerciseId) {
    ref.current = createAttemptRecorder(exerciseId)
  }
  const recorder = ref.current
  recorder.setEnabled(enabled)

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') recorder.flush({ keepalive: true })
    }
    const onPageHide = () => recorder.flush({ keepalive: true })

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onPageHide)
      recorder.flush()
    }
  }, [recorder])

  return recorder
}
