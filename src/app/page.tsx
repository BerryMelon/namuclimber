'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { fetchWikiPage, getRandomWikiPage, fetchWikiSummary } from '@/utils/WikiProxy';
import { supabase } from '@/utils/supabase';

type GameStatus = 'idle' | 'countdown' | 'playing' | 'congrats' | 'failed';
type Language = 'en' | 'ko';

interface RankingEntry {
  id: string;
  player_name: string;
  target_word: string;
  time_ms: number;
  path: string[];
  created_at: string;
}

const i18n = {
  en: {
    welcome: "WikiRun",
    description: "Navigate through Wikipedia links to reach the target page. No keyboard allowed!",
    rulesTitle: "Rules:",
    rules: [
      "Mouse/Touch clicks only.",
      "Reach the target title to win.",
      "No keyboard inputs allowed.",
      "No tab or app switching."
    ],
    start: "Start Expedition",
    stop: "Stop",
    target: "Target",
    currentPage: "Current Page",
    rankings: "Rankings",
    daily: "Daily",
    monthly: "Monthly",
    overall: "Overall",
    noRankings: "No rankings found.",
    viewProgress: "VIEW PROGRESS",
    preparing: "Preparing Expedition...",
    success: "Success!",
    reached: "You reached",
    in: "in",
    yourPath: "Your Path",
    yourName: "Your Name",
    submit: "Submit",
    skip: "Skip and return to menu",
    gameOver: "Game Over",
    keyboardError: "Keyboard input detected!",
    focusError: "Focus loss detected!",
    initError: "Failed to initialize game. Please try again.",
    scoreSuccess: "Score submitted!",
    scoreError: "Failed to submit score."
  },
  ko: {
    welcome: "위키런",
    description: "위키백과 링크를 타고 탐험하여 목표 페이지에 도달하세요. 키보드 사용은 금지됩니다!",
    rulesTitle: "규칙:",
    rules: [
      "마우스/터치 클릭만 가능합니다.",
      "목표 제목에 도달하면 승리합니다.",
      "키보드 입력은 금지됩니다.",
      "화면 이탈 시 게임이 종료됩니다."
    ],
    start: "탐험 시작",
    stop: "중단",
    target: "목표",
    currentPage: "현재 페이지",
    rankings: "랭킹",
    daily: "일간",
    monthly: "월간",
    overall: "전체",
    noRankings: "기록이 없습니다.",
    viewProgress: "경로 보기",
    preparing: "탐험 준비 중...",
    success: "성공!",
    reached: "목표인",
    in: "에 도달했습니다! 소요 시간:",
    yourPath: "이동 경로",
    yourName: "이름",
    submit: "등록",
    skip: "등록 없이 메뉴로 돌아가기",
    gameOver: "게임 오버",
    keyboardError: "키보드 입력이 감지되었습니다!",
    focusError: "화면 이탈이 감지되었습니다!",
    initError: "게임 초기화에 실패했습니다. 다시 시도해 주세요.",
    scoreSuccess: "점수가 등록되었습니다!",
    scoreError: "점수 등록에 실패했습니다."
  }
};

