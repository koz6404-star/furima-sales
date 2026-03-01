'use client';

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
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          <div className="flex gap-6">
            <Link href="/" className="font-bold text-emerald-600">
              フリマ売上管理
            </Link>
            {user && (
              <div className="hidden md:flex gap-4">
                {navItems.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`text-sm font-medium ${
                      href.startsWith('/dashboard') ? pathname.startsWith('/dashboard') : pathname === href
                        ? 'text-emerald-600'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {user && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-500">{user.email}</span>
              <button
                onClick={() => signOut()}
                className="rounded bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200"
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
