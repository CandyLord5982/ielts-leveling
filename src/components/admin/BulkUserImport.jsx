import { useState } from 'react'
import { supabase } from '../../supabase/client'
import { Upload, X, AlertCircle, CheckCircle, Download, Users, UserPlus } from 'lucide-react'
import Button from '../ui/Button'
import Card from '../ui/Card'

const BulkUserImport = ({ onClose, onSuccess }) => {
  const [mode, setMode] = useState('single') // 'single' or 'csv'
  const [file, setFile] = useState(null)
  const [users, setUsers] = useState([])
  const [errors, setErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState(null)

  // Single user form state
  const [singleUser, setSingleUser] = useState({
    email: '',
    password: '',
    username: '',
    full_name: '',
    real_name: '',
    avatar_url: '',
    role: 'user',
    cohort: ''
  })
  const [singleErrors, setSingleErrors] = useState([])

  const handleSingleUserChange = (field, value) => {
    setSingleUser(prev => ({ ...prev, [field]: value }))
    setSingleErrors([])
  }

  const handleSingleUserSubmit = async () => {
    const validationErrors = []
    if (!singleUser.email || !singleUser.email.includes('@')) {
      validationErrors.push('Valid email is required')
    }
    if (!singleUser.password || singleUser.password.length < 6) {
      validationErrors.push('Password must be at least 6 characters')
    }
    if (!singleUser.username?.trim()) {
      validationErrors.push('Username is required')
    }
    if (!singleUser.full_name?.trim()) {
      validationErrors.push('Full name is required')
    }

    if (validationErrors.length > 0) {
      setSingleErrors(validationErrors)
      return
    }

    setImporting(true)
    try {
      const { data, error } = await supabase.functions.invoke('bulk-create-users', {
        body: { users: [singleUser] }
      })

      if (error) throw error

      setResults(data)
      if (data.success.length > 0 && onSuccess) {
        onSuccess()
      }
    } catch (error) {
      console.error('Create user error:', error)
      setResults({
        success: [],
        failed: [{ email: singleUser.email, error: error.message || 'Failed to create user', rowNumber: 1 }]
      })
    } finally {
      setImporting(false)
    }
  }

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile)
      parseCSV(selectedFile)
    } else {
      setErrors(['Please select a valid CSV file'])
    }
  }

  const parseCSV = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const lines = text.split('\n').filter(line => line.trim())

      if (lines.length < 2) {
        setErrors(['CSV file is empty or has no data rows'])
        return
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      const requiredHeaders = ['email', 'password', 'username', 'full_name']
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))

      if (missingHeaders.length > 0) {
        setErrors([`Missing required columns: ${missingHeaders.join(', ')}`])
        return
      }

      const parsedUsers = []
      const parseErrors = []

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim())
        const user = {}

        headers.forEach((header, index) => {
          user[header] = values[index] || ''
        })

        // Validate email
        if (!user.email || !user.email.includes('@')) {
          parseErrors.push(`Row ${i + 1}: Invalid email address`)
          continue
        }

        // Validate password
        if (!user.password || user.password.length < 6) {
          parseErrors.push(`Row ${i + 1}: Password must be at least 6 characters`)
          continue
        }

        // Validate username
        if (!user.username || user.username.trim().length === 0) {
          parseErrors.push(`Row ${i + 1}: Username is required`)
          continue
        }

        // Validate full_name
        if (!user.full_name || user.full_name.trim().length === 0) {
          parseErrors.push(`Row ${i + 1}: Full name is required`)
          continue
        }

        // Validate role
        if (user.role && !['user', 'teacher', 'admin'].includes(user.role.toLowerCase())) {
          parseErrors.push(`Row ${i + 1}: Role must be 'user', 'teacher', or 'admin'`)
          continue
        }

        parsedUsers.push({
          email: user.email,
          password: user.password,
          username: user.username,
          full_name: user.full_name,
          real_name: user.real_name || '',
          avatar_url: user.avatar || user.avatar_url || '',
          role: user.role?.toLowerCase() || 'user',
          cohort: user.cohort || '',
          rowNumber: i + 1
        })
      }

      setUsers(parsedUsers)
      setErrors(parseErrors)
    }

    reader.readAsText(file)
  }

  const handleImport = async () => {
    setImporting(true)

    try {
      // Call Supabase Edge Function to create users
      const { data, error } = await supabase.functions.invoke('bulk-create-users', {
        body: { users }
      })

      if (error) throw error

      setResults(data)

      if (data.success.length > 0 && onSuccess) {
        onSuccess()
      }
    } catch (error) {
      console.error('Import error:', error)
      setResults({
        success: [],
        failed: users.map(user => ({
          email: user.email,
          error: error.message || 'Failed to import',
          rowNumber: user.rowNumber
        }))
      })
    } finally {
      setImporting(false)
    }
  }

  const downloadTemplate = () => {
    const template = 'email,password,username,full_name,real_name,avatar,role,cohort\nstudent@example.com,password123,johndoe,John Doe,Nguyen Van A,https://example.com/avatar.jpg,user,Class A\nteacher@example.com,password123,janesmith,Jane Smith,,,teacher,'
    const blob = new Blob([template], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'bulk_users_template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <Card.Header>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-900">Bulk User Import</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </Card.Header>

        <Card.Content>
          {!results ? (
            <>
              {/* Mode Tabs */}
              <div className="flex border-b mb-6">
                <button
                  onClick={() => setMode('single')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                    mode === 'single'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <UserPlus className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  Single User
                </button>
                <button
                  onClick={() => setMode('csv')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                    mode === 'csv'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Upload className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                  CSV Import
                </button>
              </div>

              {mode === 'single' ? (
                <>
                  {/* Single User Form */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input
                        type="email"
                        value={singleUser.email}
                        onChange={(e) => handleSingleUserChange('email', e.target.value)}
                        className="input w-full"
                        placeholder="student@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                      <input
                        type="text"
                        value={singleUser.password}
                        onChange={(e) => handleSingleUserChange('password', e.target.value)}
                        className="input w-full"
                        placeholder="Min 6 characters"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                      <input
                        type="text"
                        value={singleUser.username}
                        onChange={(e) => handleSingleUserChange('username', e.target.value)}
                        className="input w-full"
                        placeholder="johndoe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                      <input
                        type="text"
                        value={singleUser.full_name}
                        onChange={(e) => handleSingleUserChange('full_name', e.target.value)}
                        className="input w-full"
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Real Name (for reports)</label>
                      <input
                        type="text"
                        value={singleUser.real_name}
                        onChange={(e) => handleSingleUserChange('real_name', e.target.value)}
                        className="input w-full"
                        placeholder="Real name shown in reports (optional)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                      <select
                        value={singleUser.role}
                        onChange={(e) => handleSingleUserChange('role', e.target.value)}
                        className="input w-full"
                      >
                        <option value="user">Học viên</option>
                        <option value="teacher">Giáo viên</option>
                        <option value="admin">Quản trị</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cohort</label>
                      <input
                        type="text"
                        value={singleUser.cohort}
                        onChange={(e) => handleSingleUserChange('cohort', e.target.value)}
                        className="input w-full"
                        placeholder="Class A (optional)"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Avatar URL</label>
                      <input
                        type="text"
                        value={singleUser.avatar_url}
                        onChange={(e) => handleSingleUserChange('avatar_url', e.target.value)}
                        className="input w-full"
                        placeholder="https://example.com/avatar.jpg (optional)"
                      />
                    </div>
                  </div>

                  {/* Single user errors */}
                  {singleErrors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                        <ul className="text-sm text-red-800 space-y-1">
                          {singleErrors.map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={importing}>
                      Cancel
                    </Button>
                    <Button onClick={handleSingleUserSubmit} disabled={importing}>
                      {importing ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Creating...
                        </>
                      ) : (
                        'Create User'
                      )}
                    </Button>
                  </div>
                </>
              ) : (
              <>
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-blue-900 mb-2">CSV Format Requirements:</h3>
                <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                  <li><strong>email</strong> (required): Valid email address</li>
                  <li><strong>password</strong> (required): Minimum 6 characters</li>
                  <li><strong>username</strong> (required): Unique username for login</li>
                  <li><strong>full_name</strong> (required): User's full/display name</li>
                  <li><strong>real_name</strong> (optional): Real name shown in reports for parents</li>
                  <li><strong>avatar</strong> (optional): URL to user's avatar image</li>
                  <li><strong>role</strong> (optional): user, teacher, or admin (default: user)</li>
                  <li><strong>cohort</strong> (optional): Cohort name to assign user to</li>
                </ul>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadTemplate}
                  className="mt-3"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download CSV Template
                </Button>
              </div>

              {/* File Upload */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-6">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <label className="cursor-pointer">
                  <span className="text-blue-600 hover:text-blue-700 font-medium">
                    Choose CSV file
                  </span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                <p className="text-sm text-gray-600 mt-2">or drag and drop</p>
                {file && (
                  <p className="text-sm text-gray-700 mt-2 font-medium">
                    Selected: {file.name}
                  </p>
                )}
              </div>

              {/* Errors */}
              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-red-900 mb-2">Errors Found:</h4>
                      <ul className="text-sm text-red-800 space-y-1">
                        {errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview */}
              {users.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-900 mb-3">
                    Preview ({users.length} users)
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left py-2 px-3 font-medium text-gray-600">Email</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-600">Username</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-600">Full Name</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-600">Avatar</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-600">Role</th>
                          <th className="text-left py-2 px-3 font-medium text-gray-600">Cohort</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {users.slice(0, 10).map((user, index) => (
                          <tr key={index}>
                            <td className="py-2 px-3">{user.email}</td>
                            <td className="py-2 px-3">{user.username || '-'}</td>
                            <td className="py-2 px-3">{user.full_name || '-'}</td>
                            <td className="py-2 px-3">
                              {user.avatar_url ? (
                                <span className="text-green-600 text-xs">✓ Yes</span>
                              ) : (
                                <span className="text-gray-400 text-xs">No</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs ${
                                user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                user.role === 'teacher' ? 'bg-green-100 text-green-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {user.role}
                              </span>
                            </td>
                            <td className="py-2 px-3">{user.cohort || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {users.length > 10 && (
                      <div className="bg-gray-50 py-2 px-3 text-sm text-gray-600 text-center">
                        And {users.length - 10} more...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={onClose} disabled={importing}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={users.length === 0 || importing || errors.length > 0}
                >
                  {importing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Importing...
                    </>
                  ) : (
                    <>Import {users.length} Users</>
                  )}
                </Button>
              </div>
            </>
              )}
            </>
          ) : (
            /* Results */
            <div>
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Import Complete</h3>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-600">
                      {results.success.length}
                    </div>
                    <div className="text-sm text-green-800">Successfully Created</div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="text-2xl font-bold text-red-600">
                      {results.failed.length}
                    </div>
                    <div className="text-sm text-red-800">Failed</div>
                  </div>
                </div>

                {results.failed.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <h4 className="font-semibold text-red-900 mb-2">Failed Imports:</h4>
                    <div className="max-h-48 overflow-y-auto">
                      <ul className="text-sm text-red-800 space-y-1">
                        {results.failed.map((fail, index) => (
                          <li key={index}>
                            Row {fail.rowNumber}: {fail.email} - {fail.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  )
}

export default BulkUserImport
