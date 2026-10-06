import React, { useState } from 'react'
import MultipleChoiceEditor from './MultipleChoiceEditor'
import FillBlankEditor from './FillBlankEditor'

const IeltsReadingEditor = ({ content, onContentChange, folderPath }) => {
  const passage = content?.passage || { title: '', text_html: '' }
  const questions = content?.questions || []
  const fillBlankQuestions = content?.fillBlankQuestions || []
  const settings = content?.settings || {}

  const [activeTab, setActiveTab] = useState('mc') // 'mc' | 'fib'

  const handlePassageChange = (field, value) => {
    onContentChange({
      ...content,
      passage: {
        ...passage,
        [field]: value
      }
    })
  }

  const handleQuestionsChange = (newQuestions) => {
    onContentChange({
      ...content,
      questions: newQuestions
    })
  }

  const handleFillBlankQuestionsChange = (newQuestions) => {
    onContentChange({
      ...content,
      fillBlankQuestions: newQuestions
    })
  }

  const handleSettingsChange = (newSettings) => {
    onContentChange({
      ...content,
      settings: newSettings
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[550px]">
      {/* Passage Column */}
      <div className="lg:col-span-5 flex flex-col border border-gray-200 rounded-lg bg-white overflow-hidden h-full">
        <div className="p-3 bg-gray-50 border-b border-gray-200 font-semibold text-gray-700 flex-shrink-0">
          Left Column: Reading Passage
        </div>
        <div className="p-4 flex flex-col flex-1 min-h-0 overflow-y-auto">
          <input 
            type="text" 
            placeholder="Passage Title (e.g. The History of Bicycles)"
            className="w-full px-3 py-2 mb-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            value={passage.title}
            onChange={e => handlePassageChange('title', e.target.value)}
          />
          <textarea
            placeholder="Paste your reading passage here... (Markdown or plain text)"
            className="flex-1 w-full p-3 border border-gray-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm leading-relaxed"
            value={passage.text_html}
            onChange={e => handlePassageChange('text_html', e.target.value)}
          />
        </div>
      </div>

      {/* Questions Column */}
      <div className="lg:col-span-7 flex flex-col border border-gray-200 rounded-lg bg-white overflow-hidden h-full">
        <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <button 
            type="button"
            onClick={() => setActiveTab('mc')}
            className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition-colors ${activeTab === 'mc' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Multiple Choice
          </button>
          <button 
            type="button"
            onClick={() => setActiveTab('fib')}
            className={`flex-1 py-3 text-sm font-semibold text-center border-b-2 transition-colors ${activeTab === 'fib' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Fill in the Blank
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
          {activeTab === 'mc' ? (
            <MultipleChoiceEditor
              questions={questions}
              onQuestionsChange={handleQuestionsChange}
              settings={settings}
              onSettingsChange={handleSettingsChange}
              folderPath={folderPath}
              intro={content?.intro || ''}
              onIntroChange={(intro) => onContentChange({ ...content, intro })}
            />
          ) : (
            <div className="space-y-3">
              {/* Instruction label for FIB section */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <label className="block text-xs font-semibold text-green-800 mb-1">📝 Hướng dẫn cho học sinh (Instruction)</label>
                <input
                  type="text"
                  placeholder='Ví dụ: Choose NO MORE THAN THREE WORDS from the passage'
                  className="w-full px-3 py-2 text-sm border border-green-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                  value={content?.fibInstruction || ''}
                  onChange={e => onContentChange({ ...content, fibInstruction: e.target.value })}
                />
                <p className="text-xs text-green-600 mt-1">Bỏ trống để dùng mặc định: "Choose NO MORE THAN TWO WORDS"</p>
              </div>
              <FillBlankEditor
                questions={fillBlankQuestions}
                onQuestionsChange={handleFillBlankQuestionsChange}
                settings={settings}
                onSettingsChange={handleSettingsChange}
                folderPath={folderPath}
                intro={content?.fibIntro || ''}
                onIntroChange={(fibIntro) => onContentChange({ ...content, fibIntro })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default IeltsReadingEditor
