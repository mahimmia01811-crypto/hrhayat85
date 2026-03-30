import React, { useEffect, useRef, useState } from 'react';
import { PageFlip } from 'page-flip';
import { Peer } from 'peerjs';
import { collection, doc, onSnapshot, setDoc, serverTimestamp, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Story, OperationType } from '../types';
import { handleFirestoreError } from '../services/firestoreService';
import { Loader2, BookOpen, Camera, CameraOff } from 'lucide-react';
import { cn } from '../lib/utils';

export default function ReaderView() {
  const bookRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [cameraAllowed, setCameraAllowed] = useState<boolean | null>(null);
  const pageFlipRef = useRef<PageFlip | null>(null);
  const readerIdRef = useRef<string>(auth.currentUser?.uid || `anon-${Math.random().toString(36).substr(2, 9)}`);

  // 1. Fetch the latest story
  useEffect(() => {
    const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        setStory({ id: doc.id, ...doc.data() } as Story);
      } else {
        setStory(null);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stories');
    });

    return () => unsubscribe();
  }, []);

  // 2. Split content into pages
  useEffect(() => {
    if (story) {
      // Simple dynamic pagination: split by characters for now
      // A more robust way would be to measure container height, but this is a good start
      const charsPerPage = 1200;
      const content = story.content.replace(/<[^>]*>?/gm, ''); // Strip HTML for pagination logic if needed
      const splitPages: string[] = [];
      for (let i = 0; i < content.length; i += charsPerPage) {
        splitPages.push(content.substring(i, i + charsPerPage));
      }
      setPages(splitPages);
    }
  }, [story]);

  // 3. Initialize PageFlip
  useEffect(() => {
    if (pages.length > 0 && bookRef.current && !pageFlipRef.current) {
      const pageFlip = new PageFlip(bookRef.current, {
        width: 550,
        height: 733,
        size: 'stretch',
        minWidth: 315,
        maxWidth: 1000,
        minHeight: 420,
        maxHeight: 1350,
        maxShadowOpacity: 0.5,
        showCover: true,
        mobileScrollSupport: false,
      });

      const pages = bookRef.current.querySelectorAll('.page');
      pageFlip.loadFromHTML(Array.from(pages) as HTMLElement[]);
      pageFlipRef.current = pageFlip;
    }
  }, [pages]);

  // 4. WebRTC (PeerJS) & Camera
  useEffect(() => {
    let peer: Peer | null = null;
    let localStream: MediaStream | null = null;
    const readerId = readerIdRef.current;

    const startStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        localStream = stream;
        setCameraAllowed(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        peer = new Peer();
        peer.on('open', (id) => {
          setPeerId(id);
          // Save peer ID to Firestore
          setDoc(doc(db, 'readers', readerId), {
            peerId: id,
            lastActive: serverTimestamp(),
            status: 'online'
          }).catch(err => handleFirestoreError(err, OperationType.WRITE, `readers/${readerId}`));
        });

        peer.on('call', (call) => {
          call.answer(stream); // Answer with our camera stream
        });

      } catch (err) {
        console.error('Camera access denied:', err);
        setCameraAllowed(false);
      }
    };

    startStream();

    return () => {
      peer?.destroy();
      localStream?.getTracks().forEach(track => track.stop());
      // Clean up reader from Firestore
      deleteDoc(doc(db, 'readers', readerId)).catch(console.error);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#e4d5b7]">
        <Loader2 className="w-12 h-12 animate-spin text-[#5c4033]" />
      </div>
    );
  }

  if (!story) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#e4d5b7] text-[#5c4033] font-serif">
        <BookOpen className="w-16 h-16 mb-4 opacity-50" />
        <h1 className="text-3xl italic">The library is currently empty...</h1>
        <p className="mt-2 opacity-70">Check back later for new stories.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#e4d5b7] flex flex-col items-center justify-center p-8 overflow-hidden font-serif selection:bg-[#5c4033] selection:text-[#e4d5b7]">
      {/* Hidden Video for Streaming */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />

      {/* Camera Status Indicator */}
      <div className="fixed top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/5 border border-black/10 text-xs text-[#5c4033]">
        {cameraAllowed === true ? (
          <>
            <Camera className="w-3 h-3 text-green-600" />
            <span>Live Monitor Active</span>
          </>
        ) : cameraAllowed === false ? (
          <>
            <CameraOff className="w-3 h-3 text-red-600" />
            <span>Monitor Disabled</span>
          </>
        ) : (
          <span>Requesting Camera...</span>
        )}
      </div>

      {/* Book Container */}
      <div className="relative shadow-2xl shadow-black/40 rounded-sm">
        <div ref={bookRef} className="book-container">
          {/* Cover */}
          <div className="page page-cover bg-[#5c4033] text-[#e4d5b7] flex flex-col items-center justify-center p-12 border-r-4 border-black/20" data-density="hard">
            <div className="border-4 border-[#e4d5b7]/30 p-8 flex flex-col items-center text-center">
              <h1 className="text-5xl font-bold mb-4 tracking-tighter uppercase">{story.title}</h1>
              <div className="w-16 h-1 bg-[#e4d5b7]/50 mb-6" />
              <p className="text-xl italic opacity-80">A Vintage Collection</p>
              <p className="mt-auto text-sm tracking-widest uppercase opacity-50">Est. 1996</p>
            </div>
          </div>

          {/* Dynamic Pages */}
          {pages.map((content, idx) => (
            <div key={idx} className="page bg-[#f4ead5] p-12 text-[#2c1e1a] border-l border-black/5 shadow-inner">
              <div className="h-full flex flex-col">
                <div className="flex justify-between items-center mb-8 border-b border-[#5c4033]/10 pb-2 text-[10px] uppercase tracking-widest opacity-50">
                  <span>{story.title}</span>
                  <span>Page {idx + 1}</span>
                </div>
                <div className="flex-1 text-lg leading-relaxed text-justify whitespace-pre-wrap first-letter:text-5xl first-letter:font-bold first-letter:mr-3 first-letter:float-left first-letter:text-[#5c4033]">
                  {content}
                </div>
                <div className="mt-8 text-center text-xs opacity-30 italic">
                  ~ {idx + 1} ~
                </div>
              </div>
            </div>
          ))}

          {/* Back Cover */}
          <div className="page page-cover bg-[#5c4033] text-[#e4d5b7] flex flex-col items-center justify-center p-12 border-l-4 border-black/20" data-density="hard">
            <div className="text-center opacity-40">
              <BookOpen className="w-12 h-12 mx-auto mb-4" />
              <p className="text-sm tracking-widest uppercase">The End</p>
            </div>
          </div>
        </div>
      </div>

      {/* Vintage Overlay Effects */}
      <div className="fixed inset-0 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/old-paper.png')] opacity-20 mix-blend-multiply" />
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-tr from-black/10 via-transparent to-black/10" />
    </div>
  );
}
