'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/app/auth-provider';

const navItems = [
  { href: '/', label: 'ホーム' },
  { href: '/products', label: '商品一覧' },
  { href: '/products/sold-out', label: '完売一覧' },
  { href: '/products/new', label: '商品登録' },
  { href: '/import', label: 'Excel取込' },
  { href: `/dashboard?period=month&year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`, label: 'ダッシュボード' },
  { href: '/settings', label: '設定' },
];

export function Nav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  const isActive = (href: string) => href.startsWith('/dashboard') ? pathname.startsWith('/dashboard') : pathname === href;

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-bold text-emerald-600 text-lg">
              フリマ売上管理
            </Link>
            {user && (
              <div className="hidden md:flex gap-1">
                {navItems.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`px-3 py-2 rounded text-sm font-medium min-h-[40px] flex items-center ${
                      isActive(href) ? 'text-emerald-600 bg-emerald-50' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {user && (
            <div className="flex items-center gap-2 sm:gap-4">
              <span className="hidden sm:inline text-sm text-slate-500 truncate max-w-[120px] md:max-w-[180px]">{user.email}</span>
              <button
                onClick={() => signOut()}
                className="rounded bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200 min-h-[40px]"
              >
                ログアウト
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-slate-100 min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="メニュー"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {mobileMenuOpen ? (
                    <>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </>
                  ) : (
                    <>
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          )}
        </div>
        {user && mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-slate-200">
            <div className="flex flex-col gap-1">
              {navItems.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block py-3 px-4 text-base font-medium rounded-lg min-h-[44px] flex items-center ${
                    isActive(href) ? 'text-emerald-600 bg-emerald-50' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
