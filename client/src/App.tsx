import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Users, PlusCircle, LogOut, Smile, Send, Sparkles, Shield, Copy, RefreshCw, Circle, Lock, PanelLeft, PanelRight } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

type ThemeName = 'dark' | 'light' | 'neon' | 'glass';

type RoomState = {
  roomId: string;
  roomCode: string;
  owner: string;
  members: Array<{ username: string }>;
  messageCount: number;
};

type MessageItem = {
  id: string;
  roomId: string;
  username: string;
  text: string;
  createdAt: number;
  replyTo?: string;
  system?: boolean;
};

const socket: Socket = io({ transports: ['websocket'] });
const emojiOptions = ['✨', '🔥', '💡', '🎉', '❤️', '😂'];
const USERNAME_REGEX = /^[A-Za-z0-9_]{3,20}$/;

const themeClasses: Record<ThemeName, string> = {
  dark: 'bg-slate-950 text-slate-100',
  light: 'bg-slate-50 text-slate-900',
  neon: 'bg-slate-950 text-cyan-100',
  glass: 'bg-slate-900/80 text-slate-100',
};

const sanitizeText = (input: string) => input.replace(/[<>]/g, '').trim().slice(0, 300);

const formatTime = (value: number) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const BrandMark = () => (
  <div className="flex items-center gap-3">
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-fuchsia-500 shadow-lg shadow-cyan-500/30">
      <svg viewBox="0 0 64 64" className="h-7 w-7 text-white" fill="none">
        <path d="M18 16h10l10 16 10-16h10l-16 24 16 24h-10l-10-16-10 16H18l16-24-16-24Z" fill="currentColor" />
      </svg>
    </div>
    <div className="flex flex-col">
      <span className="text-xl font-black tracking-[0.24em] text-white">ANKUSH</span>
      <span className="text-[11px] uppercase tracking-[0.35em] text-cyan-200/80">Developer</span>
    </div>
  </div>
);