// Separate Timer component
const TimerDisplay = memo(({ status, onFinish }: { status: GameStatus, onFinish?: (finalTime: number) => void }) => {
  const [displayTime, setDisplayTime] = useState(0);
  const timeRef = useRef(0);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (status === 'playing') {
      const startTime = Date.now();
      interval = setInterval(() => {
        const now = Date.now() - startTime;
        timeRef.current = now;
        setDisplayTime(now);
      }, 50);
    } else if (status === 'congrats' || status === 'failed' || status === 'idle') {
      if (onFinish && status !== 'idle') onFinish(timeRef.current);
      if (status === 'idle') {
        timeRef.current = 0;
        setDisplayTime(0);
      }
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status, onFinish]);

  const formatTime = (ms: number) => {
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    const milli = Math.floor((ms % 1000) / 10);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${milli.toString().padStart(2, '0')}`;
  };

  return <div className="text-lg md:text-2xl font-mono font-bold w-20 md:w-32 text-center text-blue-600 shrink-0 leading-none">{formatTime(displayTime)}</div>;
});

TimerDisplay.displayName = 'TimerDisplay';

export default function WikiClimber() {
  const [language, setLanguage] = useState<Language>('ko');
  const [status, setStatus] = useState<GameStatus>('idle');
  const [targetWord, setTargetWord] = useState<string>('');
  const [targetSummary, setTargetSummary] = useState<string>('');
  const [showTooltip, setShowTooltip] = useState<boolean>(false);
  const [currentWord, setCurrentWord] = useState<string>('');
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [finalTime, setFinalTime] = useState<number>(0);
  const [countdown, setCountdown] = useState<number>(3);
  const [showRanking, setShowRanking] = useState<boolean>(false);
  const [rankingPeriod, setRankingPeriod] = useState<'daily' | 'monthly' | 'overall'>('overall');
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [playerName, setPlayerName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const t = i18n[language];
  const browserRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Detect browser language
  useEffect(() => {
    const browserLang = typeof navigator !== 'undefined' ? (navigator.language || (navigator as any).userLanguage) : 'ko';
    if (browserLang.startsWith('ko')) {
      setLanguage('ko');
    } else {
      setLanguage('en');
    }
  }, []);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchRankings();
  }, [rankingPeriod]);

  const fetchRankings = async () => {
    if (!supabase) return;
    try {
      let query = supabase
        .from('rankings')
        .select('*')
        .order('time_ms', { ascending: true })
        .limit(20);

      const now = new Date();
      if (rankingPeriod === 'daily') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        query = query.gte('created_at', startOfDay);
      } else if (rankingPeriod === 'monthly') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        query = query.gte('created_at', startOfMonth);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRankings(data || []);
    } catch (err) {
      console.error('Failed to fetch rankings:', err);
    }
  };

  useEffect(() => {
    if (status === 'playing') {
      const handleKeyDown = () => handleFail(t.keyboardError);
      const handleVisibilityChange = () => {
        if (document.hidden) handleFail(t.focusError);
      };
      window.addEventListener('keydown', handleKeyDown);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [status, t]);

  const handleFail = (reason: string) => {
    setStatus('failed');
    alert(`${t.gameOver}: ${reason}`);
  };

  const startCountdown = async () => {
    setLoading(true);
    try {
      const target = await getRandomWikiPage('simple_popular');
      const summary = await fetchWikiSummary(target.title);
      setTargetSummary(summary);
      const start = await getRandomWikiPage('any');
      
      if (start.title === target.title) {
        return startCountdown();
      }

      setTargetWord(target.title);
      setCurrentWord(start.title);
      setHtmlContent(start.content);
      setHistory([start.title]);
      setFinalTime(0);
      setCountdown(3);
      setStatus('countdown');
      setLoading(false);
    } catch (err) {
      alert(t.initError);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'countdown' && countdown > 0) {
      const id = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(id);
    } else if (status === 'countdown' && countdown === 0) {
      setStatus('playing');
    }
  }, [status, countdown]);

  const navigateTo = async (pageTitle: string) => {
    if (status !== 'playing' || loading) return;
    setLoading(true);
    try {
      const page = await fetchWikiPage(pageTitle);
      const cleanTarget = targetWord.replace(/<\/?[^>]+(>|$)/g, "").trim();
      const cleanCurrent = page.title.replace(/<\/?[^>]+(>|$)/g, "").trim();

      setCurrentWord(page.title);
      setHtmlContent(page.content);
      setHistory(prev => [...prev, page.title]);
      
      if (cleanCurrent === cleanTarget) {
        setStatus('congrats');
      }
      setLoading(false);
      if (browserRef.current) browserRef.current.scrollTop = 0;
    } catch (err) {
      console.error('Navigation failed', err);
      setLoading(false);
    }
  };

  const handleBrowserClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    if (link) {
      e.preventDefault();
      e.stopPropagation();
      const page = link.getAttribute('data-page');
      if (page) navigateTo(page);
    }
  };

  const submitScore = async () => {
    if (!playerName) return alert(language === 'ko' ? '이름을 입력해주세요' : 'Please enter your name');
    if (!supabase) return alert('Supabase is not configured.');
    try {
      const { error } = await supabase.from('rankings').insert([
        {
          player_name: playerName,
          target_word: targetWord.replace(/<\/?[^>]+(>|$)/g, "").trim(),
          time_ms: finalTime,
          path: history
        }
      ]);
      if (error) throw error;
      alert(t.scoreSuccess);
      fetchRankings();
      setStatus('idle');
    } catch (err) {
      alert(t.scoreError);
    }
  };

  const formatTime = (ms: number) => {
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    const milli = Math.floor((ms % 1000) / 10);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${milli.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900 font-sans selection:bg-blue-100">
      <header className="bg-white border-b p-3 md:p-4 flex items-center justify-between sticky top-0 z-10 gap-2">
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          <h1 className="text-lg md:text-xl font-serif font-bold italic hidden sm:block">{t.welcome}</h1>
          {status === 'playing' ? (
            <button 
              onClick={() => setStatus('idle')}
              className="px-3 py-1.5 md:px-4 md:py-2 rounded-md text-sm font-semibold transition bg-red-500 text-white"
            >
              {t.stop}
            </button>
          ) : (
            <div className="w-0 sm:w-0" />
          )}
        </div>

        <div className="flex flex-col items-start sm:items-center min-w-0 flex-1 px-2 relative h-full">
          <span className="text-[8px] md:text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none mb-1">{t.target}</span>
          <div className="flex items-center justify-start sm:justify-center max-w-full relative">
            <span className="text-lg md:text-xl font-bold truncate leading-none" dangerouslySetInnerHTML={{ __html: status === 'idle' ? '???' : targetWord }} />
            {status !== 'idle' && (
              <div className="absolute left-full ml-1" ref={tooltipRef}>
                <button 
                  onClick={() => setShowTooltip(!showTooltip)}
                  className="p-1 focus:outline-none flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-colors ${showTooltip ? 'text-blue-600' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                {/* Tooltip */}
                <div className={`absolute left-1/2 -translate-x-1/2 top-full mt-2 w-48 md:w-64 p-2 md:p-3 bg-gray-900 text-white text-[10px] md:text-xs rounded shadow-xl transition-all z-50 font-normal normal-case leading-relaxed pointer-events-none ${showTooltip ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
                  {targetSummary || '...'}
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-end sm:items-center gap-4 md:gap-6 shrink-0 h-full pt-2 sm:pt-0">
          <TimerDisplay status={status} onFinish={setFinalTime} />
          <button onClick={() => setShowRanking(!showRanking)} className="text-gray-400 hover:text-blue-600 mb-0.5 sm:mb-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 md:h-6 md:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-4 sm:p-8 md:p-12 pt-6 max-w-4xl mx-auto border-x border-gray-50 w-full" ref={browserRef}>
            {status === 'idle' && (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 md:w-24 md:h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4 md:mb-6">
                  <span className="text-3xl md:text-4xl">📚</span>
                </div>
                <h2 className="text-xl md:text-2xl font-serif font-bold mb-2">{t.welcome}</h2>
                <p className="text-sm md:text-base text-gray-500 max-w-md mb-6 md:mb-8 px-4">{t.description}</p>
                <div className="bg-gray-50 p-4 md:p-6 rounded-lg text-left text-xs md:text-sm text-gray-600 border border-dashed border-gray-300 mx-4 w-full max-w-sm">
                  <p className="font-bold mb-2">{t.rulesTitle}</p>
                  <ul className="list-disc ml-5 space-y-1 mb-6">
                    {t.rules.map((rule, i) => <li key={i}>{rule}</li>)}
                  </ul>
                  <button 
                    onClick={startCountdown}
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {loading ? '...' : t.start}
                  </button>
                </div>
              </div>
            )}

            {status === 'countdown' && (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="text-6xl md:text-8xl font-serif italic text-blue-600 animate-bounce">{countdown}</div>
                <p className="text-xs md:text-sm text-gray-400 uppercase tracking-widest font-bold mt-4">{t.preparing}</p>
              </div>
            )}

            {(status === 'playing' || status === 'congrats' || status === 'failed') && (
              <div className="space-y-4 md:space-y-6">
                <div className="border-b pb-3 md:pb-4 mb-4 md:mb-6">
                  <span className="text-[10px] md:text-xs font-bold text-blue-500 uppercase tracking-tight">{t.currentPage}</span>
                  <h2 className="text-xl md:text-3xl font-serif font-bold break-words" dangerouslySetInnerHTML={{ __html: currentWord }} />
                </div>
                <div 
                  className={`prose prose-sm md:prose-blue max-w-none wiki-content transition-opacity duration-300 ${loading ? 'opacity-30 pointer-events-none' : 'opacity-100 pointer-events-auto'}`} 
                  onClick={handleBrowserClick}
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
              </div>
            )}
          </div>

          {/* Footer with Language Selector */}
          <footer className="bg-white border-t p-2 flex justify-center gap-4 text-[10px] font-bold text-gray-400">
            <button 
              onClick={() => setLanguage('ko')}
              className={`hover:text-blue-600 transition-colors ${language === 'ko' ? 'text-blue-600' : ''}`}
            >
              한국어
            </button>
            <span className="text-gray-200">|</span>
            <button 
              onClick={() => setLanguage('en')}
              className={`hover:text-blue-600 transition-colors ${language === 'en' ? 'text-blue-600' : ''}`}
            >
              ENGLISH
            </button>
          </footer>
        </main>

        {showRanking && (
          <div className="fixed inset-0 bg-black/20 z-10 md:hidden" onClick={() => setShowRanking(false)} />
        )}

        <aside className={`w-full sm:w-80 bg-gray-50 border-l fixed right-0 top-0 bottom-0 md:top-[73px] transition-transform duration-300 z-20 ${showRanking ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-4 border-b flex justify-between items-center bg-white">
            <h2 className="font-bold uppercase tracking-tight text-xs text-gray-500">{t.rankings}</h2>
            <button onClick={() => setShowRanking(false)} className="text-2xl text-gray-300 hover:text-gray-600">&times;</button>
          </div>
          
          <div className="flex border-b bg-white">
            {(['daily', 'monthly', 'overall'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setRankingPeriod(p)}
                className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  rankingPeriod === p ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-gray-400 hover:bg-gray-50'
                }`}
              >
                {t[p as keyof typeof t]}
              </button>
            ))}
          </div>

          <div className="overflow-auto h-full p-4 space-y-3 pb-32">
            {rankings.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-xs italic">{t.noRankings}</div>
            ) : (
              rankings.map((entry, idx) => (
                <div key={entry.id} className="bg-white border rounded p-3 shadow-sm group">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-blue-600">#{idx + 1} {entry.player_name}</span>
                    <span className="text-[10px] md:text-xs font-mono bg-blue-50 text-blue-700 px-1 rounded">{formatTime(entry.time_ms)}</span>
                  </div>
                  <div className="text-[10px] text-gray-400 font-bold truncate mt-1">{t.target}: {entry.target_word}</div>
                  <button 
                    onClick={() => alert(`Path: ${entry.path.join(' → ')}`)}
                    className="mt-2 text-[10px] text-gray-400 group-hover:text-blue-600 underline transition-colors"
                  >
                    {t.viewProgress}
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {status === 'congrats' && (
          <div className="fixed inset-0 bg-white/95 flex items-center justify-center z-30 overflow-auto p-4">
            <div className="p-6 md:p-10 max-w-lg w-full text-center my-auto">
              <span className="text-4xl md:text-6xl mb-2 md:mb-4 block">🏆</span>
              <h2 className="text-2xl md:text-4xl font-serif font-bold text-blue-600 mb-2">{t.success}</h2>
              <p className="text-lg md:text-xl mb-4 md:mb-6">{language === 'ko' ? `${t.reached} [${targetWord}] ${t.in}` : `${t.reached} [${targetWord}] ${t.in} ${formatTime(finalTime)}`}</p>
              {language === 'ko' && <div className="text-2xl font-mono font-bold text-blue-600 mb-6">{formatTime(finalTime)}</div>}
              
              <div className="bg-gray-50 border rounded-lg p-3 md:p-4 text-left mb-6 md:mb-8 max-h-40 md:max-h-48 overflow-auto">
                <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">{t.yourPath}</p>
                <div className="flex flex-wrap gap-1 md:gap-2 text-[10px] md:text-sm text-gray-600">
                  {history.join(' → ')}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input 
                  type="text" 
                  placeholder={t.yourName}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="flex-1 border p-2 md:p-3 rounded-md outline-none focus:border-blue-500 text-sm"
                />
                <button onClick={submitScore} className="bg-blue-600 text-white font-bold px-6 py-2 md:py-3 rounded-md hover:bg-blue-700 text-sm">
                  {t.submit}
                </button>
              </div>

              <button 
                onClick={() => setStatus('idle')}
                className="mt-6 md:mt-8 text-[10px] md:text-xs text-gray-400 underline hover:text-gray-600 transition-colors"
              >
                {t.skip}
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .wiki-content { font-family: sans-serif; cursor: default; }
        .wiki-content a { cursor: pointer !important; pointer-events: auto !important; position: relative; z-index: 1; }
        .wiki-content h2 { border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; margin-top: 1.5rem; margin-bottom: 0.75rem; font-size: 1.25rem; font-weight: bold; }
        .wiki-content p { margin-bottom: 1rem; line-height: 1.6; color: #374151; font-size: 0.9375rem; }
        .wiki-content ul { list-style: disc; margin-left: 1.25rem; margin-bottom: 1rem; }
        .wiki-content table { border: 1px solid #e5e7eb; margin-bottom: 1rem; width: 100%; border-collapse: collapse; font-size: 0.75rem; display: block; overflow-x: auto; }
        .wiki-content th, .wiki-content td { border: 1px solid #e5e7eb; padding: 0.4rem; }
        .wiki-content .thumb { border: 1px solid #e5e7eb; padding: 0.4rem; margin: 0.75rem 0; background: #f9fafb; text-align: center; }
        .wiki-content .infobox, .wiki-content .ambox, .wiki-content .navbox, .wiki-content .vertical-navbox, .wiki-content .hatnote { display: none !important; }
        
        @media (min-width: 768px) {
          .wiki-content h2 { font-size: 1.5rem; margin-top: 2rem; margin-bottom: 1rem; }
          .wiki-content p { margin-bottom: 1.25rem; line-height: 1.8; font-size: 1rem; }
          .wiki-content table { font-size: 0.875rem; display: table; overflow-x: visible; }
        }
      `}</style>
    </div>
  );
}
