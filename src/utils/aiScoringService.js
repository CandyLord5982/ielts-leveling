// AI Scoring Service for Fill-in-the-Blank Questions
// This service handles AI-powered answer evaluation

export const callAIScoring = async (question, userAnswer, expectedAnswers, context = 'educational assessment', language = 'en') => {
  try {
    console.log('🤖 Calling AI Scoring with language:', language)
    // Use Groq AI service for scoring
    const aiResponse = await callGroqScoring(question, userAnswer, expectedAnswers, context, language)
    console.log('✅ AI Response received:', aiResponse)
    return aiResponse
  } catch (error) {
    console.error('❌ AI scoring error:', error)
    // Fallback to mock scoring if AI service fails
    console.warn('⚠️ Falling back to mock scoring')
    const mockResponse = await mockAIScoring(question, userAnswer, expectedAnswers, context, language)
    return mockResponse
  }
}

// Mock AI scoring function (replace with real AI API call)
const mockAIScoring = async (question, userAnswer, expectedAnswers, context, language = 'en') => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000))
  
  const userAnswerLower = userAnswer.toLowerCase().trim()
  const expectedAnswersLower = expectedAnswers.map(answer => answer.toLowerCase().trim())
  
  // Check for exact matches first
  const exactMatch = expectedAnswersLower.includes(userAnswerLower)
  if (exactMatch) {
    return {
      score: 100,
      confidence: 95,
      explanation: language === 'vi' ? 'Chính xác! Câu trả lời trùng khớp với đáp án mong đợi.' : "Perfect match! Your answer exactly matches one of the expected answers."
    }
  }
  
  // Check for partial matches
  let bestScore = 0
  let bestExplanation = ""
  
  for (const expected of expectedAnswersLower) {
    const similarity = calculateSimilarity(userAnswerLower, expected)
    if (similarity > bestScore) {
      bestScore = similarity
      bestExplanation = generateExplanation(similarity, userAnswer, expected)
    }
  }
  
  // Check for keyword matches
  const keywordScore = checkKeywordMatches(userAnswerLower, expectedAnswersLower)
  if (keywordScore > bestScore) {
    bestScore = keywordScore
    bestExplanation = language === 'vi' ? 'Tốt! Câu trả lời của bạn chứa các ý chính, dù cách diễn đạt khác.' : "Good! Your answer contains the key concepts, though the wording is different."
  }
  
  return {
    score: Math.round(bestScore),
    confidence: Math.min(95, Math.round(bestScore + Math.random() * 10)),
    explanation: bestExplanation || (language === 'vi'
      ? 'Câu trả lời chưa phù hợp với đáp án kỳ vọng. Hãy thử diễn đạt lại hoặc kiểm tra chính tả.'
      : "Your answer doesn't quite match the expected responses. Try rephrasing or checking your spelling.")
  }
}

// Calculate similarity between two strings (simple implementation)
const calculateSimilarity = (str1, str2) => {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 100
  
  const editDistance = levenshteinDistance(longer, shorter)
  return Math.max(0, ((longer.length - editDistance) / longer.length) * 100)
}

