import { useState, useEffect } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import Button from "../ui/Button";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { supabase } from "../../supabase/client";

import { assetUrl } from '../../hooks/useBranding';
// Default fallback image (same as Dashboard/Profile)
const DEFAULT_LOGIN_IMAGE =
  "https://images.unsplash.com/photo-1557683316-973673baf926?w=1200&h=400&fit=crop";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loginBgImage, setLoginBgImage] = useState(DEFAULT_LOGIN_IMAGE);

  const { user, signIn } = useAuth();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/";

  // Fetch login page background image from settings
  useEffect(() => {
    fetchLoginPageImage();
  }, []);

  const fetchLoginPageImage = async () => {
    try {
      const { data, error } = await supabase
        .from("site_settings")
        .select("setting_value")
        .eq("setting_key", "login_page_image")
        .single();

      if (data?.setting_value && !error) {
        setLoginBgImage(data.setting_value);
      }
    } catch (error) {
      console.error("Failed to load login image:", error);
      // Use default fallback - already set in state
    }
  };

  if (user) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Check if input is email or username
      let loginEmail = email.trim();

      if (!loginEmail.includes("@")) {
        // It's a username, lookup the email from users table (case-insensitive)
        const { data, error: lookupError } = await supabase
          .from("users")
          .select("email")
          .ilike("username", loginEmail)
          .single();

        if (lookupError || !data) {
          setError("Không tìm thấy tài khoản với username này");
          setLoading(false);
          return;
        }

        loginEmail = data.email;
      }

      const { error } = await signIn(loginEmail, password);
      if (error) {
        setError("Email/Username hoặc mật khẩu không chính xác");
      }
    } catch (err) {
      setError("Có lỗi xảy ra, vui lòng thử lại");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
    } catch (err) {
      setError("Không thể đăng nhập Google. Vui lòng thử lại");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <style>{`
        .neomorphic-card {
          background: transparent;
        }

        @media (min-width: 768px) {
          .neomorphic-card {
            background: transparent;
            border-radius: 15px;
            box-shadow: none;
          }
        }

        .neomorphic-input {
          position: relative;
          width: 100%;
        }

        .custom-border-input {
          width: 100%;
          padding: 10px;
          outline: none;
          background: transparent;
          color: #1e40af;
          font-size: 1em;
          border: none;
          border-left: 2px solid #2b313849;
          border-bottom: 2px solid #2b313849;
          border-bottom-left-radius: 8px;
          transition: border-color 0.3s ease;
        }

        .custom-border-input:focus {
          border-left-color: #2563eb;
          border-bottom-color: #2563eb;
        }

        .neomorphic-input span {
          position: absolute;
          left: 0;
          top: 0;
          transform: translateY(-4px);
          margin-left: 10px;
          padding: 10px;
          pointer-events: none;
          font-size: 14px;
          color: #1e40af;
          text-transform: none;
          transition: 0.5s;
          letter-spacing: normal;
          border-radius: 8px;
          z-index: 2;
        }

        .neomorphic-input input:valid ~ span,
        .neomorphic-input input:focus ~ span {
          transform: translateX(156px) translateY(-15px);
          font-size: 0.8em;
          padding: 5px 10px;
          background: #2563eb;
          letter-spacing: 0.2em;
          color: #fff;
        }

        .neomorphic-input.email-input input:valid ~ span,
        .neomorphic-input.email-input input:focus ~ span {
          transform: translateX(156px) translateY(-15px);
        }

        .neomorphic-button {
          height: 45px;
          width: 120px;
          border-radius: 8px;
          border: 2px solid #2563eb;
          cursor: pointer;
          background-color: #2563eb;
          transition: 0.5s;
          text-transform: none;
          font-size: 14px;
          letter-spacing: normal;
          color: white;
          font-weight: bold;
        }

        .neomorphic-button:hover:not(:disabled) {
          background-color: #1d4ed8;
        }

        .neomorphic-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .signup-title {
          color: #1e40af;
          text-transform: none;
          letter-spacing: normal;
          display: block;
          font-weight: bold;
          font-size: x-large;
          margin-top: 1.5em;
          margin-bottom: 1em;
        }
      `}</style>

      {/* Left Side - Image (hidden on mobile) */}
      <div className="hidden md:flex md:w-3/5 lg:w-3/5 relative overflow-hidden">
        {/* Background Image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${loginBgImage}')` }}
        />

        {/* Content on top of image */}
        <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-white">
          <div>
            <img
              src={assetUrl('/image/Logo_Pinta.png')}
              alt="Pinta Logo"
              className="mb-8 max-w-[200px] h-auto"
            />

            <h1 className="text-4xl lg:text-5xl font-bold mb-4">
              Welcome to IELTS Leveling
            </h1>

            <p className="text-lg lg:text-xl text-blue-100 mb-8">
              Level up your learning journey with gamified education
            </p>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-xl">🎯</span>
                </div>
                <p className="text-blue-50">Track your progress with XP</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-xl">🔥</span>
                </div>
                <p className="text-blue-50">Build streaks and stay motivated</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-xl">🏆</span>
                </div>
                <p className="text-blue-50">Unlock achievements and rewards</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full md:w-2/5 lg:w-2/5 flex flex-col items-center justify-center min-h-screen px-4 bg-white">
        {/* Neomorphic Card - no card on mobile, card on md+ */}
        <div className="neomorphic-card flex flex-col items-center justify-center min-h-[550px] md:min-h-[650px] w-full md:w-[400px] lg:w-[400px] gap-8 p-8 pt-24 md:pt-32 relative">
          {/* Logo - Top Left */}
          <div className="absolute top-1 md:top-6 left-4">
            <img
              src={assetUrl('/Asset%205.png')}
              alt="Logo"
              width={64}
              height={64}
            />
          </div>

          {/* Top right dots */}
          <div className="absolute top-4 md:top-8 right-4 flex gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <div className="w-3 h-3 rounded-full bg-pink-500"></div>
          </div>

          <a className="signup-title">Welcome back, player!</a>

          <form
            onSubmit={handleSubmit}
            className="w-full flex flex-col items-center gap-8"
          >
            {error && (
              <div className="bg-red-50 border-2 border-red-400 text-red-700 px-4 py-2 rounded-lg text-sm w-full">
                {error}
              </div>
            )}

            {/* Email/Username Field */}
            <div className="neomorphic-input email-input w-[280px]">
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="custom-border-input"
              />
              <span>Username</span>
            </div>

            {/* Password Field */}
            <div className="neomorphic-input w-[280px]">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="custom-border-input"
              />
              <span>Password</span>
              <button
                type="button"
                className="absolute right-2 top-2 text-blue-600"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="neomorphic-button mb-6"
            >
              {loading ? "Loading..." : "Đăng nhập"}
            </button>
          </form>

          {/* Google Sign-In - Hidden */}
          {/* <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-[280px] border-2 border-blue-600 hover:bg-blue-600 hover:text-white text-blue-700 rounded-lg px-4 py-2 flex items-center justify-center gap-2 disabled:opacity-50 transition-all duration-300"
          >
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              alt="Google"
              className="w-5 h-5"
            />
            <span className="text-sm font-medium">Google</span>
          </button> */}

          {/* Divider */}
          <div className="flex items-center w-[280px]">
            <div className="flex-1 border-t border-gray-300"></div>
            <span className="px-3 text-xs text-gray-500">hoặc</span>
            <div className="flex-1 border-t border-gray-300"></div>
          </div>

          {/* Guest Button */}
          <Link
            to="/guest"
            className="w-[280px] border-2 border-blue-600 hover:bg-blue-600 hover:text-white text-blue-700 rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-all duration-300 mb-4"
          >
            Dùng thử miễn phí
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
