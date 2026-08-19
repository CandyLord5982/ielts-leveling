// CSV Parser for Flashcard Bulk Import
// Supports various CSV formats for creating flashcard exercises

export const parseFlashcardsFromCSV = (csvText) => {
  if (!csvText || typeof csvText !== 'string') {
    throw new Error('Invalid CSV text provided')
  }

  const lines = csvText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)

  if (lines.length < 2) {
    throw new Error('CSV must contain at least a header row and one data row')
  }

  // Parse CSV with support for quoted fields
  const parseCSVLine = (line) => {
    const result = []
    let current = ''
    let inQuotes = false
    let i = 0

    while (i < line.length) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"'
          i += 2
          continue
        } else {
          // Toggle quote state
          inQuotes = !inQuotes
          i++
          continue
        }
      }

      if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
        i++
        continue
      }

      current += char
      i++
    }

    // Add the last field
    result.push(current.trim())
    return result
  }

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())
  const dataRows = lines.slice(1)

  // Find column indices first to check if required data can be found
  const getColumnIndex = (columnName) => {
    const variations = {
      'front': ['front', 'english', 'word', 'term', 'question'],
      'back': ['back', 'vietnamese', 'meaning', 'translation', 'answer'],
      'image': ['image', 'image_url', 'imageurl', 'img', 'picture'],
      'audioUrl': ['audiourl', 'audio_url', 'audio', 'sound'],
      'videoUrls': ['videourls', 'video_urls', 'videos', 'videourl', 'video_url', 'video'],
      'id': ['id', 'index', 'number', '#']
    }

    for (const variation of variations[columnName] || [columnName]) {
      const index = headers.indexOf(variation.toLowerCase())
      if (index !== -1) return index
    }
    return -1
  }

  // Validate that we can find required columns
  const frontIndex = getColumnIndex('front')
  const backIndex = getColumnIndex('back')

  if (frontIndex === -1 || backIndex === -1) {
    const foundColumns = []
    if (frontIndex !== -1) foundColumns.push('front')
    if (backIndex !== -1) foundColumns.push('back')

    const missingColumns = ['front', 'back'].filter(col => !foundColumns.includes(col))
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}. Headers found: ${headers.join(', ')}`)
  }

  const imageIndex = getColumnIndex('image')
  const audioIndex = getColumnIndex('audioUrl')
  const videoIndex = getColumnIndex('videoUrls')
  const idIndex = getColumnIndex('id')

  const flashcards = []
  const errors = []

  dataRows.forEach((line, rowIndex) => {
    try {
      const fields = parseCSVLine(line)

      if (fields.length < 2) {
        errors.push(`Row ${rowIndex + 2}: Not enough columns`)
        return
      }

      const front = fields[frontIndex]?.trim()
      const back = fields[backIndex]?.trim()

      if (!front || !back) {
        errors.push(`Row ${rowIndex + 2}: Missing front or back text`)
        return
      }

      const flashcard = {
        id: fields[idIndex]?.trim() || `card_${Date.now()}_${rowIndex}`,
        front,
        back,
        image: fields[imageIndex]?.trim() || '',
        audioUrl: fields[audioIndex]?.trim() || '',
        videoUrls: []
      }

      // Parse video URLs if present
      if (videoIndex >= 0 && fields[videoIndex]) {
        const videoText = fields[videoIndex].trim()
        if (videoText) {
          // Support multiple formats:
          // - Comma separated: "url1,url2,url3"
          // - Pipe separated: "url1|url2|url3"
          // - Semicolon separated: "url1;url2;url3"
          // - JSON array: '["url1","url2","url3"]'

          let videoUrls = []

          if (videoText.startsWith('[') && videoText.endsWith(']')) {
            // JSON array format
            try {
              videoUrls = JSON.parse(videoText).filter(url => url && url.trim())
            } catch (e) {
              errors.push(`Row ${rowIndex + 2}: Invalid JSON array in video URLs: ${videoText}`)
              return
            }
          } else {
            // Delimited format
            const separators = [',', '|', ';']
            let separator = ','

            for (const sep of separators) {
              if (videoText.includes(sep)) {
                separator = sep
                break
              }
            }

            videoUrls = videoText
              .split(separator)
              .map(url => url.trim())
              .filter(url => url)
          }

          // Validate URLs
          const validUrls = []
          videoUrls.forEach(url => {
            if (url.match(/^https?:\/\//) || url.startsWith('/') || url.startsWith('./')) {
              validUrls.push(url)
            } else {
              errors.push(`Row ${rowIndex + 2}: Invalid video URL format: ${url}`)
            }
          })

          flashcard.videoUrls = validUrls
        }
      }

      flashcards.push(flashcard)

    } catch (error) {
      errors.push(`Row ${rowIndex + 2}: ${error.message}`)
    }
  })

  return {
    flashcards,
    errors,
    totalRows: dataRows.length,
    successfulRows: flashcards.length,
    summary: {
      total: flashcards.length,
      withImages: flashcards.filter(f => f.image).length,
      withAudio: flashcards.filter(f => f.audioUrl).length,
      withVideos: flashcards.filter(f => f.videoUrls && f.videoUrls.length > 0).length,
      errors: errors.length
    }
  }
}

// Generate sample CSV template
export const generateCSVTemplate = () => {
  return `front,back,image,audioUrl,videoUrls
Hello,Xin chào,https://example.com/hello.jpg,https://example.com/hello.mp3,https://example.com/hello1.mp4|https://example.com/hello2.mp4
Goodbye,Tạm biệt,https://example.com/goodbye.jpg,https://example.com/goodbye.mp3,https://example.com/goodbye.mp4
Thank you,Cảm ơn,https://example.com/thanks.jpg,,
Good morning,Chào buổi sáng,https://example.com/morning.jpg,https://example.com/morning.mp3,https://example.com/morning.mp4`
}

// Validate flashcard data structure
export const validateFlashcardData = (flashcards) => {
  const errors = []

  if (!Array.isArray(flashcards)) {
    errors.push('Flashcards must be an array')
    return errors
  }

  flashcards.forEach((card, index) => {
    if (!card.front || typeof card.front !== 'string' || card.front.trim() === '') {
      errors.push(`Card ${index + 1}: Front text is required`)
    }

    if (!card.back || typeof card.back !== 'string' || card.back.trim() === '') {
      errors.push(`Card ${index + 1}: Back text is required`)
    }

    if (card.image && typeof card.image !== 'string') {
      errors.push(`Card ${index + 1}: Image must be a URL string`)
    }

    if (card.audioUrl && typeof card.audioUrl !== 'string') {
      errors.push(`Card ${index + 1}: Audio URL must be a string`)
    }

    if (card.videoUrls && !Array.isArray(card.videoUrls)) {
      errors.push(`Card ${index + 1}: VideoUrls must be an array`)
    }
  })

  return errors
}

// Convert flashcards to exercise content format
export const convertToExerciseContent = (flashcards, exerciseTitle = 'Imported Flashcards') => {
  const validationErrors = validateFlashcardData(flashcards)

  if (validationErrors.length > 0) {
    throw new Error(`Validation failed: ${validationErrors.join(', ')}`)
  }

  return {
    title: exerciseTitle,
    exercise_type: 'flashcard',
    content: {
      cards: flashcards.map((card, index) => ({
        id: card.id || `imported_${Date.now()}_${index}`,
        front: card.front.trim(),
        back: card.back.trim(),
        image: card.image?.trim() || '',
        audioUrl: card.audioUrl?.trim() || '',
        videoUrls: (card.videoUrls || []).filter(url => url && url.trim())
      }))
    }
  }
}