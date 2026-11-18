'use client';

import { useEffect, useRef, useState } from 'react';

interface VoiceResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<VoiceResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechConstructor = new () => BrowserSpeechRecognition;

const messages: Record<string, string> = {
  'not-allowed': 'Chưa cấp quyền mic. Có thể dùng mic trên bàn phím rồi bấm Gửi.',
  'service-not-allowed': 'Trình duyệt chưa hỗ trợ ghi giọng nói ở đây. Dùng mic trên bàn phím rồi bấm Gửi.',
  'audio-capture': 'Không tìm thấy mic. Kiểm tra mic hoặc nhập bằng bàn phím.',
  'no-speech': 'Chưa nghe rõ. Bấm mic và nói, ví dụ “cà phê bốn mươi lăm nghìn”.',
  'language-not-supported': 'Trình duyệt chưa hỗ trợ nhận giọng tiếng Việt. Dùng mic trên bàn phím rồi bấm Gửi.',
  network: 'Nhận giọng nói cần mạng. Thử lại hoặc dùng mic trên bàn phím.',
};

export function useVoiceCapture(onTranscript: (text: string) => void, focusComposer: () => void) {
  const current = useRef<BrowserSpeechRecognition | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');

  useEffect(() => () => {
    clearTimeout(timeout.current);
    const recognition = current.current;
    current.current = null;
    recognition?.abort();
  }, []);

  function toggleVoice() {
    if (current.current) {
      current.current.stop();
      return;
    }

    const browser = window as Window & {
      SpeechRecognition?: SpeechConstructor;
      webkitSpeechRecognition?: SpeechConstructor;
    };
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus('Dùng mic trên bàn phím để nói, rồi bấm Gửi.');
      focusComposer();
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'vi-VN';
    recognition.continuous = false;
    recognition.interimResults = false;
    current.current = recognition;
    setListening(true);
    setVoiceStatus('Đang nghe… Nói tên khoản và số tiền.');

    function finish(status = '') {
      if (current.current !== recognition) return false;
      clearTimeout(timeout.current);
      current.current = null;
      setListening(false);
      setVoiceStatus(status);
      return true;
    }

    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript)
        .join(' ')
        .trim();
      if (text && finish()) onTranscript(text);
    };
    recognition.onerror = (event) => {
      if (finish(messages[event.error] ?? 'Mic chưa sẵn sàng. Dùng mic trên bàn phím rồi bấm Gửi.')) focusComposer();
    };
    recognition.onend = () => finish(messages['no-speech']);
    try {
      recognition.start();
      timeout.current = setTimeout(() => {
        if (finish(messages['no-speech'])) recognition.abort();
      }, 20_000);
    } catch {
      if (finish('Mic chưa sẵn sàng. Dùng mic trên bàn phím rồi bấm Gửi.')) focusComposer();
    }
  }

  return { listening, voiceStatus, toggleVoice };
}
