'use client';

import { useState, useEffect, useRef } from 'react';
import { fetchWikiPage, getRandomWikiPage, FALLBACK_WORDS } from '@/utils/WikiProxy';
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

export default function WikiClimber() {
  const [status, setStatus] = useState<GameStatus>('idle');
  const [targetWord, setTargetWord] = useState<string>('');
  const [currentWord, setCurrentWord] = useState<string>('');
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [timer, setTimer] = useState<number>(0);
  const [countdown, setCountdown] = useState<number>(3);
  const [showRanking, setShowRanking] = useState<boolean>(false);
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [playerName, setPlayerName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const browserRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchRankings();
  }, []);

  const fetchRankings = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('rankings')
        .select('*')
        .order('time_ms', { ascending: true })
        .limit(20);
      if (error) throw error;
      setRankings(data || []);
    } catch (err) {
      console.error('Failed to fetch rankings:', err);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (status === 'playing') {
      const startTime = Date.now() - timer;
      interval = setInterval(() => {
        setTimer(Date.now() - startTime);
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval as NodeJS.Timeout);
    };
  }, [status]);

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
      // 1. Pick target word locally (Instant)
      let targetTitle = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
      setTargetWord(targetTitle);

      // 2. Prepare start page from Wikipedia
      const start = await getRandomWikiPage();
      
      if (start.title === targetTitle) {
        targetTitle = FALLBACK_WORDS[(FALLBACK_WORDS.indexOf(targetTitle) + 1) % FALLBACK_WORDS.length];
        setTargetWord(targetTitle);
      }

      setCurrentWord(start.title);
      setHtmlContent(start.content);
      setHistory([start.title]);
      
      setTimer(0);
      setCountdown(3);
      setStatus('countdown');
      setLoading(false);
    } catch (err) {
      alert('Failed to initialize game. Check your connection.');
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
      
      // Wikipedia uses bold or slightly different strings for titles sometimes, 
      // we check for exact match or includes
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

  const submitScore = async () => {
    if (!playerName) return alert('Please enter your name');
    if (!supabase) return alert('Supabase is not configured.');
    try {
      const { error } = await supabase.from('rankings').insert([
        {
          player_name: playerName,
          target_word: targetWord.replace(/<\/?[^>]+(>|$)/g, "").trim(),
          time_ms: timer,
          path: history
        }
      ]);
      if (error) throw error;
      alert('Score submitted!');
      fetchRankings();
      setStatus('idle');
      setHistory([]);
      setHtmlContent('');
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

  const handleBrowserClick = (e: React.MouseEvent) => {
    // Prevent default browser navigation
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    
    if (link) {
      e.preventDefault();
      e.stopPropagation();
      const page = link.getAttribute('data-page');
      console.log('[WikiClimber] Clicked link:', link.textContent, 'Page:', page);
      
      if (page) {
        navigateTo(page);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900 font-sans">
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
          <div className="text-2xl font-mono font-bold w-32 text-center text-blue-600">
            {formatTime(timer)}
          </div>
          <button onClick={() => setShowRanking(!showRanking)} className="text-gray-400 hover:text-blue-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <main className="flex-1 overflow-auto p-12 max-w-4xl mx-auto border-x border-gray-50" ref={browserRef}>
          {status === 'idle' ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                <span className="text-4xl">📚</span>
              </div>
              <h2 className="text-2xl font-serif font-bold mb-2">Welcome to WikiClimber</h2>
              <p className="text-gray-500 max-w-md mb-8">Navigate through Wikipedia links to reach the target page as fast as you can. No keyboard allowed!</p>
              <div className="bg-gray-50 p-6 rounded-lg text-left text-sm text-gray-600 border border-dashed border-gray-300">
                <p className="font-bold mb-2">Rules:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Mouse clicks only.</li>
                  <li>No keyboard inputs (instant fail).</li>
                  <li>No tab switching.</li>
                  <li>Reach the target title to win.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div 
              className={`prose prose-blue max-w-none wiki-content transition-opacity duration-300 ${loading ? 'opacity-30' : 'opacity-100'}`} 
              onClick={handleBrowserClick}
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          )}
        </main>

        <aside className={`w-80 bg-gray-50 border-l fixed right-0 top-[73px] bottom-0 transition-transform duration-300 z-20 ${showRanking ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-4 border-b flex justify-between items-center bg-white">
            <h2 className="font-bold">Global Rankings</h2>
            <button onClick={() => setShowRanking(false)} className="text-2xl">&times;</button>
          </div>
          <div className="overflow-auto h-full p-4 space-y-3 pb-24">
            {rankings.map((entry, idx) => (
              <div key={entry.id} className="bg-white border rounded p-3 shadow-sm">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-blue-600">#{idx + 1} {entry.player_name}</span>
                  <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1 rounded">{formatTime(entry.time_ms)}</span>
                </div>
                <div className="text-[10px] text-gray-400 uppercase font-bold truncate">Target: {entry.target_word}</div>
                <button 
                  onClick={() => alert(`Path: ${entry.path.join(' → ')}`)}
                  className="mt-2 text-[10px] text-gray-400 hover:text-blue-600 underline"
                >
                  VIEW PROGRESS
                </button>
              </div>
            ))}
          </div>
        </aside>

        {status === 'congrats' && (
          <div className="absolute inset-0 bg-white/95 flex items-center justify-center z-30 animate-in fade-in zoom-in duration-300">
            <div className="p-10 max-w-lg w-full text-center">
              <span className="text-6xl mb-4 block">🏆</span>
              <h2 className="text-4xl font-serif font-bold text-blue-600 mb-2">Success!</h2>
              <p className="text-xl mb-6">You reached <span className="font-bold">[{targetWord}]</span> in {formatTime(timer)}</p>
              
              <div className="bg-gray-50 border rounded-lg p-4 text-left mb-8 max-h-48 overflow-auto">
                <p className="text-[10px] text-gray-400 font-bold uppercase mb-2">Your Path</p>
                <div className="flex flex-wrap gap-2 text-sm">
                  {history.map((h, i) => (
                    <span key={i} className="flex items-center gap-2">
                      {i > 0 && <span className="text-gray-300">→</span>}
                      <span className="bg-white px-2 py-1 rounded border shadow-sm">{h}</span>
                    </span>
                  ))}
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
        .wiki-content { font-family: sans-serif; }
        .wiki-content h2 { border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; margin-top: 2rem; margin-bottom: 1rem; font-size: 1.5rem; font-weight: bold; }
        .wiki-content p { margin-bottom: 1.25rem; line-height: 1.8; color: #374151; }
        .wiki-content ul { list-style: disc; margin-left: 1.5rem; margin-bottom: 1.25rem; }
        .wiki-content table { border: 1px solid #e5e7eb; margin-bottom: 1.5rem; width: 100%; border-collapse: collapse; font-size: 0.875rem; }
        .wiki-content th, .wiki-content td { border: 1px solid #e5e7eb; padding: 0.5rem; }
        .wiki-content .thumb { border: 1px solid #e5e7eb; padding: 0.5rem; margin: 1rem 0; background: #f9fafb; text-align: center; }
        .wiki-content .thumbcaption { font-size: 0.75rem; color: #6b7280; margin-top: 0.5rem; }
        .wiki-content .infobox { display: none; }
      `}</style>
    </div>
  );
}
