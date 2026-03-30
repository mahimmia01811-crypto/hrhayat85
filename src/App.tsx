import React, { useState, useEffect } from 'react';
import ReaderView from './components/ReaderView';
import AdminPanel from './components/AdminPanel';
import { cn } from './lib/utils';
import { Book, ShieldCheck } from 'lucide-react';

export default function App() {
  const [view, setView] = useState<'reader' | 'admin'>('reader');

  // Simple hash-based routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#admin') {
        setView('admin');
      } else {
        setView('reader');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Initial check

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div className="relative min-h-screen">
      {/* Navigation Toggle (Floating) */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 group">
        <button
          onClick={() => {
            window.location.hash = view === 'reader' ? 'admin' : '';
          }}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 hover:scale-110",
            view === 'reader' 
              ? "bg-[#5c4033] text-[#e4d5b7] hover:bg-[#4a3329]" 
              : "bg-[#00ff00] text-black hover:bg-[#00cc00]"
          )}
          title={view === 'reader' ? "Go to Admin Panel" : "Go to Reader View"}
        >
          {view === 'reader' ? <ShieldCheck className="w-6 h-6" /> : <Book className="w-6 h-6" />}
        </button>
      </div>

      {/* Main View */}
      {view === 'reader' ? <ReaderView /> : <AdminPanel />}
    </div>
  );
}
