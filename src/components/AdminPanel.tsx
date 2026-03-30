import React, { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User, signOut } from 'firebase/auth';
import { Peer } from 'peerjs';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { db, auth } from '../firebase';
import { Reader, Story, OperationType } from '../types';
import { handleFirestoreError } from '../services/firestoreService';
import { LayoutDashboard, PenTool, Monitor, Users, LogIn, Loader2, Play, Activity } from 'lucide-react';
import { cn } from '../lib/utils';

export default function AdminPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [readers, setReaders] = useState<Reader[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'monitor'>('dashboard');
  const [selectedReader, setSelectedReader] = useState<Reader | null>(null);
  const [activeCall, setActiveCall] = useState<any>(null);
  const [peerError, setPeerError] = useState<string | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<Peer | null>(null);

  // 1. Auth Check
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch Readers and Stories
  useEffect(() => {
    if (user) {
      const readersUnsubscribe = onSnapshot(collection(db, 'readers'), (snapshot) => {
        setReaders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reader)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'readers'));

      const storiesUnsubscribe = onSnapshot(query(collection(db, 'stories'), orderBy('createdAt', 'desc')), (snapshot) => {
        setStories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Story)));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'stories'));

      // Initialize PeerJS for monitoring
      const peer = new Peer();
      
      peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        let message = 'System Error: Signal lost';
        if (err.type === 'peer-unavailable') message = 'Target Unavailable: Signal not found';
        if (err.type === 'network') message = 'Network Error: Check your connection';
        if (err.type === 'disconnected') message = 'Connection Lost: Reconnecting...';
        
        setPeerError(message);
        setSelectedReader(null);
        setActiveCall(null);
      });

      peerRef.current = peer;

      return () => {
        readersUnsubscribe();
        storiesUnsubscribe();
        if (activeCall) activeCall.close();
        peerRef.current?.destroy();
      };
    }
  }, [user]);

  const handleLogin = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(err => console.error(err));
  };

  const handleLogout = () => {
    signOut(auth).catch(err => console.error(err));
  };

  const handlePublish = async () => {
    if (!title || !content) return;
    setPublishing(true);
    try {
      await addDoc(collection(db, 'stories'), {
        title,
        content,
        createdAt: serverTimestamp()
      });
      setTitle('');
      setContent('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'stories');
    } finally {
      setPublishing(false);
    }
  };

  const monitorReader = (reader: Reader) => {
    if (!peerRef.current) return;
    
    setPeerError(null);
    // Close previous call
    if (activeCall) {
      activeCall.close();
    }

    setSelectedReader(reader);
    setActiveTab('monitor');

    // Call the reader
    const call = peerRef.current.call(reader.peerId, new MediaStream());
    call.on('stream', (remoteStream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    });
    
    call.on('close', () => {
      setSelectedReader(null);
      setActiveCall(null);
    });

    setActiveCall(call);
  };

  const disconnectMonitor = () => {
    if (activeCall) {
      activeCall.close();
    }
    setSelectedReader(null);
    setActiveCall(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0a]">
        <Loader2 className="w-12 h-12 animate-spin text-[#00ff00]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0a] text-white font-mono">
        <div className="p-8 border border-[#00ff00]/30 bg-[#111] rounded-lg text-center max-w-md">
          <LayoutDashboard className="w-16 h-16 mx-auto mb-6 text-[#00ff00]" />
          <h1 className="text-2xl font-bold mb-2 uppercase tracking-widest">Admin Access Required</h1>
          <p className="text-gray-400 mb-8 text-sm">Please authenticate with your authorized Google account to access the dashboard.</p>
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-2 bg-[#00ff00] text-black font-bold py-3 px-6 rounded hover:bg-[#00cc00] transition-colors uppercase tracking-widest"
          >
            <LogIn className="w-5 h-5" />
            Authenticate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-300 font-mono flex">
      {/* Sidebar */}
      <div className="w-64 border-r border-[#00ff00]/10 bg-[#111] flex flex-col">
        <div className="p-6 border-b border-[#00ff00]/10 flex items-center gap-3">
          <Activity className="w-6 h-6 text-[#00ff00]" />
          <span className="font-bold text-white tracking-widest uppercase">Console</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 rounded transition-all",
              activeTab === 'dashboard' 
                ? "bg-[#00ff00]/10 text-[#00ff00] border border-[#00ff00]/20" 
                : "text-gray-500 hover:bg-white/5"
            )}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('monitor')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 rounded transition-all",
              activeTab === 'monitor' 
                ? "bg-[#00ff00]/10 text-[#00ff00] border border-[#00ff00]/20" 
                : "text-gray-500 hover:bg-white/5"
            )}
          >
            <Monitor className="w-4 h-4" />
            Live Monitor
          </button>
        </nav>
        <div className="p-4 border-t border-[#00ff00]/10 flex flex-col gap-2">
          <div className="text-[10px] text-gray-600 uppercase tracking-widest truncate">
            User: {user.email}
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-2 px-3 text-[10px] uppercase tracking-widest font-bold border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all rounded"
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-[#00ff00]/10 bg-[#111] flex items-center justify-between px-8">
          <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#00ff00] animate-pulse" />
            System Status: Nominal
          </h2>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00ff00]" />
              {readers.length} Active Readers
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 space-y-8">
          {activeTab === 'dashboard' ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Editor Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-[#00ff00] uppercase text-xs font-bold tracking-widest mb-4">
                    <PenTool className="w-4 h-4" />
                    Publish New Story
                  </div>
                  <div className="bg-[#111] border border-[#00ff00]/10 p-6 rounded-lg space-y-4">
                    <input
                      type="text"
                      placeholder="STORY TITLE"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-black border border-[#00ff00]/20 p-3 rounded text-white focus:outline-none focus:border-[#00ff00] transition-colors placeholder:text-gray-700"
                    />
                    <div className="h-64 bg-black rounded overflow-hidden border border-[#00ff00]/20">
                      <ReactQuill
                        theme="snow"
                        value={content}
                        onChange={setContent}
                        className="h-full text-white"
                        placeholder="Write your story here..."
                      />
                    </div>
                    <button
                      onClick={handlePublish}
                      disabled={publishing}
                      className="w-full bg-[#00ff00] text-black font-bold py-3 rounded hover:bg-[#00cc00] disabled:opacity-50 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Transmit to Library
                    </button>
                  </div>
                </section>

                {/* Quick Stats Section */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-[#00ff00] uppercase text-xs font-bold tracking-widest mb-4">
                    <Activity className="w-4 h-4" />
                    Network Overview
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#111] border border-[#00ff00]/10 p-6 rounded-lg text-center">
                      <div className="text-3xl font-bold text-white mb-1">{readers.length}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-widest">Active Readers</div>
                    </div>
                    <div className="bg-[#111] border border-[#00ff00]/10 p-6 rounded-lg text-center">
                      <div className="text-3xl font-bold text-white mb-1">{stories.length}</div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-widest">Stories Published</div>
                    </div>
                  </div>
                  <div className="bg-[#111] border border-[#00ff00]/10 rounded-lg p-4">
                    <h3 className="text-[10px] text-gray-500 uppercase tracking-widest mb-4 border-b border-[#00ff00]/10 pb-2">Active Reader List</h3>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {readers.map(reader => (
                        <div key={reader.id} className="flex items-center justify-between p-2 bg-black/30 rounded border border-[#00ff00]/5">
                          <span className="text-[10px] text-gray-400">{reader.id.substring(0, 12)}...</span>
                          <button 
                            onClick={() => monitorReader(reader)}
                            className="text-[9px] text-[#00ff00] uppercase tracking-widest hover:underline"
                          >
                            Monitor
                          </button>
                        </div>
                      ))}
                      {readers.length === 0 && <div className="text-[10px] text-gray-700 italic text-center py-4">No readers online</div>}
                    </div>
                  </div>
                </section>
              </div>

              {/* History Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-[#00ff00] uppercase text-xs font-bold tracking-widest mb-4">
                  <Activity className="w-4 h-4" />
                  Transmission History
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stories.map((s) => (
                    <div key={s.id} className="bg-[#111] border border-[#00ff00]/10 p-4 rounded hover:border-[#00ff00]/30 transition-all group">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="text-white font-bold text-xs uppercase truncate flex-1">{s.title}</h3>
                        <span className="text-[10px] text-gray-600">{s.createdAt?.toDate().toLocaleDateString()}</span>
                      </div>
                      <div className="text-[10px] text-gray-500 line-clamp-2 mb-4 opacity-50 group-hover:opacity-100 transition-opacity" dangerouslySetInnerHTML={{ __html: s.content }} />
                      <div className="flex justify-between items-center text-[9px] uppercase tracking-widest text-[#00ff00]/50">
                        <span>ID: {s.id.substring(0, 8)}</span>
                        <span>Status: Transmitted</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            /* Full Screen Monitor Tab */
            <div className="h-full flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#00ff00] uppercase text-xs font-bold tracking-widest">
                  <Monitor className="w-4 h-4" />
                  Live Surveillance Feed
                </div>
                {selectedReader && (
                  <button 
                    onClick={disconnectMonitor}
                    className="text-[10px] uppercase tracking-widest text-red-500 border border-red-500/30 px-3 py-1 rounded hover:bg-red-500 hover:text-white transition-all"
                  >
                    Terminate Connection
                  </button>
                )}
              </div>
              
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Video Feed */}
                <div className="lg:col-span-3 bg-black border border-[#00ff00]/20 rounded-lg relative overflow-hidden flex items-center justify-center">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                    onError={() => setPeerError('Video Stream Error: Failed to render incoming signal')}
                  />
                  
                  {/* CRT Overlay Effect */}
                  <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 bg-[length:100%_2px,3px_100%]" />
                  
                  {peerError ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500 z-20 bg-black/80 backdrop-blur-sm">
                      <Activity className="w-16 h-16 mb-4 animate-pulse" />
                      <p className="text-sm uppercase tracking-widest font-bold">Signal Interrupted</p>
                      <p className="text-[10px] mt-2 opacity-70">{peerError}</p>
                      <button 
                        onClick={() => setPeerError(null)}
                        className="mt-6 text-[10px] uppercase tracking-widest border border-red-500/30 px-4 py-2 rounded hover:bg-red-500 hover:text-white transition-all"
                      >
                        Reset Console
                      </button>
                    </div>
                  ) : !selectedReader ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-700 z-20">
                      <Monitor className="w-24 h-24 mb-6 opacity-10 animate-pulse" />
                      <p className="text-sm uppercase tracking-widest font-bold">Awaiting Signal...</p>
                      <p className="text-[10px] mt-2 opacity-50">Select a target from the registry</p>
                    </div>
                  ) : (
                    <div className="absolute top-6 left-6 flex flex-col gap-2 z-20">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded border border-[#00ff00]/30 text-[10px] uppercase tracking-widest text-[#00ff00] font-bold">
                        <span className="w-2 h-2 rounded-full bg-[#00ff00] animate-pulse" />
                        REC // LIVE FEED: {selectedReader.id.substring(0, 8)}
                      </div>
                      <div className="px-3 py-1 bg-black/40 text-[9px] text-gray-400 uppercase tracking-widest">
                        LATENCY: 42ms // ENCRYPTION: AES-256
                      </div>
                    </div>
                  )}
                  
                  {/* Viewfinder corners */}
                  <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-[#00ff00]/30" />
                  <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-[#00ff00]/30" />
                  <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-[#00ff00]/30" />
                  <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-[#00ff00]/30" />
                </div>

                {/* Reader Registry */}
                <div className="bg-[#111] border border-[#00ff00]/10 rounded-lg flex flex-col">
                  <div className="p-4 border-b border-[#00ff00]/10 bg-black/20">
                    <h3 className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
                      <Users className="w-3 h-3 text-[#00ff00]" />
                      Target Registry
                    </h3>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {readers.map(reader => (
                      <button
                        key={reader.id}
                        onClick={() => monitorReader(reader)}
                        className={cn(
                          "w-full p-3 rounded text-left transition-all border",
                          selectedReader?.id === reader.id 
                            ? "bg-[#00ff00]/20 border-[#00ff00]/40 text-[#00ff00]" 
                            : "bg-black/40 border-transparent text-gray-500 hover:border-[#00ff00]/20 hover:text-gray-300"
                        )}
                      >
                        <div className="text-[10px] font-bold uppercase truncate">{reader.id.substring(0, 16)}</div>
                        <div className="text-[8px] mt-1 opacity-60">STATUS: ONLINE // PEER: {reader.peerId.substring(0, 6)}...</div>
                      </button>
                    ))}
                    {readers.length === 0 && (
                      <div className="p-8 text-center text-[10px] text-gray-700 italic">
                        Scanning for signals...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