function App() {
  const [theme, setTheme] = useState<ThemeName>('dark');
  const [isRegistered, setIsRegistered] = useState(false);
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([]);
  const [activeRoomId, setActiveRoomId] = useState('global');
  const [roomCode, setRoomCode] = useState('');
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [roomOptions, setRoomOptions] = useState<string[]>([]);
  const [joinedRoomCode, setJoinedRoomCode] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const isAutoScrollEnabledRef = useRef(true);

  useEffect(() => {
    socket.on('connect', () => {
      setStatusMessage('Connected to ChatVerse');
    });

    socket.on('disconnect', () => {
      setStatusMessage('Connection lost. Reconnecting...');
    });

    socket.on('receive-message', (message: MessageItem) => {
      setMessages((current) => [...current, message]);
    });

    socket.on('message-edited', (message: MessageItem) => {
      setMessages((current) => current.map((item) => (item.id === message.id ? message : item)));
    });

    socket.on('message-deleted', (messageId: string) => {
      setMessages((current) => current.filter((item) => item.id !== messageId));
    });

    socket.on('room-state', (state: RoomState) => {
      setRoomState(state);
      setActiveRoomId(state.roomId);
      setRoomCode(state.roomCode);
    });

    socket.on('room-created', (data: { roomId: string; roomCode: string; owner: string; members: string[] }) => {
      setActiveRoomId(data.roomId);
      setRoomCode(data.roomCode);
      setRoomState({ roomId: data.roomId, roomCode: data.roomCode, owner: data.owner, members: data.members.map((user) => ({ username: user })), messageCount: 0 });
    });

    socket.on('user-online', (data: { username: string; onlineCount: number }) => {
      setOnlineCount(data.onlineCount);
      setStatusMessage(`${data.username} is online`);
    });

    socket.on('user-offline', (data: { username: string; onlineCount: number }) => {
      setOnlineCount(data.onlineCount);
      setStatusMessage(`${data.username} left the room`);
    });

    socket.on('typing', (payload: { username: string }) => {
      setTypingUsers((current) => Array.from(new Set([...current, payload.username])));
    });

    socket.on('stop-typing', (payload: { username: string }) => {
      setTypingUsers((current) => current.filter((value) => value !== payload.username));
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('receive-message');
      socket.off('message-edited');
      socket.off('message-deleted');
      socket.off('room-state');
      socket.off('room-created');
      socket.off('user-online');
      socket.off('user-offline');
      socket.off('typing');
      socket.off('stop-typing');
    };
  }, []);

  const scrollToBottom = (behavior: 'auto' | 'smooth' = 'smooth') => {
    const container = chatViewportRef.current;
    if (!container) return;

    if (!isAutoScrollEnabledRef.current) return;

    window.requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior });
    });
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages, typingUsers, activeRoomId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTypingUsers([]);
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [typingUsers]);

  const onlineMembers = useMemo(() => {
    return Array.from(new Set(roomState?.members.map((member) => member.username) ?? []));
  }, [roomState]);

  const validateUsername = async (nextUsername: string) => {
    if (!USERNAME_REGEX.test(nextUsername)) {
      setUsernameError('Username must be 3-20 chars using letters, numbers, and underscores.');
      return false;
    }

    try {
      const response = await fetch('/api/validate-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: nextUsername }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setUsernameError(payload.error || 'Username already taken.');
        setUsernameSuggestions(payload.suggestions || []);
        return false;
      }

      setUsernameError('');
      setUsernameSuggestions([]);
      return true;
    } catch {
      setUsernameError('Unable to verify username right now.');
      return false;
    }
  };

  const handleJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const inUse = await validateUsername(username);
    if (!inUse) return;

    socket.emit('register-user', { username }, (result: { ok: boolean; error?: string; roomId?: string; username?: string }) => {
      if (!result.ok) {
        setUsernameError(result.error || 'Unable to join.');
        return;
      }
      setIsRegistered(true);
      setActiveRoomId(result.roomId || 'global');
      setStatusMessage(`${result.username} joined ChatVerse`);
    });
  };

  const handleCreateRoom = () => {
    socket.emit('create-room', {}, (result: { ok: boolean; room?: { id: string; code: string; owner: string }; error?: string }) => {
      if (!result.ok) {
        setStatusMessage(result.error || 'Unable to create room.');
        return;
      }
      setJoinedRoomCode(result.room?.code || '');
      setStatusMessage(`Room ${result.room?.code} created`);
    });
  };

  const handleJoinRoom = () => {
    socket.emit('join-room', { roomCode: joinedRoomCode }, (result: { ok: boolean; error?: string; roomCode?: string; roomId?: string }) => {
      if (!result.ok) {
        setStatusMessage(result.error || 'Unable to join room.');
        return;
      }
      setStatusMessage(`Joined room ${result.roomCode}`);
    });
  };

  const handleSend = () => {
    if (!draft.trim()) return;
    socket.emit('send-message', { roomId: activeRoomId, text: sanitizeText(draft), username }, (result: { ok: boolean; error?: string }) => {
      if (!result.ok) {
        setStatusMessage(result.error || 'Message not sent.');
        return;
      }
      setDraft('');
    });
  };

  const handleTyping = (value: string) => {
    setDraft(value);
    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing', { roomId: activeRoomId });
    }

    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = window.setTimeout(() => {
      setIsTyping(false);
      socket.emit('stop-typing', { roomId: activeRoomId });
    }, 900);
  };

  const themePanel = {
    dark: 'from-slate-950 via-slate-900 to-slate-950',
    light: 'from-slate-100 via-white to-slate-200',
    neon: 'from-fuchsia-950 via-slate-950 to-cyan-950',
    glass: 'from-slate-900 via-slate-950 to-slate-900',
  }[theme];

  return (
    <div className={`min-h-screen ${themeClasses[theme]} transition-all duration-300`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${themePanel} opacity-90`} />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -left-16 top-20 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute right-12 top-10 h-72 w-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute left-1/3 bottom-0 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      {!isRegistered ? (
        <div className="relative flex min-h-screen items-center justify-center p-6">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="glass max-w-xl rounded-[28px] p-8 shadow-glass w-full">
            <div className="mb-6">
              <BrandMark />
            </div>
            <h1 className="text-4xl font-bold md:text-5xl">Choose Your Username</h1>
            <p className="mt-3 text-slate-300">Anonymous, secure, and instant. Pick a unique handle to enter the global conversation.</p>
            <form onSubmit={handleJoin} className="mt-8 space-y-4">
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 outline-none ring-0"
                placeholder="Enter a unique username"
              />
              {usernameError && <p className="text-rose-300">{usernameError}</p>}
              {usernameSuggestions.length > 0 && (
                <div className="rounded-2xl bg-slate-900/70 p-3 text-sm">
                  <p className="mb-2 text-slate-200">Suggested alternatives</p>
                  <div className="flex flex-wrap gap-2">
                    {usernameSuggestions.map((suggestion) => (
                      <button key={suggestion} type="button" onClick={() => setUsername(suggestion)} className="rounded-full bg-cyan-500/20 px-3 py-1 text-cyan-200">
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button type="submit" className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-4 py-3 font-semibold text-white">
                Join Global Chat
              </button>
            </form>
          </motion.div>
        </div>
      ) : (
        <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col p-3 md:p-5">
          <header className="glass mb-3 flex flex-wrap items-center justify-between rounded-3xl px-4 py-3">
            <div>
              <BrandMark />
              <div className="mt-2 text-sm text-slate-300">Welcome {username}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['dark', 'light', 'neon', 'glass'] as ThemeName[]).map((item) => (
                <button key={item} onClick={() => setTheme(item)} className={`rounded-full px-3 py-1 text-sm capitalize ${theme === item ? 'bg-cyan-500 text-slate-950' : 'bg-slate-900/70 text-slate-200'}`}>
                  {item}
                </button>
              ))}
            </div>
          </header>

          <main className="grid flex-1 gap-3 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
            <aside className="glass rounded-3xl p-4">
              <div className="mb-4 flex items-center gap-2 text-cyan-300"><PanelLeft size={18} /> <span className="font-semibold">Sidebar</span></div>
              <div className="space-y-2">
                <button className="flex w-full items-center gap-2 rounded-2xl bg-cyan-500/15 px-3 py-3 text-left"><MessageCircle size={16} /> Global Chat</button>
                <button onClick={handleCreateRoom} className="flex w-full items-center gap-2 rounded-2xl bg-white/5 px-3 py-3 text-left"><PlusCircle size={16} /> Create Room</button>
                <div className="rounded-2xl bg-white/5 p-3">
                  <label className="mb-2 block text-sm text-slate-300">Room code</label>
                  <input value={joinedRoomCode} onChange={(event) => setJoinedRoomCode(event.target.value)} className="w-full rounded-xl bg-slate-950/70 px-3 py-2" placeholder="A4D7FQ" />
                  <button onClick={handleJoinRoom} className="mt-2 w-full rounded-xl bg-fuchsia-500/80 px-3 py-2 text-white">Join Room</button>
                </div>
                <div className="rounded-2xl bg-white/5 p-3">
                  <div className="flex items-center gap-2 text-sm text-slate-300"><Users size={15} /> Online User Count</div>
                  <div className="mt-2 text-2xl font-bold text-cyan-300">{onlineCount}</div>
                </div>
              </div>
            </aside>

            <section className="glass flex min-h-[60vh] flex-col rounded-3xl p-3">
              <div className="mb-3 flex items-center justify-between rounded-2xl bg-slate-950/40 p-3">
                <div>
                  <div className="text-lg font-semibold">{roomState?.roomCode ? `Room ${roomState.roomCode}` : 'Global Chat'}</div>
                  <div className="text-xs text-slate-300">{roomState?.owner ? `Owner: ${roomState.owner}` : 'Global chat'}</div>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-300"><Circle size={10} className="text-emerald-400" /> live</div>
              </div>

              <div
                ref={chatViewportRef}
                onScroll={() => {
                  const container = chatViewportRef.current;
                  if (!container) return;
                  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
                  isAutoScrollEnabledRef.current = distanceFromBottom < 120;
                }}
                className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-slate-950/30 p-3"
              >
                <AnimatePresence>
                  {messages.map((message) => (
                    <motion.div key={message.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl px-3 py-2 ${message.system ? 'bg-cyan-500/10 text-cyan-100' : 'bg-white/5 text-slate-100'}`}>
                      <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
                        <span>{message.username}</span>
                        <span>{formatTime(message.createdAt)}</span>
                      </div>
                      <div className="mt-1 break-words">{message.text}</div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {typingUsers.length > 0 && <div className="text-sm text-cyan-200">{typingUsers.join(', ')} is typing...</div>}
                <div ref={messageEndRef} />
              </div>

              <div className="mt-3 rounded-2xl bg-slate-950/40 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <button onClick={() => setDraft((current) => `${current}${emojiOptions[0]}`)} className="rounded-full bg-white/5 p-2"><Smile size={16} /></button>
                  <button className="rounded-full bg-white/5 p-2"><Sparkles size={16} /></button>
                  <button className="rounded-full bg-white/5 p-2"><Lock size={16} /></button>
                </div>
                <div className="flex gap-2">
                  <textarea value={draft} onChange={(event) => handleTyping(event.target.value)} className="min-h-[70px] flex-1 rounded-2xl bg-slate-900/80 px-3 py-2 outline-none" placeholder="Type a message..." />
                  <button onClick={handleSend} className="rounded-2xl bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-4 text-white"><Send size={18} /></button>
                </div>
              </div>
            </section>

            <aside className="glass rounded-3xl p-4">
              <div className="mb-4 flex items-center gap-2 text-cyan-300"><PanelRight size={18} /> <span className="font-semibold">Room Info</span></div>
              <div className="space-y-3">
                <div className="rounded-2xl bg-white/5 p-3">
                  <div className="mb-2 text-sm text-slate-300">Share room code</div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-900/80 px-3 py-2">
                    <span className="font-semibold">{roomCode || 'GLOBAL'}</span>
                    <button onClick={() => navigator.clipboard.writeText(roomCode || 'GLOBAL')} className="rounded-full bg-white/5 p-2"><Copy size={14} /></button>
                  </div>
                </div>
                <div className="rounded-2xl bg-white/5 p-3">
                  <div className="mb-2 text-sm text-slate-300">Online members</div>
                  <div className="space-y-2">
                    {onlineMembers.length ? onlineMembers.map((member) => <div key={member} className="rounded-xl bg-slate-950/70 px-3 py-2 text-sm">{member}</div>) : <div className="text-sm text-slate-400">No members yet.</div>}
                  </div>
                </div>
                <div className="rounded-2xl bg-white/5 p-3">
                  <div className="mb-2 text-sm text-slate-300">Status</div>
                  <div className="text-sm text-cyan-200">{statusMessage || 'Idle'}</div>
                </div>
              </div>
            </aside>
          </main>
        </div>
      )}
    </div>
  );
}

export default App;
