import React, { useState, useEffect, useRef } from 'react'
import { parseFlashcardsFromCSV, generateCSVTemplate } from '../../../utils/csvParser'
import {
  Plus,
  Trash2,
  Upload,
  Download,
  X,
  Video,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronUp,
  ChevronDown,
  Copy,
} from 'lucide-react'
import { handleRichTextShortcut } from '../../../hooks/useRichTextShortcuts'
import { supabase } from '../../../supabase/client'

const getYouTubeVideoId = (raw) => {
  if (!raw) return null;
  const m1 = raw.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (m1?.[1]) return m1[1];
  const m2 = raw.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (m2?.[1]) return m2[1];
  const m3 = raw.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (m3?.[1]) return m3[1];
  const m4 = raw.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (m4?.[1]) return m4[1];
  return null;
};

const getTikTokVideoId = (raw) => {
  if (!raw) return null;
  const m1 = raw.match(/\/video\/(\d{10,25})/);
  if (m1?.[1]) return m1[1];
  return null;
};

const FlashcardEditor = ({ cards, onCardsChange, folderPath }) => {
  const [localCards, setLocalCards] = useState(cards || [])
  const frontTextareasRef = useRef({})
  const backTextareasRef = useRef({})
  const [showCSVImport, setShowCSVImport] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [csvErrors, setCsvErrors] = useState([])
  const [csvPreview, setCsvPreview] = useState(null)
  const [isProcessingCSV, setIsProcessingCSV] = useState(false)

  useEffect(() => {
    setLocalCards(cards || [])
  }, [cards])

  const addCard = () => {
    const newCard = {
      id: Date.now(),
      front: '',
      back: '',
      image: '',
      videoUrls: [] // Keep for backwards compatibility
    }
    const updatedCards = [...localCards, newCard]
    setLocalCards(updatedCards)
    onCardsChange(updatedCards)
  }

  const updateCard = (index, field, value) => {
    const updatedCards = localCards.map((card, i) => {
      if (i === index) {
        // Preserve all existing fields including videoUrls if they exist
        return { ...card, [field]: value }
      }
      return card
    })
    setLocalCards(updatedCards)
    onCardsChange(updatedCards)
  }

  const removeCard = (index) => {
    const updatedCards = localCards.filter((_, i) => i !== index)
    setLocalCards(updatedCards)
    onCardsChange(updatedCards)
  }

  const duplicateCard = (index) => {
    const cardToDuplicate = { ...localCards[index], id: Date.now() }
    const updatedCards = [...localCards]
    updatedCards.splice(index + 1, 0, cardToDuplicate)
    setLocalCards(updatedCards)
    onCardsChange(updatedCards)
  }

  const moveCard = (index, direction) => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= localCards.length) return
    const updatedCards = [...localCards]
    const temp = updatedCards[index]
    updatedCards[index] = updatedCards[newIndex]
    updatedCards[newIndex] = temp
    setLocalCards(updatedCards)
    onCardsChange(updatedCards)
  }

  const addVideoUrl = (cardIndex) => {
    const updatedCards = localCards.map((card, i) => {
      if (i === cardIndex) {
        const videoUrls = card.videoUrls || []
        return { ...card, videoUrls: [...videoUrls, ''] }
      }
      return card
    })
    setLocalCards(updatedCards)
    onCardsChange(updatedCards)
  }

  const updateVideoUrl = (cardIndex, videoIndex, value) => {
    const updatedCards = localCards.map((card, i) => {
      if (i === cardIndex) {
        const videoUrls = [...(card.videoUrls || [])]
        videoUrls[videoIndex] = value
        return { ...card, videoUrls }
      }
      return card
    })
    setLocalCards(updatedCards)
    onCardsChange(updatedCards)
  }

  const removeVideoUrl = (cardIndex, videoIndex) => {
    const updatedCards = localCards.map((card, i) => {
      if (i === cardIndex) {
        const videoUrls = (card.videoUrls || []).filter((_, vi) => vi !== videoIndex)
        return { ...card, videoUrls }
      }
      return card
    })
    setLocalCards(updatedCards)
    onCardsChange(updatedCards)
  }


  const handleFilePaste = async (e, index, kind) => {
    const items = e.clipboardData?.items
    if (!items) return
    const mimePrefix = kind === 'audio' ? 'audio/' : 'image/'
    const cardField = kind === 'audio' ? 'audioUrl' : 'image'
    for (const item of items) {
      if (item.type.startsWith(mimePrefix)) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) return
        try {
          const ext = file.type.split('/')[1] || (kind === 'audio' ? 'mp3' : 'png')
          const basePath = folderPath ? `exercise_bank/${folderPath}` : 'exercise_bank'
          const path = `${basePath}/${Date.now()}_${Math.random().toString(36).slice(2)}_pasted.${ext}`
          const { error: uploadError } = await supabase.storage
            .from('exercise-files')
            .upload(path, file, { cacheControl: '3600', upsert: true })
          if (uploadError) throw uploadError
          const { data: publicData } = supabase.storage
            .from('exercise-files')
            .getPublicUrl(path)
          const publicUrl = publicData?.publicUrl
          if (!publicUrl) throw new Error('Cannot get public URL')
          updateCard(index, cardField, publicUrl)
        } catch (err) {
          console.error('Paste upload failed:', err)
          alert(`Failed to upload pasted ${kind}`)
        }
        return
      }
    }
  }

  const applyAlignment = (index, side, alignment) => {
    const textarea = side === 'front' ? frontTextareasRef.current[index] : backTextareasRef.current[index]
    if (!textarea) return
    const value = side === 'front' ? (localCards[index].front || '') : (localCards[index].back || '')
    const start = textarea.selectionStart || 0
    const end = textarea.selectionEnd || 0
    const selected = value.slice(start, end)
    const wrapped = `<div style="text-align: ${alignment}">${selected || 'text here'}</div>`
    const newValue = value.slice(0, start) + wrapped + value.slice(end)
    updateCard(index, side, newValue)
  }

  const handleCSVTextChange = (text) => {
    setCsvText(text)
    setCsvErrors([])
    setCsvPreview(null)

    if (text.trim()) {
      setTimeout(() => {
        try {
          const result = parseFlashcardsFromCSV(text)
          setCsvPreview(result)
          if (result.errors.length > 0) {
            setCsvErrors(result.errors)
          }
        } catch (error) {
          setCsvErrors([error.message])
          setCsvPreview(null)
        }
      }, 500)
    }
  }

  const handleCSVImport = () => {
    if (!csvPreview || csvPreview.flashcards.length === 0) {
      alert('No valid flashcards to import')
      return
    }

    setIsProcessingCSV(true)

    try {
      const importedCards = csvPreview.flashcards.map(card => ({
        ...card,
        id: card.id || `imported_${Date.now()}_${Math.random()}`
      }))

      const updatedCards = [...localCards, ...importedCards]
      setLocalCards(updatedCards)
      onCardsChange(updatedCards)

      alert(`Successfully imported ${importedCards.length} flashcard(s)!`)

      setCsvText('')
      setCsvErrors([])
      setCsvPreview(null)
      setShowCSVImport(false)
    } catch (error) {
      alert('Error importing CSV: ' + error.message)
    } finally {
      setIsProcessingCSV(false)
    }
  }

  const downloadCSVTemplate = () => {
    const template = generateCSVTemplate()
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'flashcard_template.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (file && file.type === 'text/csv') {
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target.result
        setCsvText(text)
        handleCSVTextChange(text)
      }
      reader.readAsText(file)
    } else {
      alert('Please select a valid CSV file')
    }
    event.target.value = ''
  }

  return (
    <div className="space-y-4 p-4 border border-gray-200 rounded-lg">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Flashcard Cards</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={downloadCSVTemplate}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
            title="Download CSV template"
          >
            <Download className="w-4 h-4" />
            Template
          </button>
          <button
            type="button"
            onClick={() => setShowCSVImport(true)}
            className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={addCard}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Card
          </button>
        </div>
      </div>

      {/* Cards List */}
      <div className="space-y-4">
        {localCards.map((card, index) => (
          <div key={card.id || index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-medium text-gray-700">Card {index + 1}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => moveCard(index, 'up')}
                  disabled={index === 0}
                  className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  title="Move up"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveCard(index, 'down')}
                  disabled={index === localCards.length - 1}
                  className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  title="Move down"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => duplicateCard(index)}
                  className="p-1 text-blue-600 hover:text-blue-800"
                  title="Duplicate"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeCard(index)}
                  className="p-1 text-red-600 hover:text-red-800"
                  title="Remove card"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Front */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Front
                </label>
                <textarea
                  ref={(el) => { frontTextareasRef.current[index] = el }}
                  value={card.front || ''}
                  onChange={(e) => updateCard(index, 'front', e.target.value)}
                  onKeyDown={(e) => handleRichTextShortcut(e, frontTextareasRef.current[index], card.front || '', (v) => updateCard(index, 'front', v))}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={1}
                  placeholder="Front of the card"
                />
                <div className="flex gap-1 ml-2 border-l pl-2 border-gray-300 mt-1">
                  <button type="button" onClick={() => applyAlignment(index, 'front', 'left')} className="p-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align left"><AlignLeft className="w-4 h-4" /></button>
                  <button type="button" onClick={() => applyAlignment(index, 'front', 'center')} className="p-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align center"><AlignCenter className="w-4 h-4" /></button>
                  <button type="button" onClick={() => applyAlignment(index, 'front', 'right')} className="p-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align right"><AlignRight className="w-4 h-4" /></button>
                </div>
              </div>

              {/* Back */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Back
                </label>
                <textarea
                  ref={(el) => { backTextareasRef.current[index] = el }}
                  value={card.back || ''}
                  onChange={(e) => updateCard(index, 'back', e.target.value)}
                  onKeyDown={(e) => handleRichTextShortcut(e, backTextareasRef.current[index], card.back || '', (v) => updateCard(index, 'back', v))}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={1}
                  placeholder="Back of the card"
                />
                <div className="flex gap-1 ml-2 border-l pl-2 border-gray-300 mt-1">
                  <button type="button" onClick={() => applyAlignment(index, 'back', 'left')} className="p-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align left"><AlignLeft className="w-4 h-4" /></button>
                  <button type="button" onClick={() => applyAlignment(index, 'back', 'center')} className="p-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align center"><AlignCenter className="w-4 h-4" /></button>
                  <button type="button" onClick={() => applyAlignment(index, 'back', 'right')} className="p-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" title="Align right"><AlignRight className="w-4 h-4" /></button>
                </div>
              </div>
            </div>

            {/* Image URL */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Image URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={card.image || ''}
                  onChange={(e) => updateCard(index, 'image', e.target.value)}
                  onPaste={(e) => handleFilePaste(e, index, 'image')}
                  className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Paste image or URL here"
                />
                {card.image && (
                  <img
                    src={card.image}
                    alt="Card"
                    className="w-12 h-12 object-cover rounded border"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                )}
              </div>
            </div>

            {/* Audio URL */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Audio URL (optional - will use TTS if empty)
              </label>
              <input
                type="url"
                value={card.audioUrl || ''}
                onChange={(e) => updateCard(index, 'audioUrl', e.target.value)}
                onPaste={(e) => handleFilePaste(e, index, 'audio')}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Paste audio file or URL here"
              />
              {card.audioUrl && (
                <audio src={card.audioUrl} controls className="mt-2 w-full" />
              )}
            </div>

            {/* Video URLs */}
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Video URLs {card.videoUrls && card.videoUrls.length > 0 && `(${card.videoUrls.length})`}
                </label>
                <button
                  type="button"
                  onClick={() => addVideoUrl(index)}
                  className="flex items-center gap-1 px-2 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700"
                >
                  <Plus className="w-3 h-3" />
                  Add Video
                </button>
              </div>

              {card.videoUrls && card.videoUrls.length > 0 ? (
                <div className="space-y-2">
                  {card.videoUrls.map((videoUrl, videoIndex) => (
                    <div key={videoIndex} className="flex gap-2 items-start">
                      {/* Video Thumbnail */}
                      {videoUrl && (
                        <div className="flex-shrink-0">
                          {getYouTubeVideoId(videoUrl) ? (
                            <a
                              href={videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block w-20 h-20 rounded border overflow-hidden hover:opacity-80 transition-opacity"
                              title="Open YouTube video"
                            >
                              <img
                                src={`https://img.youtube.com/vi/${getYouTubeVideoId(videoUrl)}/mqdefault.jpg`}
                                alt="YouTube thumbnail"
                                className="w-full h-full object-cover"
                              />
                            </a>
                          ) : getTikTokVideoId(videoUrl) ? (
                            <a
                              href={videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex w-20 h-20 rounded border bg-black items-center justify-center hover:opacity-80 transition-opacity"
                              title="Open TikTok video"
                            >
                              <span className="text-white text-xs font-bold">TikTok</span>
                            </a>
                          ) : (
                            <video
                              src={videoUrl}
                              className="w-20 h-20 rounded border object-cover cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={(e) => {
                                e.target.requestFullscreen?.() || e.target.webkitRequestFullscreen?.()
                              }}
                              onError={(e) => e.target.style.display = 'none'}
                              title="Click to view fullscreen"
                            />
                          )}
                        </div>
                      )}
                      <div className="flex-1">
                        <input
                          type="url"
                          value={videoUrl || ''}
                          onChange={(e) => updateVideoUrl(index, videoIndex, e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm"
                          placeholder="https://youtube.com/watch?v=... or video.mp4"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeVideoUrl(index, videoIndex)}
                        className="text-red-600 hover:text-red-800 p-2"
                        title="Remove video"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 italic flex items-center gap-2 p-3 bg-gray-50 rounded border border-gray-200">
                  <Video className="w-4 h-4" />
                  No videos added. Click &quot;Add Video&quot; to add video URLs.
                </div>
              )}
            </div>

          </div>
        ))}

        {localCards.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No cards yet. Click "Add Card" to start creating flashcards.</p>
          </div>
        )}
      </div>

      {/* CSV Import Modal */}
      {showCSVImport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Import Flashcards from CSV</h3>
                <button
                  onClick={() => setShowCSVImport(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload CSV File or Paste CSV Text
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="mb-2 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <textarea
                    value={csvText}
                    onChange={(e) => handleCSVTextChange(e.target.value)}
                    className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    placeholder="Paste CSV content here..."
                  />
                </div>

                {csvErrors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                    <h4 className="text-red-800 font-medium mb-2">Errors:</h4>
                    <ul className="text-red-700 text-sm space-y-1">
                      {csvErrors.map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {csvPreview && (
                  <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                    <h4 className="text-green-800 font-medium mb-2">Preview ({csvPreview.flashcards.length} cards):</h4>
                    <div className="max-h-40 overflow-y-auto">
                      {csvPreview.flashcards.slice(0, 3).map((card, i) => (
                        <div key={i} className="text-sm text-green-700 mb-1">
                          <strong>Card {i + 1}:</strong> {card.front} → {card.back}
                        </div>
                      ))}
                      {csvPreview.flashcards.length > 3 && (
                        <div className="text-sm text-green-600">
                          ... and {csvPreview.flashcards.length - 3} more cards
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowCSVImport(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCSVImport}
                    disabled={!csvPreview || isProcessingCSV}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
                  >
                    {isProcessingCSV ? 'Importing...' : 'Import Cards'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FlashcardEditor