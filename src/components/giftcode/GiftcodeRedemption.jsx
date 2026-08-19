import { useState } from 'react'
import { Gift, Loader2, CheckCircle, XCircle, X } from 'lucide-react'
import { useGiftcodes } from '../../hooks/useGiftcodes'

const GiftcodeRedemption = () => {
  const { redeemCode } = useGiftcodes()
  const [isOpen, setIsOpen] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const handleRedeem = async (e) => {
    e.preventDefault()
    if (!code.trim() || loading) return

    setLoading(true)
    setResult(null)

    const res = await redeemCode(code)
    setResult(res)
    setLoading(false)

    if (res?.success) {
      setCode('')
      setTimeout(() => setResult(null), 5000)
    }
  }

  const getRewardText = (rewards) => {
    if (!rewards) return ''
    const parts = []
    if (rewards.xp > 0) parts.push(`+${rewards.xp} XP`)
    if (rewards.gems > 0) parts.push(`+${rewards.gems} Gems`)
    if (rewards.items?.length > 0) parts.push(`${rewards.items.length} vật phẩm`)
    if (rewards.chests?.length > 0) parts.push(`${rewards.chests.length} rương`)
    if (rewards.pets?.length > 0) parts.push(`${rewards.pets.length} thú cưng`)
    if (rewards.cosmetics?.length > 0) parts.push(`${rewards.cosmetics.length} trang trí`)
    return parts.join(' | ')
  }

  // Collapsed: just a small text button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 transition-colors"
      >
        <Gift size={15} />
        <span>Có mã quà tặng?</span>
      </button>
    )
  }

  // Expanded: input form
  return (
    <div className="bg-white rounded-xl border border-purple-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-purple-700">
          <Gift size={15} />
          Nhập mã quà tặng
        </div>
        <button onClick={() => { setIsOpen(false); setResult(null); setCode('') }} className="text-gray-400 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleRedeem} className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setResult(null)
          }}
          placeholder="VD: XMAS2024"
          className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg font-mono text-sm tracking-wider bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
          disabled={loading}
          maxLength={20}
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-sm font-medium"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : 'Đổi'}
        </button>
      </form>

      {result && (
        <div className={`mt-2 flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${
          result.success
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {result.success ? (
            <>
              <CheckCircle size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-xs">Thành công!</p>
                <p className="text-xs opacity-80">{getRewardText(result.rewards)}</p>
              </div>
            </>
          ) : (
            <>
              <XCircle size={14} className="flex-shrink-0 mt-0.5" />
              <p className="text-xs">{result.error}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default GiftcodeRedemption
