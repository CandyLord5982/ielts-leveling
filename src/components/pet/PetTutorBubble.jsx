import React from 'react'
import { Loader2, Sparkles } from 'lucide-react'

const PetTutorBubble = ({ pet, message, isLoading, onClose }) => {
  if (!pet) return null

  const petName = pet.nickname || pet.name

  return (
    <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-purple-200 shadow-sm">
      {/* Pet Avatar */}
      <div className="flex-shrink-0">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-white border-2 border-purple-300 shadow-sm">
          {pet.image_url ? (
            <img
              src={pet.image_url}
              alt={petName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-purple-100">
              <Sparkles className="w-6 h-6 text-purple-500" />
            </div>
          )}
        </div>
        <p className="text-xs text-center text-purple-600 font-medium mt-1 truncate max-w-[48px]">
          {petName}
        </p>
      </div>

      {/* Speech Bubble */}
      <div className="flex-1 relative">
        {/* Bubble tail */}
        <div
          className="absolute left-0 top-4 -ml-2"
          style={{
            width: 0,
            height: 0,
            borderTop: '8px solid transparent',
            borderBottom: '8px solid transparent',
            borderRight: '10px solid white'
          }}
        />

        <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-purple-100 min-h-[60px]">
          {isLoading ? (
            <div className="flex items-center gap-2 text-purple-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{petName} is thinking...</span>
            </div>
          ) : (
            <p className="text-gray-800 text-sm leading-relaxed whitespace-pre-wrap">
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default PetTutorBubble
