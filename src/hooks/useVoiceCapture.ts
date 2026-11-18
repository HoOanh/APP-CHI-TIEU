'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

interface VoiceResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onsoundend: (() => void) | null;
  onstart: (() => void) | null;
  onresult: ((event: { resultIndex?: number; results: ArrayLike<VoiceResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechConstructor = new () => BrowserSpeechRecognition;
export type MicPermissionState = 'unknown' | 'granted' | 'prompt' | 'denied';

const MIC_GRANTED_STORAGE_KEY = 'chi-tieu:mic-granted-once';
const SPEECH_UNAVAILABLE_SESSION_KEY = 'chi-tieu:speech-service-unavailable';

let browserSpeechServiceUnavailable = false;

const emptySubscribe = () => () => {};

function isIosOrMobileBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function isSpeechServiceUnavailable(): boolean {
  if (browserSpeechServiceUnavailable) return true;
  if (typeof window === 'undefined') return true;
  // On mobile/iOS browsers, running Web Speech API and MediaRecorder simultaneously
  // causes OS hardware mic contention and silent dropouts. Use MediaRecorder + AI directly.
  if (isIosOrMobileBrowser()) return true;
  try {
    if (window.sessionStorage.getItem(SPEECH_UNAVAILABLE_SESSION_KEY) === '1') {
      browserSpeechServiceUnavailable = true;
      return true;
    }
  } catch {
    // Ignore storage access errors.
  }
  return false;
}

function markSpeechServiceUnavailable() {
  browserSpeechServiceUnavailable = true;
  try {
    window.sessionStorage.setItem(SPEECH_UNAVAILABLE_SESSION_KEY, '1');
  } catch {
    // Ignore storage access errors.
  }
}

function readMicGrantedStorage() {
  try {
    return window.localStorage.getItem(MIC_GRANTED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markMicGrantedStorage() {
  try {
    window.localStorage.setItem(MIC_GRANTED_STORAGE_KEY, '1');
  } catch {
    // Ignore storage errors in private mode.
  }
}

function getPermissionHelpMessage() {
  if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    return 'Chưa có quyền mic. Trên iPhone: bấm aA trên thanh địa chỉ → Cài đặt trang web → Micrô → Cho phép để không bị hỏi lại.';
  }
  return 'Chưa có quyền mic. Hãy bấm biểu tượng khóa/cài đặt bên cạnh địa chỉ web → Cho phép Micrô để trình duyệt tự lưu quyền.';
}

const errorMessages: Record<string, string> = {
  'not-allowed': getPermissionHelpMessage(),
  'service-not-allowed': getPermissionHelpMessage(),
  'audio-capture': 'Không tìm thấy mic. Kiểm tra thiết bị thu âm hoặc nhập bằng bàn phím.',
  'no-speech': 'Chưa nghe rõ. Bấm mic và nói, ví dụ “cà phê bốn mươi lăm nghìn”.',
  'language-not-supported': 'Trình duyệt chưa hỗ trợ nhận giọng tiếng Việt. Dùng mic trên bàn phím rồi bấm Gửi.',
  network: 'Không thể kết nối dịch vụ nhận diện giọng nói. Hãy kiểm tra mạng và thử lại.',
};

function joinParts(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAmountOrNumberCue(text: string): boolean {
  return /\d|nghìn|ngàn|triệu|trăm|chục|mươi|mốt|tư|lăm|k\b|tr\b|đồng/iu.test(text);
}

function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

async function requestAiAudioTranscription(blob: Blob): Promise<string> {
  const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  const file = new File([blob], `voice.${extension}`, { type: blob.type || 'audio/webm' });
  const formData = new FormData();
  formData.append('audio', file);

  const response = await fetch('/api/chat/transcribe', {
    method: 'POST',
    body: formData,
  });
  const payload = await response.json().catch(() => ({})) as { text?: string; error?: string };
  if (!response.ok) {
    throw new Error(payload.error || 'Không thể nhận diện giọng nói.');
  }
  return (payload.text ?? '').trim();
}

export function useVoiceCapture(
  onTranscript: (text: string) => void,
  focusComposer: () => void,
  onEditTranscript?: (text: string) => void,
) {
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recognitionEndedRef = useRef(true);
  const recognitionWaitResolverRef = useRef<(() => void) | null>(null);
  const speechRecognitionFailedRef = useRef(false);
  const speechEndedEarlyRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const chunksRef = useRef<BlobPart[]>([]);
  const recorderMimeRef = useRef<string>('audio/webm');
  const everDetectedSpeechRef = useRef(false);
  const lastSpeechAtRef = useRef(0);

  const stopFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const speechDecayTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const userStoppedRef = useRef(false);
  const stopActionRef = useRef<'submit' | 'edit' | 'cancel'>('submit');
  const cancelledRef = useRef(false);
  const finalizedRef = useRef(false);

  const committedTextRef = useRef('');
  const sessionFinalRef = useRef('');
  const sessionInterimRef = useRef('');
  const onTranscriptRef = useRef(onTranscript);
  const onEditTranscriptRef = useRef(onEditTranscript);
  const focusComposerRef = useRef(focusComposer);

  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speechActive, setSpeechActive] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('');
  const [permissionState, setPermissionState] = useState<MicPermissionState>('unknown');
  const [grantedThisSession, setGrantedThisSession] = useState(false);

  const isMobileClient = useSyncExternalStore(emptySubscribe, isIosOrMobileBrowser, () => false);
  const wasGrantedBefore = useSyncExternalStore(emptySubscribe, readMicGrantedStorage, () => false) || grantedThisSession;

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onEditTranscriptRef.current = onEditTranscript;
    focusComposerRef.current = focusComposer;
  }, [onTranscript, onEditTranscript, focusComposer]);

  const liveTranscript = joinParts(finalTranscript, interimTranscript);

  const clearTimers = useCallback(() => {
    clearTimeout(stopFallbackTimerRef.current);
    clearTimeout(speechDecayTimerRef.current);
    clearTimeout(maxDurationTimerRef.current);
    clearInterval(meterIntervalRef.current);
  }, []);

  const releaseAudioResources = useCallback(() => {
    clearInterval(meterIntervalRef.current);
    const stream = mediaStreamRef.current;
    mediaStreamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(() => {});
    }
  }, []);

  const stopMediaHardware = useCallback(() => {
    clearInterval(meterIntervalRef.current);
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // Ignore stop errors.
      }
    }
    releaseAudioResources();
  }, [releaseAudioResources]);

  const triggerSpeechActivity = useCallback(() => {
    setSpeechActive(true);
    clearTimeout(speechDecayTimerRef.current);
    speechDecayTimerRef.current = setTimeout(() => {
      setSpeechActive(false);
    }, 550);
  }, []);

  useEffect(() => {
    let permissionStatus: PermissionStatus | null = null;
    let active = true;

    const queryPermission = async () => {
      if (!navigator.permissions?.query) return;
      try {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (!active) return;
        permissionStatus = status;
        setPermissionState(status.state);
        if (status.state === 'granted') {
          markMicGrantedStorage();
          setGrantedThisSession(true);
        }
        status.onchange = () => {
          if (!active) return;
          setPermissionState(status.state);
          if (status.state === 'granted') {
            markMicGrantedStorage();
            setGrantedThisSession(true);
          }
        };
      } catch {
        // Older browsers may not support permissions.query('microphone').
      }
    };

    void queryPermission();
    return () => {
      active = false;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, []);

  useEffect(() => () => {
    clearTimers();
    cancelledRef.current = true;
    userStoppedRef.current = true;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    try {
      recognition?.abort();
    } catch {
      // Ignore abort errors.
    }
    stopMediaHardware();
  }, [clearTimers, stopMediaHardware]);

  const syncDisplayedTranscript = useCallback(() => {
    setFinalTranscript(joinParts(committedTextRef.current, sessionFinalRef.current));
    setInterimTranscript(sessionInterimRef.current.trim());
  }, []);

  const finishSession = useCallback((options: { action: 'submit' | 'edit' | 'cancel'; status?: string; overrideText?: string }) => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    clearTimers();
    stopMediaHardware();

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      recognition.onaudiostart = null;
      recognition.onsoundstart = null;
      recognition.onspeechstart = null;
      recognition.onspeechend = null;
      recognition.onsoundend = null;
      try {
        recognition.abort();
      } catch {
        // Ignore abort errors.
      }
    }

    const fullText = (options.overrideText ?? joinParts(
      committedTextRef.current,
      sessionFinalRef.current,
      sessionInterimRef.current,
    )).trim();

    committedTextRef.current = '';
    sessionFinalRef.current = '';
    sessionInterimRef.current = '';
    chunksRef.current = [];
    setListening(false);
    setTranscribing(false);
    setSpeechActive(false);
    setFinalTranscript('');
    setInterimTranscript('');

    if (options.action === 'submit') {
      if (fullText) {
        setVoiceStatus('');
        onTranscriptRef.current(fullText);
      } else {
        setVoiceStatus(options.status ?? errorMessages['no-speech']);
      }
    } else if (options.action === 'edit') {
      setVoiceStatus('');
      if (fullText) {
        onEditTranscriptRef.current?.(fullText);
      }
      focusComposerRef.current();
    } else {
      setVoiceStatus(options.status ?? '');
    }
  }, [clearTimers, stopMediaHardware]);

  const startParallelSpeechPreview = useCallback(() => {
    if (isSpeechServiceUnavailable()) return;
    const browser = window as Window & {
      SpeechRecognition?: SpeechConstructor;
      webkitSpeechRecognition?: SpeechConstructor;
    };
    const SpeechCtor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!SpeechCtor) return;

    try {
      const recognition = new SpeechCtor();
      recognition.lang = 'vi-VN';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;
      recognitionEndedRef.current = false;

      recognition.onresult = (event) => {
        if (recognitionRef.current !== recognition || cancelledRef.current) return;
        const finalParts: string[] = [];
        const interimParts: string[] = [];
        for (let i = 0; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result?.[0]?.transcript ?? '';
          if (!text.trim()) continue;
          if (result.isFinal) {
            finalParts.push(text);
          } else {
            interimParts.push(text);
          }
        }
        sessionFinalRef.current = joinParts(...finalParts);
        sessionInterimRef.current = joinParts(...interimParts);
        syncDisplayedTranscript();
        everDetectedSpeechRef.current = true;
        triggerSpeechActivity();
      };

      recognition.onerror = (event) => {
        if (recognitionRef.current !== recognition || cancelledRef.current) return;
        if (
          event.error === 'network'
          || event.error === 'service-not-allowed'
          || event.error === 'language-not-supported'
        ) {
          markSpeechServiceUnavailable();
        }
        if (event.error !== 'no-speech') {
          speechRecognitionFailedRef.current = true;
        }
      };

      recognition.onend = () => {
        recognitionEndedRef.current = true;
        if (recognitionWaitResolverRef.current) {
          recognitionWaitResolverRef.current();
          recognitionWaitResolverRef.current = null;
        }
        if (recognitionRef.current !== recognition || cancelledRef.current) return;
        if (!userStoppedRef.current) {
          // SpeechRecognition stopped prematurely while user is still recording via MediaRecorder.
          speechEndedEarlyRef.current = true;
          committedTextRef.current = joinParts(
            committedTextRef.current,
            sessionFinalRef.current,
            sessionInterimRef.current,
          );
          sessionFinalRef.current = '';
          sessionInterimRef.current = '';
          syncDisplayedTranscript();
        }
      };

      recognition.start();
    } catch {
      speechRecognitionFailedRef.current = true;
      recognitionEndedRef.current = true;
    }
  }, [syncDisplayedTranscript, triggerSpeechActivity]);

  const startVoice = useCallback(() => {
    if (recognitionRef.current || mediaRecorderRef.current || listening) return;

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setVoiceStatus('Trang cần chạy qua HTTPS để trình duyệt cấp và lưu quyền mic.');
      focusComposerRef.current();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceStatus('Trình duyệt chưa hỗ trợ thu âm trực tiếp. Dùng mic trên bàn phím rồi bấm Gửi.');
      focusComposerRef.current();
      return;
    }

    clearTimers();
    userStoppedRef.current = false;
    stopActionRef.current = 'submit';
    cancelledRef.current = false;
    finalizedRef.current = false;
    speechRecognitionFailedRef.current = false;
    speechEndedEarlyRef.current = false;
    recognitionEndedRef.current = true;
    recognitionWaitResolverRef.current = null;
    committedTextRef.current = '';
    sessionFinalRef.current = '';
    sessionInterimRef.current = '';
    chunksRef.current = [];
    everDetectedSpeechRef.current = false;
    lastSpeechAtRef.current = 0;

    setFinalTranscript('');
    setInterimTranscript('');
    setVoiceStatus('');
    setSpeechActive(false);
    setTranscribing(false);
    setListening(true);

    // Unlock AudioContext synchronously inside user click gesture (critical for iOS Safari / WebKit).
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      try {
        const audioCtx = new AudioCtx();
        void audioCtx.resume().catch(() => {});
        audioContextRef.current = audioCtx;
      } catch {
        // Ignore AudioContext creation failure.
      }
    }

    maxDurationTimerRef.current = setTimeout(() => {
      if (userStoppedRef.current) return;
      userStoppedRef.current = true;
      stopActionRef.current = 'submit';
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          finishSession({ action: 'submit' });
        }
      } else {
        finishSession({ action: 'submit' });
      }
    }, 90_000);

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (cancelledRef.current || userStoppedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        markMicGrantedStorage();
        setGrantedThisSession(true);
        setPermissionState('granted');
        setVoiceStatus('');
        mediaStreamRef.current = stream;

        const mimeType = pickSupportedAudioMimeType();
        recorderMimeRef.current = mimeType || 'audio/webm';
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.onstop = async () => {
          clearTimeout(stopFallbackTimerRef.current);
          releaseAudioResources();

          const action = stopActionRef.current;
          if (cancelledRef.current || action === 'cancel') {
            finishSession({ action: 'cancel' });
            return;
          }

          // If desktop SpeechRecognition was running, allow up to 300ms for its final onresult event.
          if (recognitionRef.current && !recognitionEndedRef.current) {
            await new Promise<void>((resolve) => {
              recognitionWaitResolverRef.current = resolve;
              setTimeout(resolve, 300);
            });
          }

          const blob = new Blob(chunksRef.current, { type: recorderMimeRef.current });
          const speechText = joinParts(
            committedTextRef.current,
            sessionFinalRef.current,
            sessionInterimRef.current,
          );

          // Fast path: if desktop SpeechRecognition ran cleanly without stopping early or failing,
          // and captured a phrase that includes an amount/number, submit immediately!
          const canTrustSpeechText =
            Boolean(speechText)
            && !speechRecognitionFailedRef.current
            && !speechEndedEarlyRef.current
            && hasAmountOrNumberCue(speechText);

          if (canTrustSpeechText) {
            finishSession({ action, overrideText: speechText });
            return;
          }

          if (blob.size < 600) {
            finishSession({ action, overrideText: speechText });
            return;
          }

          setTranscribing(true);
          setInterimTranscript('Đang nhận diện giọng nói…');
          try {
            const aiText = await requestAiAudioTranscription(blob);
            finishSession({ action, overrideText: aiText || speechText });
          } catch (error) {
            const message = error instanceof Error ? error.message : errorMessages.network;
            if (speechText) {
              finishSession({ action, overrideText: speechText });
            } else {
              finishSession({ action: 'cancel', status: message });
            }
          }
        };

        // Connect live microphone stream to Web Audio analyser for responsive waveform animation
        const audioCtx = audioContextRef.current;
        if (audioCtx) {
          try {
            if (audioCtx.state === 'suspended') {
              void audioCtx.resume().catch(() => {});
            }
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            const dataArray = new Uint8Array(analyser.fftSize);

            meterIntervalRef.current = setInterval(() => {
              if (cancelledRef.current || userStoppedRef.current) return;
              analyser.getByteTimeDomainData(dataArray);
              let sumSquares = 0;
              for (let i = 0; i < dataArray.length; i += 1) {
                const normalized = (dataArray[i] - 128) / 128;
                sumSquares += normalized * normalized;
              }
              const rms = Math.sqrt(sumSquares / dataArray.length);
              const now = Date.now();

              if (rms > 0.009) {
                setSpeechActive(true);
                everDetectedSpeechRef.current = true;
                lastSpeechAtRef.current = now;
              } else if (now - lastSpeechAtRef.current > 260) {
                setSpeechActive(false);
              }
            }, 60);
          } catch {
            // Ignore analyser setup failure.
          }
        }

        recorder.start(200);
        startParallelSpeechPreview();
      } catch (error) {
        const isDenied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
        if (isDenied) setPermissionState('denied');
        finishSession({
          action: 'cancel',
          status: isDenied ? getPermissionHelpMessage() : errorMessages['audio-capture'],
        });
        focusComposerRef.current();
      }
    })();
  }, [clearTimers, finishSession, listening, releaseAudioResources, startParallelSpeechPreview]);

  const stopWithAction = useCallback((action: 'submit' | 'edit') => {
    if (!listening || transcribing) return;
    userStoppedRef.current = true;
    stopActionRef.current = action;
    clearInterval(meterIntervalRef.current);

    const recognition = recognitionRef.current;
    if (recognition && !recognitionEndedRef.current) {
      try {
        recognition.stop();
      } catch {
        recognitionEndedRef.current = true;
      }
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        // Request final buffered data and stop recorder; stream tracks are released inside recorder.onstop
        // so the last words spoken right before clicking Stop are never cut off!
        recorder.stop();
        stopFallbackTimerRef.current = setTimeout(() => {
          finishSession({ action });
        }, 1500);
        return;
      } catch {
        // Fall through to finishSession if recorder.stop() throws.
      }
    }

    finishSession({ action });
  }, [finishSession, listening, transcribing]);

  const stopAndSubmitVoice = useCallback(() => {
    stopWithAction('submit');
  }, [stopWithAction]);

  const stopAndEditVoice = useCallback(() => {
    stopWithAction('edit');
  }, [stopWithAction]);

  const cancelVoice = useCallback(() => {
    cancelledRef.current = true;
    userStoppedRef.current = true;
    stopActionRef.current = 'cancel';
    const recognition = recognitionRef.current;
    try {
      recognition?.abort();
    } catch {
      // Ignore abort errors.
    }
    finishSession({ action: 'cancel' });
  }, [finishSession]);

  const toggleVoice = useCallback(() => {
    if (listening) {
      stopAndSubmitVoice();
    } else {
      startVoice();
    }
  }, [listening, startVoice, stopAndSubmitVoice]);

  const showMobilePermissionHint = isMobileClient && permissionState !== 'granted' && !wasGrantedBefore;

  return {
    listening,
    transcribing,
    speechActive,
    finalTranscript,
    interimTranscript,
    liveTranscript,
    voiceStatus,
    permissionState,
    showMobilePermissionHint,
    startVoice,
    stopAndSubmitVoice,
    stopAndEditVoice,
    cancelVoice,
    toggleVoice,
  };
}
