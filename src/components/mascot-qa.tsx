'use client';

import { useState } from 'react';
import { useAuth } from '@/app/auth-provider';
import { FAQ_ITEMS } from '@/data/faq';

export function MascotQA() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-[100] w-[60px] md:w-[100px] pointer-events-auto cursor-pointer hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 rounded-lg"
        aria-label="よくある質問を表示"
        title="よくある質問"
      >
        <img
          src="/images/mcgSbmtM.png"
          alt="マスコット"
          width={100}
          height={100}
          className="w-full h-auto object-contain drop-shadow-sm"
          style={{ background: 'transparent' }}
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
          aria-modal="true"
          role="dialog"
          aria-labelledby="faq-title"
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h2 id="faq-title" className="font-bold text-lg">よくある質問</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                aria-label="閉じる"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {FAQ_ITEMS.map((item, i) => (
                <details
                  key={i}
                  className="group rounded-lg border border-slate-200 overflow-hidden"
                >
                  <summary className="px-4 py-3 cursor-pointer list-none flex items-center justify-between gap-2 text-left font-medium text-slate-700 hover:bg-slate-50">
                    <span className="flex-1">{item.q}</span>
                    <span className="text-slate-400 group-open:rotate-180 transition-transform">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </summary>
                  <div className="px-4 py-3 bg-slate-50 text-slate-600 text-sm border-t border-slate-100">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
