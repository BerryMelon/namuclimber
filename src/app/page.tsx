'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchNamuPage, getRandomNamuPage, FALLBACK_WORDS } from '@/utils/NamuProxy';
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

export default function NamuClimber() {
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
  const [showRules, setShowRules] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const browserRef = useRef<HTMLDivElement>(null);

  // Initialize rankings
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

  // Timer logic
  useEffect(() => {
    if (status === 'playing') {
      const start = Date.now() - timer;
      timerRef.current = setInterval(() => {
        setTimer(Date.now() - start);
      }, 10);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  // Cheating detection
  useEffect(() => {
    if (status === 'playing') {
      const handleKeyDown = () => handleFail('Keyboard input detected!');
      const handleVisibilityChange = () => {
        if (document.hidden) handleFail('Tab switch detected!');
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
      // 1. Pick target word locally (INSTANT)
      let targetTitle = FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
      setTargetWord(targetTitle);

      // 2. Prepare start page from Namuwiki
      const start = await getRandomNamuPage();
      
      // Ensure start and target are different
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
      alert('Failed to initialize game. Check CORS proxy.');
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
    if (status !== 'playing') return;
    
    setLoading(true);
    try {
      const page = await fetchNamuPage(pageTitle);
      setCurrentWord(page.title);
      setHtmlContent(page.content);
      setHistory(prev => [...prev, page.title]);
      
      // Check win condition
      if (page.title.trim() === targetWord.trim()) {
        setStatus('congrats');
      }
      setLoading(false);
      // Scroll browser to top
      if (browserRef.current) browserRef.current.scrollTop = 0;
    } catch (err) {
      console.error('Navigation failed', err);
      setLoading(false);
    }
  };

  const submitScore = async () => {
    if (!playerName) return alert('Please enter your name');
    if (!supabase) return alert('Supabase is not configured. (Check GitHub Secrets)');
    try {
      const { error } = await supabase.from('rankings').insert([
        {
          player_name: playerName,
          target_word: targetWord,
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

  // Event delegation for links
  const handleBrowserClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    if (link) {
      const page = link.getAttribute('data-page');
      if (page) {
        navigateTo(page);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 text-gray-900 font-sans">
      {/* Top Bar */}
      <header className="bg-white border-b shadow-sm p-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-green-600">NamuClimber</h1>
          <button 
            onClick={status === 'playing' ? () => setStatus('idle') : startCountdown}
            disabled={loading}
            className={`px-4 py-2 rounded-md font-semibold transition ${
              status === 'playing' ? 'bg-red-500 text-white' : 'bg-green-500 text-white hover:bg-green-600'
            } disabled:opacity-50`}
          >
            {loading ? 'Loading...' : status === 'playing' ? 'Stop' : 'Start'}
          </button>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-xs text-gray-500 font-medium">TARGET WORD</span>
          <span className="text-lg font-bold">
            {status === 'idle' ? '???' : status === 'countdown' ? `Starting in ${countdown}...` : targetWord}
          </span>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-2xl font-mono font-bold w-32 text-center">
            {formatTime(timer)}
          </div>
          <button 
            onClick={() => setShowRanking(!showRanking)}
            className="text-gray-600 hover:text-green-600 transition p-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Main Browser */}
        <main className="flex-1 bg-white overflow-auto p-8" ref={browserRef}>
          {status === 'idle' ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <p className="text-2xl mb-4">Click Start to begin the speedrun!</p>
              <div className="max-w-md bg-gray-50 p-6 rounded-lg border text-sm text-gray-600">
                <h3 className="font-bold mb-2">Rules:</h3>
                <ul className="list-disc ml-4 space-y-1">
                  <li>Navigate to the target word using only mouse clicks.</li>
                  <li>Keyboard input is forbidden (Instant Game Over).</li>
                  <li>Switching tabs or apps is forbidden.</li>
                  <li>Back/Forward navigation is forbidden.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div 
              className="prose max-w-none wiki-content" 
              onClick={handleBrowserClick}
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          )}
        </main>

        {/* Ranking Sidebar */}
        <aside className={`w-80 bg-white border-l transition-all duration-300 ${showRanking ? 'mr-0' : '-mr-80'}`}>
          <div className="p-4 border-b flex justify-between items-center bg-gray-50">
            <h2 className="font-bold text-lg">Rankings</h2>
            <button onClick={() => setShowRanking(false)} className="text-gray-400 hover:text-gray-600">&times;</button>
          </div>
          <div className="overflow-auto h-full p-4 space-y-4 pb-20">
            {rankings.map((entry, idx) => (
              <div key={entry.id} className="border rounded-md p-3 hover:bg-gray-50 transition">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-green-600">#{idx + 1} {entry.player_name}</span>
                  <span className="text-xs font-mono">{formatTime(entry.time_ms)}</span>
                </div>
                <div className="text-xs text-gray-500">Target: {entry.target_word}</div>
                <button 
                  onClick={() => alert(`Path: ${entry.path.join(' -> ')}`)}
                  className="mt-2 text-[10px] text-blue-500 hover:underline"
                >
                  PROGRESS
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Overlays */}
        {status === 'congrats' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
            <div className="bg-white p-8 rounded-lg shadow-xl max-w-lg w-full text-center">
              <h2 className="text-3xl font-bold text-green-600 mb-2">Congratulations!</h2>
              <p className="text-xl mb-4">Reached <span className="font-bold">[{targetWord}]</span> in {formatTime(timer)}</p>
              
              <div className="bg-gray-50 p-4 rounded mb-6 text-left max-h-40 overflow-auto">
                <p className="text-xs text-gray-500 mb-1">PATH TAKEN:</p>
                <p className="text-sm font-medium">{history.join(' → ')}</p>
              </div>

              <div className="flex flex-col gap-3">
                <input 
                  type="text" 
                  placeholder="Enter your name" 
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="border p-3 rounded-md focus:ring-2 focus:ring-green-500 outline-none"
                />
                <button 
                  onClick={submitScore}
                  className="bg-green-500 text-white font-bold py-3 rounded-md hover:bg-green-600 transition"
                >
                  Submit to Ranking
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .wiki-content {
          font-family: sans-serif;
          line-height: 1.6;
          overflow-x: hidden;
          width: 100%;
        }
        .wiki-content h1, .wiki-content h2, .wiki-content h3 {
          font-weight: bold;
          border-bottom: 1px solid #eee;
          padding-bottom: 0.5rem;
          margin-top: 1.5rem;
          margin-bottom: 1rem;
        }
        .wiki-content h1 { font-size: 1.875rem; }
        .wiki-content h2 { font-size: 1.5rem; }
        .wiki-content h3 { font-size: 1.25rem; }
        .wiki-content p { margin-bottom: 1rem; }
        .wiki-content ul { list-style-type: disc; margin-left: 1.5rem; margin-bottom: 1rem; }
        .wiki-content table { 
          width: 100% !important; 
          table-layout: fixed;
          border-collapse: collapse; 
          margin-bottom: 1rem; 
          display: block;
          overflow-x: auto;
        }
        .wiki-content th, .wiki-content td { border: 1px solid #ddd; padding: 0.5rem; }
        .wiki-content img, .wiki-content svg {
          max-width: 100% !important;
          height: auto !important;
          display: inline-block;
        }
        /* Fix for huge icons */
        .wiki-content [width] {
          width: auto;
          max-width: 100%;
        }
        /* Specific Namuwiki table fixes */
        .wiki-table {
          width: 100% !important;
        }
      `}</style>
    </div>
  );
}
