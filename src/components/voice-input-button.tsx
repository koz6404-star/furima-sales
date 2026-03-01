'use client';

import { useState, useCallback, useRef } from 'react';

function getSpeechRecognition(): (new () => object) | null {
  if (typeof window === 'undefined') return null;
  const w = window as { SpeechRecognition?: new () => object; webkitSpeechRecognition?: new () => object };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MicIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className ?? 'w-5 h-5'}>
    <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
    <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 0010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6.6 6.74 6.751 6.751 0 01-6.6-6.74v-1.5A.75.75 0 016 10.5z" />
  </svg>
);

export function VoiceInputButton({
  onResult,
  disabled = false,
  className = '',
  size = 'md',
  title = '音声入力',
}: {
  onResult: (text: string) => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState(() => getSpeechRecognition() != null);
  const recognitionRef = useRef<{ start(): void; stop(): void } | null>(null);

  const handleClick = useCallback(() => {
    if (!isSupported || disabled) return;

    const Recognition = getSpeechRecognition();
    if (!Recognition) return;

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
      return;
    }

    // Web Speech API: 型定義が標準libにないため any で扱う
    const recognition = new Recognition() as Record<string, unknown> & { start(): void; stop(): void };
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    let finalText = '';

    recognition.onresult = (event: { resultIndex: number; results: { length: number; [key: number]: { isFinal: boolean; 0: { transcript: string } } } }) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        }
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      if (finalText.trim()) onResult(finalText.trim());
    };

    recognition.onerror = (event: { error: string }) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.warn('[VoiceInput]', event.error);
      }
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      setIsListening(true);
    } catch (e) {
      console.warn('[VoiceInput] start failed:', e);
      setIsListening(false);
    }
  }, [isSupported, disabled, isListening, onResult]);

  if (!isSupported) return null;

  const sizeClasses = size === 'sm' ? 'w-9 h-9 min-w-[2.25rem] min-h-[2.25rem]' : size === 'lg' ? 'w-12 h-12 min-w-[3rem] min-h-[3rem]' : 'w-11 h-11 min-w-[2.75rem] min-h-[2.75rem]';
  const iconSize = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`
        ${sizeClasses}
        flex items-center justify-center rounded-lg border border-slate-300
        bg-white text-slate-600
        hover:bg-slate-50 hover:border-slate-400
        disabled:opacity-50 disabled:cursor-not-allowed
        touch-manipulation transition-colors
        focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1
        ${isListening ? 'bg-red-50 border-red-300 text-red-600' : ''}
        ${className}
      `}
    >
      <MicIcon className={iconSize} />
    </button>
  );
}