// Levenshtein distance calculation
const levenshteinDistance = (str1, str2) => {
  const matrix = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

// Check for keyword matches
const checkKeywordMatches = (userAnswer, expectedAnswers) => {
  const userWords = userAnswer.split(/\s+/)
  let maxKeywordScore = 0
  
  for (const expected of expectedAnswers) {
    const expectedWords = expected.split(/\s+/)
    const commonWords = userWords.filter(word => 
      expectedWords.some(expectedWord => 
        word.includes(expectedWord) || expectedWord.includes(word)
      )
    )
    
    const keywordScore = (commonWords.length / expectedWords.length) * 100
    maxKeywordScore = Math.max(maxKeywordScore, keywordScore)
  }
  
  return maxKeywordScore
}

// Generate explanation based on similarity score
const generateExplanation = (similarity, userAnswer, expected) => {
  if (similarity >= 90) {
    return "Excellent! Your answer is very close to the expected response."
  } else if (similarity >= 70) {
    return "Good answer! You're on the right track with minor differences in wording."
  } else if (similarity >= 50) {
    return "Partial credit! Your answer has some correct elements but needs refinement."
  } else if (similarity >= 30) {
    return "Getting closer! Try to include more key terms from the question."
  } else {
    return "Not quite right. Consider reviewing the question and trying a different approach."
  }
}

// AI Scoring integration (via Groq proxy)
export const callGroqScoring = async (question, userAnswer, expectedAnswers, context, language = 'en') => {
  const prompt = language === 'vi'
    ? `
Bạn là trợ lý AI giáo dục chấm điểm câu trả lời điền vào chỗ trống.

Câu hỏi: "${question}"
Câu trả lời của học sinh: "${userAnswer}"
Đáp án mong đợi: ${JSON.stringify(expectedAnswers)}
Ngữ cảnh: ${context}

Hãy đánh giá câu trả lời của học sinh và cung cấp:
1. Điểm số từ 0-100 dựa trên độ chính xác và sự hiểu biết
2. Giải thích CHI TIẾT bằng tiếng Việt (2-4 câu) về:
   - Tại sao câu trả lời đúng/sai
   - So sánh với đáp án đúng
Cân nhắc:
- Khớp chính xác nên được 100 điểm
- Khớp một phần nên được 50-90 điểm
- Sự hiểu biết về khái niệm nên được khen thưởng
- Lỗi chính tả/ngữ pháp nhỏ không nên bị phạt nặng
- Câu trả lời hoàn toàn sai nên được 0-30 điểm

Trả lời theo định dạng JSON:
{
  "score": number,
  "explanation": "string (2-4 câu giải thích chi tiết)"
}
`
    : `
You are an educational AI assistant scoring a fill-in-the-blank question.

Question: "${question}"
Student Answer: "${userAnswer}"
Expected Answers: ${JSON.stringify(expectedAnswers)}
Context: ${context}

Please evaluate the student's answer and provide:
1. A score from 0-100 based on correctness and understanding
2. A DETAILED explanation (2-4 sentences) covering:
   - Why the answer is correct/incorrect
   - Comparison with the expected answer

Consider:
- Exact matches should score 100
- Partial matches should score 50-90
- Conceptual understanding should be rewarded
- Minor spelling/grammar errors should not heavily penalize
- Completely wrong answers should score 0-30

Respond in JSON format:
{
  "score": number,
  "explanation": "string (2-4 detailed sentences)"
}
`

  try {
    console.log('📤 Sending request to Groq API...')
    console.log('Language:', language)
    console.log('Prompt preview:', prompt.substring(0, 200) + '...')

    const response = await fetch('/api/pet-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: language === 'vi'
              ? 'Bạn là trợ lý AI giáo dục chấm điểm câu trả lời của học sinh một cách công bằng và cung cấp phản hồi chi tiết, hữu ích bằng tiếng Việt. Hãy giải thích rõ ràng và khuyến khích học sinh.'
              : 'You are an educational AI assistant that scores student answers fairly and provides detailed, helpful feedback. Explain clearly and encourage students.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      })
    })

    console.log('📥 Groq API response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Groq API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    console.log('📦 Full API response:', JSON.stringify(data, null, 2))
    const content = data.choices[0].message.content
    console.log('📝 Raw AI response content:', content)

    try {
      // Try to parse JSON response
      let jsonMatch = content.match(/\{[\s\S]*\}/)

      // If JSON is incomplete (common with token limits), try to fix it
      if (!jsonMatch || content.includes('"explanation":') && !content.trim().endsWith('}')) {
        console.warn('⚠️ Incomplete JSON detected, attempting to repair...')
        // Try to extract what we have and close it properly
        const scoreMatch = content.match(/"score":\s*(\d+)/)
        const explanationMatch = content.match(/"explanation":\s*"([^"]*(?:[^"\\]|\\.)*?)(?:"|\s*$)/)

        if (scoreMatch) {
          const repairedJson = {
            score: parseInt(scoreMatch[1]),
            explanation: explanationMatch ? explanationMatch[1].trim() + '...' : 'Response was cut off due to length limits.'
          }
          console.log('✨ Repaired JSON:', repairedJson)
          return repairedJson
        }
      }

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        console.log('✨ Parsed AI result:', parsed)
        return parsed
      }
      throw new Error('No JSON found in response')
    } catch (parseError) {
      console.error('Failed to parse Groq response:', content)
      console.error('Parse error:', parseError)
      throw new Error('Invalid response from AI service')
    }
  } catch (error) {
    console.error('Groq API error:', error)
    throw error
  }
}
