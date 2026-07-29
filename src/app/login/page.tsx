'use client';

import { signIn } from 'next-auth/react';
import { Wallet, TrendingUp, PieChart, MessageSquare } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-br from-[#F7F9FB] via-white to-emerald-50 px-6">
      {/* Logo & Branding */}
      <div className="text-center mb-12">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#00BC7C] to-emerald-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-200">
          <Wallet className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-[#344554] mb-2">Chi Tiêu Manager</h1>
        <p className="text-muted-foreground text-sm">Quản lý chi tiêu thông minh với AI</p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-3 gap-4 mb-12 max-w-sm w-full">
        <div className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-rose-500" />
          </div>
          <span className="text-[10px] text-muted-foreground text-center">Theo dõi chi tiêu</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-emerald-600" />
          </div>
          <span className="text-[10px] text-muted-foreground text-center">AI ghi nhận</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <PieChart className="w-5 h-5 text-blue-500" />
          </div>
          <span className="text-[10px] text-muted-foreground text-center">Thống kê</span>
        </div>
      </div>

      {/* Login Button */}
      <button
        onClick={() => signIn('google', { callbackUrl: '/' })}
        className="flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 hover:border-gray-300 active:scale-[0.98] w-full max-w-sm justify-center"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        <span className="font-medium text-[#344554]">Đăng nhập với Google</span>
      </button>

      <p className="mt-6 text-xs text-muted-foreground text-center max-w-xs">
        Dữ liệu được lưu trữ riêng tư cho tài khoản của bạn
      </p>
    </div>
  );
}
