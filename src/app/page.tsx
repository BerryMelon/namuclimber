'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { fetchWikiPage, getRandomWikiPage } from '@/utils/WikiProxy';
import { supabase } from '@/utils/supabase';

type GameStatus = 'idle' | 'countdown' | 'playing' | 'congrats' | 'failed';

interface RankingEntry {
  id: string;
  player_name: string;
  target_word: string;
  time_ms: number;
  path: string[];
  created_at: string;
}

// Separate Timer component that is COMPLETELY isolated
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

  return <div className="text-2xl font-mono font-bold w-32 text-center text-blue-600">{formatTime(displayTime)}</div>;
});

TimerDisplay.displayName = 'TimerDisplay';

export default function WikiClimber() {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [targetWord, setTargetWord] = useState<string>('');
  const [currentWord, setCurrentWord] = useState<string>('');
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [finalTime, setFinalTime] = useState<number>(0);
  const [countdown, setCountdown] = useState<number>(3);
  const [showRanking, setShowRanking] = useState<boolean>(false);
  const [rankingPeriod, setRankingPeriod] = useState<'daily' | 'monthly' | 'overall'>('overall');
  const [rankings, setRankings] = useState<RankingEntry[]>([]);

  const browserRef = useRef<HTMLDivElement>(null);

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
      const handleKeyDown = () => handleFail('Keyboard input detected!');
      const handleVisibilityChange = () => {
        if (document.hidden) handleFail('Focus loss detected!');
      };
      window.addEventListener('keydown', handleKeyDown);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [status]);

  const handleFail = (reason: string) => {
    setStatus('failed');
    alert(`Game Over: ${reason}`);
  };

  const startCountdown = async () => {
    setLoading(true);
    try {
      // 1. Fetch Target Word (SIMPLE & POPULAR)
      const target = await getRandomWikiPage('simple_popular');

      // 2. Fetch Start Page (ANY)
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
      alert('Failed to initialize game. Please try again.');
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
    if (!playerName) return alert('Please enter your name');
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
      alert('Score submitted!');
      fetchRankings();
      setStatus('idle');
    } catch (err) {
      alert('Failed to submit score.');
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
      <header className="bg-white border-b p-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-serif font-bold italic">WikiClimber</h1>
          <button 
            onClick={status === 'playing' ? () => setStatus('idle') : startCountdown}
            disabled={loading}
            className={`px-4 py-2 rounded-md font-semibold transition ${
              status === 'playing' ? 'bg-red-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
            } disabled:opacity-50`}
          >
            {loading ? '...' : status === 'playing' ? 'Stop' : 'Start'}
          </button>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Target</span>
          <span className="text-lg font-bold" dangerouslySetInnerHTML={{ __html: status === 'idle' ? '???' : targetWord }} />
        </div>

        <div className="flex items-center gap-6">
          <TimerDisplay status={status} onFinish={setFinalTime} />
          <button onClick={() => setShowRanking(!showRanking)} className="text-gray-400 hover:text-blue-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <main className="flex-1 overflow-auto p-12 pt-6 max-w-4xl mx-auto border-x border-gray-50" ref={browserRef}>
          {status === 'idle' && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                <span className="text-4xl">📚</span>
              </div>
              <h2 className="text-2xl font-serif font-bold mb-2">Welcome to WikiClimber</h2>
              <p className="text-gray-500 max-w-md mb-8">Navigate through Wikipedia links to reach the target page. No keyboard allowed!</p>
              <div className="bg-gray-50 p-6 rounded-lg text-left text-sm text-gray-600 border border-dashed border-gray-300">
                <p className="font-bold mb-2">Rules:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Mouse clicks only.</li>
                  <li>Reach the target title to win.</li>
                </ul>
              </div>
            </div>
          )}

          {status === 'countdown' && (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="text-8xl font-serif italic text-blue-600 animate-bounce">{countdown}</div>
              <p className="text-gray-400 uppercase tracking-widest font-bold mt-4">Preparing Expedition...</p>
            </div>
          )}

          {(status === 'playing' || status === 'congrats' || status === 'failed') && (
            <div className="space-y-6">
              <div className="border-b pb-4 mb-6">
                <span className="text-xs font-bold text-blue-500 uppercase tracking-tight">Current Page</span>
                <h2 className="text-3xl font-serif font-bold" dangerouslySetInnerHTML={{ __html: currentWord }} />
              </div>
              <div 
                className={`prose prose-blue max-w-none wiki-content transition-opacity duration-300 ${loading ? 'opacity-30 pointer-events-none' : 'opacity-100 pointer-events-auto'}`} 
                onClick={handleBrowserClick}
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            </div>
          )}
        </main>

        <aside className={`w-80 bg-gray-50 border-l fixed right-0 top-[73px] bottom-0 transition-transform duration-300 z-20 ${showRanking ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-4 border-b flex justify-between items-center bg-white">
            <h2 className="font-bold uppercase tracking-tight text-xs text-gray-500">Rankings</h2>
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
                {p}
              </button>
            ))}
          </div>

          <div className="overflow-auto h-full p-4 space-y-3 pb-32">
            {rankings.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-xs italic">No rankings found for this period.</div>
            ) : (
              rankings.map((entry, idx) => (
                <div key={entry.id} className="bg-white border rounded p-3 shadow-sm group">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-blue-600">#{idx + 1} {entry.player_name}</span>
                    <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1 rounded">{formatTime(entry.time_ms)}</span>
                  </div>
                  <div className="text-[10px] text-gray-400 font-bold truncate mt-1">Target: {entry.target_word}</div>
                  <button 
                    onClick={() => alert(`Path: ${entry.path.join(' → ')}`)}
                    className="mt-2 text-[10px] text-gray-400 group-hover:text-blue-600 underline transition-colors"
                  >
                    VIEW PROGRESS
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {status === 'congrats' && (
          <div className="absolute inset-0 bg-white/95 flex items-center justify-center z-30 animate-in fade-in zoom-in duration-300">
            <div className="p-10 max-w-lg w-full text-center">
              <span className="text-6xl mb-4 block">🏆</span>
              <h2 className="text-4xl font-serif font-bold text-blue-600 mb-2">Success!</h2>
              <p className="text-xl mb-6">You reached <span className="font-bold">[{targetWord}]</span> in {formatTime(finalTime)}</p>
              
              <div className="bg-gray-50 border rounded-lg p-4 text-left mb-8 max-h-48 overflow-auto">
                <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">Your Path</p>
                <div className="flex flex-wrap gap-2 text-sm text-gray-600">
                  {history.join(' → ')}
                </div>
              </div>

              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Your Name" 
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="flex-1 border p-3 rounded-md outline-none focus:border-blue-500"
                />
                <button onClick={submitScore} className="bg-blue-600 text-white font-bold px-6 py-3 rounded-md hover:bg-blue-700">
                  Submit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .wiki-content { font-family: sans-serif; cursor: default; }
        .wiki-content a { cursor: pointer !important; pointer-events: auto !important; position: relative; z-index: 1; }
        .wiki-content h2 { border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; margin-top: 2rem; margin-bottom: 1rem; font-size: 1.5rem; font-weight: bold; }
        .wiki-content p { margin-bottom: 1.25rem; line-height: 1.8; color: #374151; }
        .wiki-content ul { list-style: disc; margin-left: 1.5rem; margin-bottom: 1.25rem; }
        .wiki-content table { border: 1px solid #e5e7eb; margin-bottom: 1.5rem; width: 100%; border-collapse: collapse; font-size: 0.875rem; }
        .wiki-content th, .wiki-content td { border: 1px solid #e5e7eb; padding: 0.5rem; }
        .wiki-content .thumb { border: 1px solid #e5e7eb; padding: 0.5rem; margin: 1rem 0; background: #f9fafb; text-align: center; }
        .wiki-content .infobox, .wiki-content .ambox, .wiki-content .navbox, .wiki-content .vertical-navbox { display: none !important; }
      `}</style>
    </div>
  );
}
