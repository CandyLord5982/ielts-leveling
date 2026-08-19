// Pet Chat Service - AI-powered pet conversations
// Proxied through server-side /api/pet-chat (Groq API)

// Helper to call Groq via server proxy
const callGroq = async (messages, { model = 'openai/gpt-oss-120b', max_tokens = 500, temperature = 0.7 } = {}) => {
  const response = await fetch('/api/pet-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model, max_tokens, temperature }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Proxy error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('Empty AI response')
  }

  return content
}

export const chatWithPet = async (pet, userMessage, chatHistory = [], language = 'vi') => {
  try {
    console.log('🐾 Calling Pet Chat AI...')
    const response = await callGroqPetChat(pet, userMessage, chatHistory, language)
    console.log('✅ Pet response received:', response)
    return response
  } catch (error) {
    console.error('❌ Pet chat error:', error)
    return getFallbackResponse(pet, language)
  }
}

// Fallback responses when AI is unavailable
const getFallbackResponse = (pet, language) => {
  const fallbacksVi = [
    `*${pet.nickname || pet.name} vẫy đuôi vui vẻ*`,
    `${pet.nickname || pet.name} nhìn bạn với ánh mắt yêu thương!`,
    `*${pet.nickname || pet.name} kêu lên vui sướng*`,
    `${pet.nickname || pet.name} muốn chơi với bạn!`,
    `*${pet.nickname || pet.name} nhảy nhót quanh bạn*`,
  ]

  const fallbacksEn = [
    `*${pet.nickname || pet.name} wags happily*`,
    `${pet.nickname || pet.name} looks at you lovingly!`,
    `*${pet.nickname || pet.name} makes happy sounds*`,
    `${pet.nickname || pet.name} wants to play with you!`,
    `*${pet.nickname || pet.name} bounces around you*`,
  ]

  const fallbacks = language === 'vi' ? fallbacksVi : fallbacksEn
  return {
    message: fallbacks[Math.floor(Math.random() * fallbacks.length)],
    mood: 'happy'
  }
}

// Groq Pet Chat via Edge Function
const callGroqPetChat = async (pet, userMessage, _chatHistory, language, retryCount = 0) => {
  const petName = pet.nickname || pet.name
  const petType = pet.info || 'virtual pet'

  const systemPrompt = language === 'vi'
    ? `Bạn tên là ${petName}, một ${petType} dễ thương. Trả lời ngắn (1-2 câu), vui vẻ, có thể dùng emoji. Level: ${pet.level}.`
    : `Your name is ${petName}, a cute ${petType}. Reply short (1-2 sentences), cheerful, can use emojis. Level: ${pet.level}.`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage }
  ]

  try {
    console.log('📤 Sending pet chat request via Edge Function...')

    const content = await callGroq(messages, { max_tokens: 1000 })

    console.log('🐾 Pet says:', content)

    let mood = 'happy'
    if (content.includes('buồn') || content.includes('sad') || content.includes('😢')) {
      mood = 'sad'
    } else if (content.includes('mệt') || content.includes('tired') || content.includes('😴')) {
      mood = 'tired'
    }

    return { message: content, mood }
  } catch (error) {
    if (retryCount < 1) {
      console.warn('⚠️ Error, retrying...', error.message)
      await new Promise(r => setTimeout(r, 500))
      return callGroqPetChat(pet, userMessage, _chatHistory, language, retryCount + 1)
    }
    console.error('Groq Pet Chat error:', error)
    throw error
  }
}

// Pet Tutor - AI-powered explanations for wrong answers
export const getPetTutorExplanation = async (pet, questionData, language = 'vi') => {
  try {
    console.log('🎓 Calling Pet Tutor AI...')
    const response = await callGroqPetTutor(pet, questionData, language)
    console.log('✅ Pet tutor response received:', response)
    return response
  } catch (error) {
    console.error('❌ Pet tutor error:', error)
    return getTutorFallbackResponse(pet, language)
  }
}

// Fallback responses when AI tutoring is unavailable
const getTutorFallbackResponse = (pet, language) => {
  const petName = pet?.nickname || pet?.name || 'Pet'
  const fallbacksVi = [
    `*${petName} gãi đầu* Hmm, câu này hơi khó nhỉ! Thử đọc lại đề bài nhé! 📚`,
    `${petName} tin bạn sẽ làm được! Đừng bỏ cuộc nha! 💪`,
    `*${petName} vỗ vai bạn* Sai một lần không sao, quan trọng là học từ sai lầm! ✨`,
  ]
  const fallbacksEn = [
    `*${petName} scratches head* Hmm, this one is tricky! Try reading the question again! 📚`,
    `${petName} believes in you! Don't give up! 💪`,
    `*${petName} pats your shoulder* Making mistakes is okay, what matters is learning from them! ✨`,
  ]
  const fallbacks = language === 'vi' ? fallbacksVi : fallbacksEn
  return {
    message: fallbacks[Math.floor(Math.random() * fallbacks.length)],
    success: false
  }
}

// Groq Pet Tutor via Edge Function
const callGroqPetTutor = async (pet, questionData, language, retryCount = 0) => {
  const petName = pet?.nickname || pet?.name || 'Pet'
  const petType = pet?.info || 'virtual pet'
  const { question, selectedAnswer, correctAnswer } = questionData

  const systemPrompt = language === 'vi'
    ? `Bạn là ${petName}, một ${petType} đang giúp học sinh học bài. Học sinh vừa trả lời sai câu hỏi này:

Câu hỏi: ${question}
Học sinh chọn: ${selectedAnswer}
Đáp án đúng: ${correctAnswer}

Hãy giải thích ngắn gọn (2-3 câu) tại sao đáp án kia đúng, theo cách thân thiện và dễ hiểu. Dùng ngôn ngữ vui vẻ, có thể dùng emoji. Không lặp lại câu hỏi.`
    : `You are ${petName}, a ${petType} helping a student learn. The student just got this question wrong:

Question: ${question}
Student chose: ${selectedAnswer}
Correct answer: ${correctAnswer}

Explain briefly (2-3 sentences) why the correct answer is right, in a friendly and easy-to-understand way. Use cheerful language, emojis are OK. Don't repeat the question.`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: language === 'vi' ? 'Giải thích giúp mình nhé!' : 'Please explain!' }
  ]

  try {
    console.log('📤 Sending pet tutor request via Edge Function...')

    const content = await callGroq(messages)

    console.log('🎓 Pet tutor says:', content)

    return { message: content, success: true }
  } catch (error) {
    if (retryCount < 1) {
      console.warn('⚠️ Error, retrying...', error.message)
      await new Promise(r => setTimeout(r, 500))
      return callGroqPetTutor(pet, questionData, language, retryCount + 1)
    }
    console.error('Groq Pet Tutor error:', error)
    throw error
  }
}

export default chatWithPet
