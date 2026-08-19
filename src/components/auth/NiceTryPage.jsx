import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

// Decoy page mounted at /register. The real sign-up form moved to the secret
// path in src/config/registration.js, so anyone who lands here typed the
// obvious URL on purpose. They get a joke instead of a form.

const MEME_IMAGE =
  'https://media.licdn.com/dms/image/v2/C5612AQEPXYvuzJ9baA/article-cover_image-shrink_600_2000/article-cover_image-shrink_600_2000/0/1520181432190?e=2147483647&v=beta&t=45tX8Oj5VMKx3qu7Gw9RTMWgoEONn7Po8xK7r6IR5o0'

const NiceTryPage = () => {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-lg text-center">
        {!imageFailed && (
          <img
            src={MEME_IMAGE}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="w-full max-w-md mx-auto mb-8 rounded-2xl shadow-sm"
          />
        )}

        <h1 className="text-4xl font-bold text-gray-900 mb-3">Nice try 😏</h1>

        <p className="text-gray-600">Trang đăng ký không nằm ở đây.</p>

        <Link
          to="/login"
          className="inline-flex items-center justify-center gap-2 mt-8 text-sm text-gray-500 hover:text-blue-600 transition-colors"
        >
          <ArrowLeft size={16} /> Về trang đăng nhập
        </Link>
      </div>
    </div>
  )
}

export default NiceTryPage
