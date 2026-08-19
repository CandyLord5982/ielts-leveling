import React, { useState, useEffect } from 'react'
import { supabase } from '../../supabase/client'
import { Plus, Edit2, Trash2, Save, X, Eye, EyeOff, Search, BookOpen, HelpCircle } from 'lucide-react'

const DIFFICULTIES = ['easy', 'medium', 'hard']

const PetManagement = () => {
  const [activeTab, setActiveTab] = useState('pets')
  const [pets, setPets] = useState([])
  const [petFoodItems, setPetFoodItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddPet, setShowAddPet] = useState(false)
  const [showAddFood, setShowAddFood] = useState(false)

  // Word bank state
  const [wordBank, setWordBank] = useState([])
  const [wordSearch, setWordSearch] = useState('')
  const [wordDiffFilter, setWordDiffFilter] = useState('all')
  const [wordLoading, setWordLoading] = useState(false)
  const [editingWord, setEditingWord] = useState(null) // { id, word, hint, difficulty, min_level, image_url }
  const [newWord, setNewWord] = useState({ word: '', hint: '', difficulty: 'easy', min_level: 1, image_url: '' })
  const [showAddWord, setShowAddWord] = useState(false)
  const [editingPet, setEditingPet] = useState(null)
  const [message, setMessage] = useState(null)

  // Question bank state
  const [questionBank, setQuestionBank] = useState([])
  const [questionSearch, setQuestionSearch] = useState('')
  const [questionLoading, setQuestionLoading] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState(null)
  const [newQuestion, setNewQuestion] = useState({ question: '', choices: ['', '', '', ''], answer_index: 0, min_level: 1, image_url: '', category: '' })
  const [showAddQuestion, setShowAddQuestion] = useState(false)

  // Form state for new pet
  const [newPet, setNewPet] = useState({
    name: '',
    description: '',
    image_url: '',
    rarity: 'common',
    unlock_xp: 0,
    is_active: true
  })

  // Form state for new food item
  const [newFood, setNewFood] = useState({
    name: '',
    description: '',
    image_url: '',
    item_type: 'pet_food',
    rarity: 'common'
  })

  useEffect(() => {
    fetchPets()
    fetchPetFood()
    fetchWordBank()
    fetchQuestionBank()
  }, [])

  const fetchPets = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('pets')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setPets(data || [])
    } catch (error) {
      console.error('Error fetching pets:', error)
      showMessage('Failed to load pets', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchPetFood = async () => {
    try {
      const { data, error } = await supabase
        .from('collectible_items')
        .select('*')
        .in('item_type', ['pet_food', 'pet_toy'])
        .order('created_at', { ascending: false })

      if (error) throw error
      setPetFoodItems(data || [])
    } catch (error) {
      console.error('Error fetching pet food:', error)
    }
  }

  const handleAddPet = async () => {
    try {
      const { data, error } = await supabase
        .from('pets')
        .insert([newPet])
        .select()

      if (error) throw error

      // Add default bonus for this pet
      if (data && data[0]) {
        const bonusValue = {
          'common': 5,
          'uncommon': 10,
          'rare': 15,
          'epic': 20,
          'legendary': 25
        }[newPet.rarity] || 5

        await supabase.from('pet_bonuses').insert([{
          pet_id: data[0].id,
          bonus_type: 'xp_boost',
          bonus_value: bonusValue,
          description: 'Pet XP bonus'
        }])
      }

      showMessage('Pet added successfully!', 'success')
      setShowAddPet(false)
      setNewPet({
        name: '',
        description: '',
        image_url: '',
        rarity: 'common',
        unlock_xp: 0,
        is_active: true
      })
      fetchPets()
    } catch (error) {
      console.error('Error adding pet:', error)
      showMessage('Failed to add pet', 'error')
    }
  }

  const handleUpdatePet = async (petId, updates) => {
    try {
      const { error } = await supabase
        .from('pets')
        .update(updates)
        .eq('id', petId)

      if (error) throw error

      showMessage('Pet updated successfully!', 'success')
      setEditingPet(null)
      fetchPets()
    } catch (error) {
      console.error('Error updating pet:', error)
      showMessage('Failed to update pet', 'error')
    }
  }

  const handleDeletePet = async (petId) => {
    if (!confirm('Are you sure you want to delete this pet? This will also delete all user ownership records.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('pets')
        .delete()
        .eq('id', petId)

      if (error) throw error

      showMessage('Pet deleted successfully!', 'success')
      fetchPets()
    } catch (error) {
      console.error('Error deleting pet:', error)
      showMessage('Failed to delete pet', 'error')
    }
  }

  const handleToggleActive = async (petId, currentStatus) => {
    try {
      const { error } = await supabase
        .from('pets')
        .update({ is_active: !currentStatus })
        .eq('id', petId)

      if (error) throw error

      showMessage(`Pet ${!currentStatus ? 'activated' : 'deactivated'}!`, 'success')
      fetchPets()
    } catch (error) {
      console.error('Error toggling pet status:', error)
      showMessage('Failed to update pet status', 'error')
    }
  }

  const handleAddFood = async () => {
    try {
      const { error } = await supabase
        .from('collectible_items')
        .insert([newFood])

      if (error) throw error

      showMessage('Pet food item added successfully!', 'success')
      setShowAddFood(false)
      setNewFood({
        name: '',
        description: '',
        image_url: '',
        item_type: 'pet_food',
        rarity: 'common'
      })
      fetchPetFood()
    } catch (error) {
      console.error('Error adding food item:', error)
      showMessage('Failed to add food item', 'error')
    }
  }

  const handleDeleteFood = async (itemId) => {
    if (!confirm('Are you sure you want to delete this item?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('collectible_items')
        .delete()
        .eq('id', itemId)

      if (error) throw error

      showMessage('Item deleted successfully!', 'success')
      fetchPetFood()
    } catch (error) {
      console.error('Error deleting item:', error)
      showMessage('Failed to delete item', 'error')
    }
  }

  const showMessage = (text, type) => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  const getRarityColor = (rarity) => {
    const colors = {
      common: 'bg-gray-100 text-gray-700',
      uncommon: 'bg-green-100 text-green-700',
      rare: 'bg-blue-100 text-blue-700',
      epic: 'bg-purple-100 text-purple-700',
      legendary: 'bg-yellow-100 text-yellow-700'
    }
    return colors[rarity] || colors.common
  }

  // ── Word Bank ─────────────────────────────────────────────
  const fetchWordBank = async () => {
    setWordLoading(true)
    const { data } = await supabase
      .from('pet_word_bank')
      .select('*')
      .order('min_level', { ascending: true })
    setWordBank(data || [])
    setWordLoading(false)
  }

  const saveNewWord = async () => {
    if (!newWord.word.trim() || !newWord.hint.trim()) return
    const { error } = await supabase.from('pet_word_bank').insert({
      word: newWord.word.trim().toLowerCase(),
      hint: newWord.hint.trim(),
      difficulty: newWord.difficulty,
      min_level: newWord.min_level,
      image_url: newWord.image_url.trim() || null,
    })
    if (error) { showMessage(error.message, 'error'); return }
    setNewWord({ word: '', hint: '', difficulty: 'easy', min_level: 1, image_url: '' })
    setShowAddWord(false)
    showMessage('Word added!', 'success')
    fetchWordBank()
  }

  const saveEditWord = async () => {
    if (!editingWord) return
    const { error } = await supabase.from('pet_word_bank').update({
      word: editingWord.word.trim().toLowerCase(),
      hint: editingWord.hint.trim(),
      difficulty: editingWord.difficulty,
      min_level: editingWord.min_level,
      image_url: editingWord.image_url?.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', editingWord.id)
    if (error) { showMessage(error.message, 'error'); return }
    setEditingWord(null)
    showMessage('Word updated!', 'success')
    fetchWordBank()
  }

  const deleteWord = async (id) => {
    if (!confirm('Delete this word?')) return
    await supabase.from('pet_word_bank').delete().eq('id', id)
    showMessage('Word deleted', 'success')
    fetchWordBank()
  }

  const toggleWordActive = async (id, current) => {
    await supabase.from('pet_word_bank').update({ is_active: !current }).eq('id', id)
    fetchWordBank()
  }

  const diffColor = (d) => d === 'easy' ? 'bg-green-100 text-green-700' : d === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'

  const filteredWords = wordBank.filter(w => {
    const matchSearch = w.word.toLowerCase().includes(wordSearch.toLowerCase()) || w.hint.toLowerCase().includes(wordSearch.toLowerCase())
    const matchDiff = wordDiffFilter === 'all' || w.difficulty === wordDiffFilter
    return matchSearch && matchDiff
  })

  // ── Question Bank ─────────────────────────────────────────────
  const fetchQuestionBank = async () => {
    setQuestionLoading(true)
    const { data } = await supabase
      .from('pet_question_bank')
      .select('*')
      .order('min_level', { ascending: true })
    setQuestionBank(data || [])
    setQuestionLoading(false)
  }

  const saveNewQuestion = async () => {
    const q = newQuestion
    if (!q.question.trim() || q.choices.some(c => !c.trim())) return
    const { error } = await supabase.from('pet_question_bank').insert({
      question: q.question.trim(),
      choices: q.choices.map(c => c.trim()),
      answer_index: q.answer_index,
      min_level: q.min_level,
      image_url: q.image_url.trim() || null,
      category: q.category.trim() || null,
    })
    if (error) { showMessage(error.message, 'error'); return }
    setNewQuestion({ question: '', choices: ['', '', '', ''], answer_index: 0, min_level: 1, image_url: '', category: '' })
    setShowAddQuestion(false)
    showMessage('Question added!', 'success')
    fetchQuestionBank()
  }

  const saveEditQuestion = async () => {
    if (!editingQuestion) return
    const q = editingQuestion
    const { error } = await supabase.from('pet_question_bank').update({
      question: q.question.trim(),
      choices: q.choices.map(c => c.trim()),
      answer_index: q.answer_index,
      min_level: q.min_level,
      image_url: q.image_url?.trim() || null,
      category: q.category?.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', q.id)
    if (error) { showMessage(error.message, 'error'); return }
    setEditingQuestion(null)
    showMessage('Question updated!', 'success')
    fetchQuestionBank()
  }

  const deleteQuestion = async (id) => {
    if (!confirm('Delete this question?')) return
    await supabase.from('pet_question_bank').delete().eq('id', id)
    showMessage('Question deleted', 'success')
    fetchQuestionBank()
  }

  const toggleQuestionActive = async (id, current) => {
    await supabase.from('pet_question_bank').update({ is_active: !current }).eq('id', id)
    fetchQuestionBank()
  }

  const filteredQuestions = questionBank.filter(q =>
    q.question.toLowerCase().includes(questionSearch.toLowerCase()) ||
    q.choices?.some(c => c.toLowerCase().includes(questionSearch.toLowerCase()))
  )

  if (loading) {
    return <div className="p-6">Loading...</div>
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Message Toast */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tab Nav */}
      <div className="flex gap-2 mb-6 border-b">
        {[
          { id: 'pets', label: `Pets (${pets.length})` },
          { id: 'food', label: `Food & Items (${petFoodItems.length})` },
          { id: 'words', label: `Word Bank (${wordBank.length})`, icon: <BookOpen className="w-4 h-4" /> },
          { id: 'questions', label: `Question Bank (${questionBank.length})`, icon: <HelpCircle className="w-4 h-4" /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-purple-600 text-purple-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Pets Tab ── */}
      {activeTab === 'pets' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Pets</h2>
            <button
              onClick={() => setShowAddPet(!showAddPet)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2"
            >
              {showAddPet ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {showAddPet ? 'Cancel' : 'Add Pet'}
            </button>
          </div>

          {showAddPet && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="font-bold text-lg mb-4">Add New Pet</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="Pet Name" value={newPet.name}
                  onChange={(e) => setNewPet({ ...newPet, name: e.target.value })} className="px-4 py-2 border rounded-lg" />
                <input type="text" placeholder="Description" value={newPet.description}
                  onChange={(e) => setNewPet({ ...newPet, description: e.target.value })} className="px-4 py-2 border rounded-lg" />
                <input type="text" placeholder="Image URL" value={newPet.image_url}
                  onChange={(e) => setNewPet({ ...newPet, image_url: e.target.value })} className="px-4 py-2 border rounded-lg" />
                <select value={newPet.rarity} onChange={(e) => setNewPet({ ...newPet, rarity: e.target.value })} className="px-4 py-2 border rounded-lg">
                  <option value="common">Common</option>
                  <option value="uncommon">Uncommon</option>
                  <option value="rare">Rare</option>
                  <option value="epic">Epic</option>
                  <option value="legendary">Legendary</option>
                </select>
                <input type="number" placeholder="Unlock XP Required" value={newPet.unlock_xp}
                  onChange={(e) => setNewPet({ ...newPet, unlock_xp: parseInt(e.target.value) || 0 })} className="px-4 py-2 border rounded-lg" />
              </div>
              <button onClick={handleAddPet} className="mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg">
                Add Pet
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Rarity</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Owners</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pets.map(pet => (
                  <tr key={pet.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{pet.name}</div>
                      <div className="text-xs text-gray-500">{pet.description}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getRarityColor(pet.rarity)}`}>{pet.rarity}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleToggleActive(pet.id, pet.is_active)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold ${pet.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {pet.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {pet.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3"><OwnerCount petId={pet.id} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => setEditingPet({ ...pet })} className="text-blue-600 hover:text-blue-800"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDeletePet(pet.id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Pet Modal */}
      {editingPet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Edit Pet</h3>
              <button onClick={() => setEditingPet(null)} className="text-gray-500 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={editingPet.name} onChange={(e) => setEditingPet({ ...editingPet, name: e.target.value })} className="w-full px-4 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" value={editingPet.description || ''} onChange={(e) => setEditingPet({ ...editingPet, description: e.target.value })} className="w-full px-4 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                <input type="text" value={editingPet.image_url || ''} onChange={(e) => setEditingPet({ ...editingPet, image_url: e.target.value })} className="w-full px-4 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rarity</label>
                <select value={editingPet.rarity} onChange={(e) => setEditingPet({ ...editingPet, rarity: e.target.value })} className="w-full px-4 py-2 border rounded-lg">
                  <option value="common">Common</option>
                  <option value="uncommon">Uncommon</option>
                  <option value="rare">Rare</option>
                  <option value="epic">Epic</option>
                  <option value="legendary">Legendary</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unlock XP</label>
                <input type="number" value={editingPet.unlock_xp} onChange={(e) => setEditingPet({ ...editingPet, unlock_xp: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2 border rounded-lg" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditingPet(null)} className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleUpdatePet(editingPet.id, { name: editingPet.name, description: editingPet.description, image_url: editingPet.image_url, rarity: editingPet.rarity, unlock_xp: editingPet.unlock_xp })}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2">
                <Save className="w-4 h-4" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Food Tab ── */}
      {activeTab === 'food' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Pet Food & Items</h2>
            <button onClick={() => setShowAddFood(!showAddFood)}
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2">
              {showAddFood ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {showAddFood ? 'Cancel' : 'Add Item'}
            </button>
          </div>

          {showAddFood && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <h3 className="font-bold text-lg mb-4">Add New Pet Item</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="Item Name" value={newFood.name} onChange={(e) => setNewFood({ ...newFood, name: e.target.value })} className="px-4 py-2 border rounded-lg" />
                <input type="text" placeholder="Description" value={newFood.description} onChange={(e) => setNewFood({ ...newFood, description: e.target.value })} className="px-4 py-2 border rounded-lg" />
                <input type="text" placeholder="Image URL" value={newFood.image_url} onChange={(e) => setNewFood({ ...newFood, image_url: e.target.value })} className="px-4 py-2 border rounded-lg" />
                <select value={newFood.item_type} onChange={(e) => setNewFood({ ...newFood, item_type: e.target.value })} className="px-4 py-2 border rounded-lg">
                  <option value="pet_food">Pet Food</option>
                  <option value="pet_toy">Pet Toy</option>
                </select>
                <select value={newFood.rarity} onChange={(e) => setNewFood({ ...newFood, rarity: e.target.value })} className="px-4 py-2 border rounded-lg">
                  <option value="common">Common</option>
                  <option value="uncommon">Uncommon</option>
                  <option value="rare">Rare</option>
                  <option value="epic">Epic</option>
                </select>
              </div>
              <button onClick={handleAddFood} className="mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg">Add Item</button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {petFoodItems.map(item => (
              <div key={item.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-lg">{item.name}</h3>
                    <p className="text-sm text-gray-600">{item.description}</p>
                  </div>
                  <button onClick={() => handleDeleteFood(item.id)} className="text-red-600 hover:text-red-800"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="flex gap-2 mt-2">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getRarityColor(item.rarity)}`}>{item.rarity}</span>
                  <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-700">{item.item_type}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Word Bank Tab ── */}
      {activeTab === 'words' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          {/* Header */}
          <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Word Bank</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search word or hint…"
                  value={wordSearch}
                  onChange={(e) => setWordSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border rounded-lg text-sm w-52"
                />
              </div>
              {/* Difficulty filter */}
              <select value={wordDiffFilter} onChange={(e) => setWordDiffFilter(e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm">
                <option value="all">All difficulties</option>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {/* Add Word */}
              <button onClick={() => setShowAddWord(!showAddWord)}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 text-sm">
                {showAddWord ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {showAddWord ? 'Cancel' : 'Add Word'}
              </button>
            </div>
          </div>

          {/* Add Word Form */}
          {showAddWord && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <input type="text" placeholder="Word" value={newWord.word}
                onChange={(e) => setNewWord({ ...newWord, word: e.target.value })}
                className="px-3 py-2 border rounded-lg text-sm" />
              <input type="text" placeholder="Hint" value={newWord.hint}
                onChange={(e) => setNewWord({ ...newWord, hint: e.target.value })}
                className="px-3 py-2 border rounded-lg text-sm" />
              <select value={newWord.difficulty} onChange={(e) => setNewWord({ ...newWord, difficulty: e.target.value })} className="px-3 py-2 border rounded-lg text-sm">
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 whitespace-nowrap">Min Level</label>
                <input type="number" min={1} max={20} value={newWord.min_level}
                  onChange={(e) => setNewWord({ ...newWord, min_level: parseInt(e.target.value) || 1 })}
                  className="px-3 py-2 border rounded-lg text-sm w-20" />
              </div>
              <input type="text" placeholder="Image URL (optional)" value={newWord.image_url}
                onChange={(e) => setNewWord({ ...newWord, image_url: e.target.value })}
                className="px-3 py-2 border rounded-lg text-sm col-span-1 md:col-span-1" />
              <button onClick={saveNewWord} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg text-sm flex items-center gap-1.5">
                <Save className="w-4 h-4" /> Save
              </button>
            </div>
          )}

          {/* Stats row */}
          <div className="flex gap-4 text-sm text-gray-500 mb-3">
            <span>Showing <strong className="text-gray-800">{filteredWords.length}</strong> of {wordBank.length}</span>
            {['easy', 'medium', 'hard'].map(d => (
              <span key={d}><strong className={d === 'easy' ? 'text-green-600' : d === 'medium' ? 'text-yellow-600' : 'text-red-600'}>
                {wordBank.filter(w => w.difficulty === d).length}
              </strong> {d}</span>
            ))}
          </div>

          {/* Word Table */}
          {wordLoading ? (
            <div className="py-8 text-center text-gray-400">Loading words…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Word</th>
                    <th className="px-3 py-2 text-left">Hint</th>
                    <th className="px-3 py-2 text-left">Difficulty</th>
                    <th className="px-3 py-2 text-left">Min Lvl</th>
                    <th className="px-3 py-2 text-left">Active</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWords.map(w => (
                    <tr key={w.id} className="border-b hover:bg-gray-50">
                      {editingWord?.id === w.id ? (
                        <>
                          <td className="px-3 py-2">
                            <input value={editingWord.word} onChange={(e) => setEditingWord({ ...editingWord, word: e.target.value })}
                              className="w-full px-2 py-1 border rounded text-sm" />
                          </td>
                          <td className="px-3 py-2">
                            <input value={editingWord.hint} onChange={(e) => setEditingWord({ ...editingWord, hint: e.target.value })}
                              className="w-full px-2 py-1 border rounded text-sm" />
                          </td>
                          <td className="px-3 py-2">
                            <select value={editingWord.difficulty} onChange={(e) => setEditingWord({ ...editingWord, difficulty: e.target.value })}
                              className="px-2 py-1 border rounded text-sm">
                              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" min={1} max={20} value={editingWord.min_level}
                              onChange={(e) => setEditingWord({ ...editingWord, min_level: parseInt(e.target.value) || 1 })}
                              className="w-16 px-2 py-1 border rounded text-sm" />
                          </td>
                          <td className="px-3 py-2 text-gray-400">—</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-2">
                              <button onClick={saveEditWord} className="text-green-600 hover:text-green-800"><Save className="w-4 h-4" /></button>
                              <button onClick={() => setEditingWord(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 font-semibold">{w.word}</td>
                          <td className="px-3 py-2 text-gray-600 max-w-xs truncate">{w.hint}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${diffColor(w.difficulty)}`}>{w.difficulty}</span>
                          </td>
                          <td className="px-3 py-2 text-center">{w.min_level}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => toggleWordActive(w.id, w.is_active)}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${w.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {w.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                              {w.is_active ? 'On' : 'Off'}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-2">
                              <button onClick={() => setEditingWord({ ...w })} className="text-blue-600 hover:text-blue-800"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => deleteWord(w.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {filteredWords.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No words found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Question Bank Tab ── */}
      {activeTab === 'questions' && (
        <div className="bg-white rounded-lg shadow-md p-6">
          {/* Header */}
          <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800">Question Bank</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search question or choice…"
                  value={questionSearch}
                  onChange={(e) => setQuestionSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 border rounded-lg text-sm w-52"
                />
              </div>
              <button onClick={() => setShowAddQuestion(!showAddQuestion)}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 text-sm">
                {showAddQuestion ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {showAddQuestion ? 'Cancel' : 'Add Question'}
              </button>
            </div>
          </div>

          {/* Add Question Form */}
          {showAddQuestion && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
              <input type="text" placeholder="Question" value={newQuestion.question}
                onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-sm" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {newQuestion.choices.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setNewQuestion({ ...newQuestion, answer_index: i })}
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 ${
                        newQuestion.answer_index === i ? 'bg-green-500 border-green-600 text-white' : 'bg-white border-gray-300 text-gray-500'
                      }`}
                    >
                      {String.fromCharCode(65 + i)}
                    </button>
                    <input type="text" placeholder={`Choice ${String.fromCharCode(65 + i)}`} value={c}
                      onChange={(e) => {
                        const choices = [...newQuestion.choices]
                        choices[i] = e.target.value
                        setNewQuestion({ ...newQuestion, choices })
                      }}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">Click the letter button to mark the correct answer (green = correct)</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 whitespace-nowrap">Min Level</label>
                  <input type="number" min={1} max={20} value={newQuestion.min_level}
                    onChange={(e) => setNewQuestion({ ...newQuestion, min_level: parseInt(e.target.value) || 1 })}
                    className="px-3 py-2 border rounded-lg text-sm w-20" />
                </div>
                <input type="text" placeholder="Category (optional)" value={newQuestion.category}
                  onChange={(e) => setNewQuestion({ ...newQuestion, category: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm" />
                <input type="text" placeholder="Image URL (optional)" value={newQuestion.image_url}
                  onChange={(e) => setNewQuestion({ ...newQuestion, image_url: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm" />
              </div>
              <button onClick={saveNewQuestion} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg text-sm flex items-center gap-1.5">
                <Save className="w-4 h-4" /> Save
              </button>
            </div>
          )}

          {/* Stats */}
          <div className="flex gap-4 text-sm text-gray-500 mb-3">
            <span>Showing <strong className="text-gray-800">{filteredQuestions.length}</strong> of {questionBank.length}</span>
          </div>

          {/* Question List */}
          {questionLoading ? (
            <div className="py-8 text-center text-gray-400">Loading questions…</div>
          ) : (
            <div className="space-y-3">
              {filteredQuestions.map(q => (
                <div key={q.id} className={`border rounded-lg p-4 ${q.is_active ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                  {editingQuestion?.id === q.id ? (
                    <div className="space-y-3">
                      <input type="text" value={editingQuestion.question}
                        onChange={(e) => setEditingQuestion({ ...editingQuestion, question: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm font-semibold" />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {editingQuestion.choices.map((c, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingQuestion({ ...editingQuestion, answer_index: i })}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 ${
                                editingQuestion.answer_index === i ? 'bg-green-500 border-green-600 text-white' : 'bg-white border-gray-300 text-gray-500'
                              }`}
                            >
                              {String.fromCharCode(65 + i)}
                            </button>
                            <input type="text" value={c}
                              onChange={(e) => {
                                const choices = [...editingQuestion.choices]
                                choices[i] = e.target.value
                                setEditingQuestion({ ...editingQuestion, choices })
                              }}
                              className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-600">Min Level</label>
                          <input type="number" min={1} max={20} value={editingQuestion.min_level}
                            onChange={(e) => setEditingQuestion({ ...editingQuestion, min_level: parseInt(e.target.value) || 1 })}
                            className="w-16 px-2 py-1 border rounded text-sm" />
                        </div>
                        <button onClick={saveEditQuestion} className="text-green-600 hover:text-green-800"><Save className="w-4 h-4" /></button>
                        <button onClick={() => setEditingQuestion(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 mb-2">{q.question}</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {q.choices?.map((c, i) => (
                            <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm ${
                              i === q.answer_index ? 'bg-green-100 text-green-800 font-semibold' : 'bg-gray-100 text-gray-600'
                            }`}>
                              <span className="font-bold text-xs">{String.fromCharCode(65 + i)}.</span> {c}
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-2 text-xs text-gray-400">
                          <span>Level {q.min_level}+</span>
                          {q.category && <span>• {q.category}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => toggleQuestionActive(q.id, q.is_active)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${q.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {q.is_active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {q.is_active ? 'On' : 'Off'}
                        </button>
                        <button onClick={() => setEditingQuestion({ ...q })} className="text-blue-600 hover:text-blue-800"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => deleteQuestion(q.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {filteredQuestions.length === 0 && (
                <div className="py-8 text-center text-gray-400">No questions found</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Helper component to show owner count
const OwnerCount = ({ petId }) => {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const fetchCount = async () => {
      const { count: ownerCount } = await supabase
        .from('user_pets')
        .select('*', { count: 'exact', head: true })
        .eq('pet_id', petId)

      setCount(ownerCount || 0)
    }

    fetchCount()
  }, [petId])

  return <span className="text-sm font-semibold">{count} students</span>
}

export default PetManagement
