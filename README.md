# MomTek - Ứng dụng học ngôn ngữ

## 🚀 Tổng quan

MomTek là một ứng dụng web học ngôn ngữ hiện đại được xây dựng với React và Supabase, tập trung vào việc học phát âm và từ vựng thông qua các bài tập tương tác và game giáo dục.

## 🛠️ Tech Stack

### Frontend
- **React 19.1.0** - UI framework
- **React Router DOM 7.6.3** - Client-side routing
- **Vite 7.0.4** - Build tool và dev server
- **Tailwind CSS 3.4.0** - Utility-first CSS framework
- **Lucide React** - Icon library

### Backend & Database
- **Supabase** - Backend-as-a-Service
  - PostgreSQL database
  - Authentication
  - Real-time subscriptions
  - Row Level Security (RLS)

## 📁 Cấu trúc dự án

```
src/
├── components/           # React components
│   ├── auth/            # Authentication components
│   ├── dashboard/       # Dashboard components
│   ├── study/           # Study module components
│   ├── exercises/       # Exercise components
│   ├── admin/           # Admin panel components
│   ├── leaderboard/     # Leaderboard components
│   ├── progress/        # Progress tracking components
│   ├── support/         # Support components
│   ├── navigation/      # Navigation components
│   └── ui/              # Reusable UI components
├── hooks/               # Custom React hooks
├── supabase/           # Supabase configuration & functions
└── utils/              # Utility functions
```

## 🎯 Tính năng chính

### 1. Hệ thống học tập
- **Flashcard exercises** - Học từ vựng
- **Pronunciation exercises** - Luyện phát âm
- **Audio flashcards** - Flashcard có âm thanh
- **Video exercises** - Học qua video

### 2. Theo dõi tiến độ
- Hệ thống cấp độ và XP
- Theo dõi chuỗi ngày học
- Thống kê thời gian luyện tập
- Huy hiệu thành tích

### 3. Quản trị hệ thống
- Quản lý người dùng
- Hệ thống ticket hỗ trợ
- Thống kê và báo cáo

## 🚀 Cài đặt và chạy dự án

### 1. Clone repository
```bash
git clone https://github.com/your-username/momtek.git
cd momtek
```

### 2. Cài đặt dependencies
```bash
npm install
```

### 3. Cấu hình môi trường
Tạo file `.env.local` và điền thông tin Supabase:

```bash
# Tạo file .env.local
touch .env.local
```

Cập nhật các biến môi trường trong `.env.local`:
```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Lưu ý:** Nếu không có file `.env.local`, ứng dụng sẽ chạy với placeholder values và hiển thị warning trong console.

### 4. Thiết lập database

#### 4.1. Chạy database migration
1. **Chạy migration script trong Supabase SQL Editor:**
   ```sql
   -- Copy toàn bộ nội dung từ src/supabase/migration_simple.sql
   ```

   **Hoặc nếu database trống, dùng schema đầy đủ:**
   ```sql
   -- Copy toàn bộ nội dung từ src/supabase/schema_new.sql
   -- Sau đó: src/supabase/sample_data.sql
   ```

#### 4.2. Tắt RLS cho development
```sql
-- Tắt RLS cho development
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.levels DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.units DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_progress DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions DISABLE ROW LEVEL SECURITY;
```

#### 4.3. Cấu hình Authentication
- Vào **Authentication → Settings**
- **Site URL**: `http://localhost:3000`
- **TẮT "Enable email confirmations"** cho development

## 🎯 Study Structure

App có cấu trúc học tập 4 tầng:
```
📚 Study Tab
├── 🏫 Level (Cơ bản, Trung cấp, Nâng cao)
│   ├── 📖 Unit (Giới thiệu bản thân, Gia đình, ...)
│   │   ├── 📋 Session (Chào hỏi cơ bản, Nói về tuổi, ...)
│   │   │   ├── 📝 Exercise (Flashcard, Phát âm, Game, ...)
```

## ✅ Features hoàn thành

### 🔐 Authentication
- ✅ Đăng ký/Đăng nhập với email
- ✅ User profiles với XP, levels, streaks
- ✅ Protected routes
- ✅ Admin role management

### 📚 Study System
- ✅ **4-tier hierarchy**: Level → Unit → Session → Exercise
- ✅ **Progress tracking** với percentages, XP rewards
- ✅ **Lock/unlock system** - sequential progression
- ✅ **3 exercise types**: Flashcard, Pronunciation, Audio, Video
- ✅ **Sample content** đầy đủ cho testing

### 🎮 Exercise Types
- ✅ **Flashcard Exercise** - Từ vựng với pronunciation
- ✅ **Pronunciation Exercise** - Speech recognition ready
- ✅ **Audio Flashcard** - Học qua âm thanh
- ✅ **Video Exercise** - Học qua video

### 📊 Progress & Gamification
- ✅ **XP System** với levels và rewards
- ✅ **Achievement badges** 
- ✅ **Daily streaks** tracking
- ✅ **Leaderboard** system
- ✅ **Progress analytics** dashboard

### 👥 Admin Panel
- ✅ **User management** 
- ✅ **Content analytics** overview

### 🛠️ Technical
- ✅ **React 18** + **Vite** + **Tailwind CSS**
- ✅ **Supabase** backend với PostgreSQL
- ✅ **Responsive design** mobile-first
- ✅ **Error handling** và timeout protection
- ✅ **Production ready** code

### 5. Chạy ứng dụng
```bash
npm run dev
```

Ứng dụng sẽ chạy tại `http://localhost:3000`

## 📝 Scripts

- `npm run dev` - Chạy development server
- `npm run build` - Build production
- `npm run preview` - Preview production build
- `npm run lint` - Chạy ESLint

## 🎨 UI/UX Features

- **Responsive Design** - Tối ưu cho mobile và desktop
- **Dark Mode Support** - Hỗ trợ chế độ tối
- **Modern Animations** - Hiệu ứng mượt mà
- **Accessibility** - Tuân thủ chuẩn a11y

## 🔐 Authentication & Security

- Supabase Auth với email/password
- Row Level Security (RLS)
- Role-based access control
- Session management

## 📊 Database Schema

### Core Tables
- `users` - Thông tin người dùng
- `lessons` - Bài học
- `sections` - Phần của bài học
- `exercises` - Bài tập
- `user_progress` - Tiến độ học tập
- `achievements` - Thành tích
- `game_sessions` - Phiên game

## 🎮 Gamification

- Hệ thống XP và cấp độ
- Bảng xếp hạng
- Thành tích và huy hiệu
- Chuỗi ngày học

## 🔄 State Management

- React Context API cho global state
- Custom hooks cho logic tái sử dụng
- Supabase real-time subscriptions

## 📱 Mobile Support

- Bottom navigation cho mobile
- Touch-friendly interactions
- Responsive grid layouts
- Mobile-optimized forms

## 🌍 Deployment

Dự án có thể deploy trên các platform:
- Vercel
- Netlify
- Firebase Hosting

## 🤝 Contributing

1. Fork repository
2. Tạo feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Tạo Pull Request

## 📄 License

Dự án này được phân phối dưới giấy phép MIT. Xem file `LICENSE` để biết thêm chi tiết.

## 📞 Support

Nếu bạn có câu hỏi hoặc cần hỗ trợ:
- Email: support@momtek.vn
- GitHub Issues: [Create an issue](https://github.com/your-username/momtek/issues)

---

**MomTek** - Học ngôn ngữ thông minh, hiệu quả và thú vị! 🚀
