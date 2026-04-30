/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Trophy, 
  Users, 
  Calendar, 
  Save, 
  Upload, 
  Plus, 
  Trash2, 
  RotateCcw, 
  Eraser, 
  ChevronRight, 
  LogOut, 
  LogIn,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Hash,
  Copy,
  LayoutDashboard,
  Clock,
  X,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  orderBy
} from 'firebase/firestore';

import { auth, db, googleProvider, handleFirestoreError, testConnection } from './lib/firebase';
import { cn } from './lib/utils';
import { Tournament, Game, FormatType, Standing } from './types';

// --- Constants & Helpers ---

const SAMPLE_NAMES = ['Magnus Carlsen', 'Gukesh D', 'Ding Liren', 'Hikaru Nakamura'];

function uid() {
  return 'trn-' + Math.random().toString(36).slice(2, 10);
}

function roundRobinRounds(playerNames: string[]) {
  const list = [...playerNames];
  if (list.length % 2 === 1) list.push('BYE');
  const n = list.length;
  const rounds: { white: string; black: string }[][] = [];
  let arr = [...list];

  for (let round = 0; round < n - 1; round++) {
    const pairings: { white: string; black: string }[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== 'BYE' && b !== 'BYE') {
        const white = round % 2 === 0 ? a : b;
        const black = round % 2 === 0 ? b : a;
        pairings.push({ white, black });
      }
    }
    rounds.push(pairings);
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return rounds;
}

function buildSchedule(players: string[], type: FormatType = 'double'): Game[] {
  const firstLeg = roundRobinRounds(players);
  let rounds = [...firstLeg];
  if (type === 'double') {
    const secondLeg = firstLeg.map(pairings => pairings.map(g => ({ white: g.black, black: g.white })));
    rounds = rounds.concat(secondLeg);
  }

  const games: Game[] = [];
  rounds.forEach((pairings, roundIndex) => {
    pairings.forEach((g, boardIndex) => {
      games.push({
        id: `${roundIndex + 1}-${boardIndex + 1}-${g.white}-${g.black}`,
        round: roundIndex + 1,
        board: boardIndex + 1,
        white: g.white,
        black: g.black,
        result: ''
      });
    });
  });
  return games;
}

// --- Components ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ msg: string; type: 'ok' | 'err' | 'warn' | null }>({ msg: '', type: null });
  const [showHelp, setShowHelp] = useState(false);
  const [showDataModal, setShowDataModal] = useState(false);
  const [myTournaments, setMyTournaments] = useState<{id: string, name: string}[]>([]);

  // Tournament State
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentIdInput, setTournamentIdInput] = useState('');
  const [formatType, setFormatType] = useState<FormatType>('double');
  const [players, setPlayers] = useState<string[]>(['Player 1', 'Player 2', 'Player 3', 'Player 4']);
  const [games, setGames] = useState<Game[]>([]);
  const [allowGuestEdits, setAllowGuestEdits] = useState(false);
  const [tournamentOwnerId, setTournamentOwnerId] = useState<string | null>(null);

  const fetchMyTournaments = async (uid: string) => {
    try {
      const q = query(
        collection(db, 'tournaments'), 
        where('ownerId', '==', uid),
        orderBy('updatedAt', 'desc')
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, name: d.data().tournamentName }));
      setMyTournaments(list);
    } catch (err) {
      console.error("Error fetching tournaments:", err);
    }
  };

  useEffect(() => {
    testConnection();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) fetchMyTournaments(u.uid);
      else setMyTournaments([]);
    });
    return unsub;
  }, []);

  const setFeedback = (msg: string, type: 'ok' | 'err' | 'warn' | null = 'ok') => {
    setStatus({ msg, type });
    if (type !== 'err') {
      setTimeout(() => setStatus({ msg: '', type: null }), 4000);
    }
  };

  const handleCopyId = () => {
    if (!tournamentIdInput) return;
    navigator.clipboard.writeText(tournamentIdInput);
    setFeedback('ID copied to clipboard.');
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setFeedback('Signed in successfully.');
    } catch (err: any) {
      setFeedback('Sign in failed: ' + err.message, 'err');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setFeedback('Signed out.');
    } catch (err: any) {
      setFeedback('Sign out failed.', 'err');
    }
  };

  const handleAddPlayer = () => {
    setPlayers([...players, `Player ${players.length + 1}`]);
  };

  const handleRemovePlayer = (idx: number) => {
    setPlayers(players.filter((_, i) => i !== idx));
  };

  const handlePlayerChange = (idx: number, val: string) => {
    const newPlayers = [...players];
    newPlayers[idx] = val;
    setPlayers(newPlayers);
  };

  const handleLoadSamples = () => {
    setPlayers([...SAMPLE_NAMES]);
    setFeedback('Sample names loaded.');
  };

  const handleGenerateSchedule = () => {
    const cleanPlayers = players.map(p => p.trim()).filter(Boolean);
    const unique = new Set(cleanPlayers.map(p => p.toLowerCase()));
    
    if (cleanPlayers.length < 2) {
      return setFeedback('Add at least 2 players.', 'err');
    }
    if (unique.size !== cleanPlayers.length) {
      return setFeedback('Player names must be unique.', 'err');
    }

    setPlayers(cleanPlayers);
    const newGames = buildSchedule(cleanPlayers, formatType);
    setGames(newGames);
    setFeedback('Schedule generated.');
  };

  const handleResultChange = (idx: number, val: Game['result']) => {
    const newGames = [...games];
    newGames[idx].result = val;
    setGames(newGames);
  };

  const handleSave = async () => {
    if (!user) return setFeedback('Please sign in to save.', 'warn');
    if (!games.length) return setFeedback('Generate a schedule first.', 'err');

    const cleanTid = tournamentIdInput.trim();
    const isExisting = cleanTid !== "" && myTournaments.some(t => t.id === cleanTid);
    
    const tid = cleanTid || uid();
    setTournamentIdInput(tid);

    const payload: Tournament = {
      tournamentName: tournamentName || 'Untitled Tournament',
      tournamentId: tid,
      formatType,
      players,
      games,
      ownerId: user.uid,
      updatedAt: serverTimestamp(),
      allowGuestEdits
    };

    try {
      await setDoc(doc(db, 'tournaments', tid), payload);
      setFeedback(isExisting ? `Updated tournament: ${tid}` : `Saved as new: ${tid}`);
      if (user) fetchMyTournaments(user.uid);
    } catch (err: any) {
      setFeedback(err?.message || 'Failed to save. Check your connection.', 'err');
    }
  };

  const handleLoad = async (idToLoad?: string) => {
    const targetId = idToLoad || tournamentIdInput.trim();
    console.log('handleLoad called, targetId:', targetId);
    if (!targetId) return setFeedback('Enter or select a Tournament ID.', 'err');
    
    try {
      console.log('Fetching from Firestore...');
      const snap = await getDoc(doc(db, 'tournaments', targetId));
      console.log('Snap exists:', snap.exists());
      if (!snap.exists()) return setFeedback('Tournament not found.', 'warn');
      
      const data = snap.data() as Tournament;
      console.log('Data loaded:', JSON.stringify(data).slice(0, 200));
      setTournamentName(data.tournamentName);
      setTournamentIdInput(data.tournamentId);
      setFormatType(data.formatType);
      setPlayers(data.players);
      setGames(data.games);
      setAllowGuestEdits(!!data.allowGuestEdits);
      setTournamentOwnerId(data.ownerId);
      setFeedback('Tournament loaded.');
      setShowDataModal(false);
    } catch (err: any) {
      console.error('Load error:', err);
      setFeedback(err?.message || 'Failed to load. Check the ID and try again.', 'err');
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteTournament = async (tid: string) => {
    if (deletingId !== tid) {
      setDeletingId(tid);
      setTimeout(() => setDeletingId(null), 3000);
      return;
    }

    try {
      await deleteDoc(doc(db, 'tournaments', tid));
      setFeedback("Tournament deleted.", "warn");
      setDeletingId(null);
      if (user) fetchMyTournaments(user.uid);
      if (tournamentIdInput === tid) handleNewTournament();
    } catch (err: any) {
      handleFirestoreError(err, 'delete', tid);
    }
  };

  const handleClearResults = () => {
    setGames(games.map(g => ({ ...g, result: '' })));
    setFeedback('Results cleared.', 'warn');
  };

  const handleNewTournament = () => {
    setTournamentName('');
    setTournamentIdInput('');
    setFormatType('double');
    setPlayers(['Player 1', 'Player 2']);
    setGames([]);
    setAllowGuestEdits(false);
    setTournamentOwnerId(user?.uid || null);
    setFeedback('Ready for new tournament.', 'warn');
  };

  // --- Derived State ---

  const standings = useMemo(() => {
    const map = new Map<string, Standing>();
    players.forEach(name => {
      map.set(name, { name, played: 0, wins: 0, draws: 0, losses: 0, points: 0, sbScore: 0, blackWins: 0 });
    });

    // 1st Pass: Basic stats
    games.forEach(g => {
      if (!g.result) return;
      const w = map.get(g.white);
      const b = map.get(g.black);
      if (!w || !b) return;

      w.played += 1;
      b.played += 1;

      if (g.result === '1-0') {
        w.wins += 1;
        b.losses += 1;
        w.points += 1;
      } else if (g.result === '0-1') {
        b.wins += 1;
        b.blackWins += 1;
        w.losses += 1;
        b.points += 1;
      } else if (g.result === '0.5-0.5') {
        w.draws += 1;
        b.draws += 1;
        w.points += 0.5;
        b.points += 0.5;
      }
    });

    // 2nd Pass: Calculate SB Score (requires final points from 1st pass)
    games.forEach(g => {
      if (!g.result) return;
      const w = map.get(g.white);
      const b = map.get(g.black);
      if (!w || !b) return;

      if (g.result === '1-0') {
        w.sbScore += b.points;
      } else if (g.result === '0-1') {
        b.sbScore += w.points;
      } else if (g.result === '0.5-0.5') {
        w.sbScore += b.points * 0.5;
        b.sbScore += w.points * 0.5;
      }
    });

    // Sorting Logic: Professional Chess Tie-breakers
    return [...map.values()].sort((a, b) => {
      // 1. Total Points
      if (b.points !== a.points) return b.points - a.points;

      // 2. Direct Encounter (Head-to-Head)
      // We check points specifically between these two tied players
      const h2hGames = games.filter(g => 
        g.result && 
        ((g.white === a.name && g.black === b.name) || (g.white === b.name && g.black === a.name))
      );
      let aH2hPoints = 0;
      let bH2hPoints = 0;
      h2hGames.forEach(g => {
        if (g.result === '1-0') {
          if (g.white === a.name) aH2hPoints += 1; else bH2hPoints += 1;
        } else if (g.result === '0-1') {
          if (g.black === a.name) aH2hPoints += 1; else bH2hPoints += 1;
        } else if (g.result === '0.5-0.5') {
          aH2hPoints += 0.5; bH2hPoints += 0.5;
        }
      });
      if (bH2hPoints !== aH2hPoints) return bH2hPoints - aH2hPoints;

      // 3. Sonneborn-Berger
      if (b.sbScore !== a.sbScore) return b.sbScore - a.sbScore;

      // 4. Most Wins
      if (b.wins !== a.wins) return b.wins - a.wins;

      // 5. Most Wins with Black
      if (b.blackWins !== a.blackWins) return b.blackWins - a.blackWins;

      // 6. Alphabetical (Absolute fallback)
      return a.name.localeCompare(b.name);
    });
  }, [players, games]);

  const podium = standings.slice(0, 3);

  // --- Render Helpers ---

  const renderResultBadge = (game: Game, player: string) => {
    if (!game.result) return null;
    let res = '';
    if (game.white === player) {
      if (game.result === '1-0') res = '1';
      else if (game.result === '0.5-0.5') res = '½';
      else res = '0';
    } else {
      if (game.result === '0-1') res = '1';
      else if (game.result === '0.5-0.5') res = '½';
      else res = '0';
    }
    return <span className="font-mono text-xs opacity-80">{res}</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1020] flex items-center justify-center text-white font-sans">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1020] text-[#e5eefc] p-4 md:p-8 font-sans selection:bg-blue-500/30">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <Trophy className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-blue-400">Live Tournament System</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-2 leading-none">
              Checkmate <span className="text-blue-500">Manager</span>
            </h1>
            <p className="text-[#97a6c3] max-w-lg">Round-Robin chess engine. Build a tournament, enter results, and see the standings live.</p>
          </motion.div>

            <div className="flex flex-wrap gap-4">
              <div className="flex gap-2">
                <StatCard label="Players" value={players.length} />
                <StatCard label="Games" value={games.length} />
                <StatCard label="Rounds" value={games.length ? Math.max(...games.map(g => g.round)) : 0} />
              </div>
              
              {user ? (
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors text-sm font-semibold"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-lg shadow-blue-500/20 text-sm font-bold"
                >
                  <LogIn className="w-4 h-4" /> Sign In to Save
                </button>
              )}
            </div>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Column 1: Setup */}
          <div className="lg:col-span-4 space-y-6">
            {allowGuestEdits && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-center gap-3"
              >
                <div className="p-2 bg-blue-500/20 rounded-xl text-blue-400">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-blue-400">Collaborative Mode</div>
                  <div className="text-xs text-[#97a6c3]">Anyone with the ID can manage scores and setup.</div>
                </div>
              </motion.div>
            )}

            <Card title="Setup" icon={Plus}>
              <div className="space-y-4">
                <InputGroup label="Tournament Name">
                  <input 
                    value={tournamentName}
                    onChange={e => setTournamentName(e.target.value)}
                    placeholder="e.g. Winter Open 2024"
                    className="w-full bg-[#0f172a]/80 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500/50 outline-none"
                  />
                </InputGroup>
                
                <InputGroup label="Format">
                  <select 
                    value={formatType}
                    onChange={e => setFormatType(e.target.value as FormatType)}
                    className="w-full bg-[#0f172a]/80 border border-white/10 rounded-xl p-3 text-sm focus:border-blue-500/50 outline-none"
                  >
                    <option value="double">Double Round Robin</option>
                    <option value="single">Single Round Robin</option>
                  </select>
                </InputGroup>

                <div className="flex gap-2">
                  <button onClick={handleAddPlayer} className="flex-1 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-500/20">Add Player</button>
                  <button onClick={handleLoadSamples} className="flex-1 py-1.5 bg-white/5 border border-white/10 text-[#97a6c3] rounded-lg text-xs font-bold hover:bg-white/10">Sample Names</button>
                </div>

                <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                  <AnimatePresence initial={false}>
                    {players.map((p, i) => (
                      <motion.div 
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="flex gap-2"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black text-white/40">{i+1}</div>
                        <input 
                          value={p}
                          onChange={e => handlePlayerChange(i, e.target.value)}
                          className="flex-1 bg-transparent border-b border-white/10 text-sm focus:border-blue-500/50 outline-none py-1"
                        />
                        <button onClick={() => handleRemovePlayer(i)} className="p-2 text-rose-500/60 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-4">
                  <button onClick={handleGenerateSchedule} className="flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition-transform active:scale-95 shadow-lg shadow-blue-500/20">
                    <Calendar className="w-4 h-4" /> Generate
                  </button>
                  <button onClick={handleNewTournament} className="flex items-center justify-center gap-2 py-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 rounded-xl font-bold text-xs transition-transform active:scale-95">
                    <RotateCcw className="w-4 h-4" /> Reset
                  </button>
                </div>
              </div>
            </Card>

            <Card title="Cloud Sync" icon={Save}>
              <div className="space-y-4">
                <InputGroup label="Tournament ID">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                      <input 
                        value={tournamentIdInput}
                        onChange={e => setTournamentIdInput(e.target.value)}
                        placeholder="Auto-generated"
                        className="w-full bg-[#0f172a]/80 border border-white/10 rounded-xl p-3 pl-10 text-xs font-mono focus:border-emerald-500/50 outline-none"
                      />
                    </div>
                    {tournamentIdInput && (
                      <button 
                        onClick={handleCopyId}
                        className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-all"
                        title="Copy ID"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </InputGroup>
                
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button onClick={handleSave} className="flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-emerald-500/20">
                    <Save className="w-4 h-4" /> Save Cloud
                  </button>
                  <button onClick={handleLoad} className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-bold text-xs transition-all hover:bg-white/10">
                    <Upload className="w-4 h-4" /> Load ID
                  </button>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={() => {
                      if (!user) return;
                      setAllowGuestEdits(!allowGuestEdits);
                    }}
                    disabled={!user}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-xl border transition-all",
                      allowGuestEdits 
                        ? "bg-blue-500/10 border-blue-500/30 text-blue-400" 
                        : "bg-white/5 border-white/10 text-[#97a6c3] hover:bg-white/10",
                      !user && "opacity-50 cursor-not-allowed group"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4" />
                      <span className="text-[11px] font-bold">Allow Public Tournament Editing</span>
                    </div>
                    <div className={cn(
                      "w-8 h-4 rounded-full relative transition-colors",
                      allowGuestEdits ? "bg-blue-500" : "bg-white/10"
                    )}>
                      <div className={cn(
                        "absolute top-1 w-2 h-2 bg-white rounded-full transition-all",
                        allowGuestEdits ? "left-5" : "left-1"
                      )} />
                    </div>
                  </button>
                </div>

                {status.msg && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }} 
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "p-3 rounded-xl border flex items-center gap-3 text-xs font-medium",
                      status.type === 'ok' && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
                      status.type === 'err' && "bg-rose-500/10 border-rose-500/20 text-rose-400",
                      status.type === 'warn' && "bg-amber-500/10 border-amber-500/20 text-amber-400"
                    )}
                  >
                    {status.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {status.msg}
                  </motion.div>
                )}
              </div>
            </Card>

            {user && (
              <Card title="My Tournaments" icon={LayoutDashboard}>
                <div className="space-y-2">
                  {myTournaments.length > 0 ? (
                    <>
                      <div className="space-y-1.5">
                        {myTournaments.slice(0, 3).map((t, idx) => (
                          <button 
                            key={idx}
                            onClick={() => handleLoad(t.id)}
                            className="w-full group flex items-center gap-2.5 p-2.5 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-blue-500/5 hover:border-blue-500/20 transition-all text-left"
                          >
                            <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
                              <Clock className="w-3 h-3" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-bold truncate text-[#e5eefc]">{t.name || "Untitled"}</div>
                            </div>
                            <ChevronRight className="w-3 h-3 text-[#97a6c3]/20" />
                          </button>
                        ))}
                      </div>
                      
                      {myTournaments.length > 0 && (
                        <button 
                          onClick={() => setShowDataModal(true)}
                          className="w-full py-2 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-[#97a6c3] hover:text-white hover:bg-white/10 transition-all mt-2"
                        >
                          {myTournaments.length > 3 ? `See All ${myTournaments.length} Tournaments` : "Manage All"}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="py-6 text-center border border-dashed border-white/10 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-white/5">
                      Empty Cloud
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* Column 2: Standings & Cross Table */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Podium Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {podium.length > 0 ? (
                <>
                  <PodiumCard place={2} name={podium[1]?.name} points={podium[1]?.points} />
                  <PodiumCard place={1} name={podium[0]?.name} points={podium[0]?.points} />
                  <PodiumCard place={3} name={podium[2]?.name} points={podium[2]?.points} />
                </>
              ) : (
                <div className="md:col-span-3 h-32 border border-dashed border-white/10 rounded-3xl flex items-center justify-center text-white/20 font-bold uppercase tracking-widest text-xs italic">
                  Standings will update live...
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-1 gap-6">
              <Card title="Live Standings" icon={Trophy}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-[#97a6c3] text-[10px] uppercase font-black tracking-widest">
                        <th className="px-4 pb-2">Rank</th>
                        <th className="pb-2">Player</th>
                        <th className="pb-2 text-center">Pld</th>
                        <th className="pb-2 text-center text-emerald-400/80">W</th>
                        <th className="pb-2 text-center text-amber-400/80">D</th>
                        <th className="pb-2 text-center text-rose-400/80">L</th>
                        <th className="pb-2 text-center text-blue-400/80">SB</th>
                        <th className="pb-2 text-center pr-4">Points</th>
                      </tr>
                    </thead>
                    <tbody className="space-y-2">
                      {standings.map((p, i) => (
                        <tr key={i} className="group bg-white/[0.02] hover:bg-blue-500/5 transition-colors">
                          <td className="px-4 py-3 rounded-l-2xl border-l border-y border-white/5">
                            <span className={cn(
                              "inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-black",
                              i === 0 ? "bg-yellow-500/20 text-yellow-500" : i === 1 ? "bg-slate-400/20 text-slate-300" : i === 2 ? "bg-orange-500/20 text-orange-400" : "bg-white/5 text-white/30"
                            )}>{i+1}</span>
                          </td>
                          <td className="py-3 font-bold border-y border-white/5">{p.name}</td>
                          <td className="py-3 text-center border-y border-white/5 font-mono opacity-60">{p.played}</td>
                          <td className="py-3 text-center border-y border-white/5 font-mono text-emerald-400/60">{p.wins}</td>
                          <td className="py-3 text-center border-y border-white/5 font-mono text-amber-400/60">{p.draws}</td>
                          <td className="py-3 text-center border-y border-white/5 font-mono text-rose-400/60">{p.losses}</td>
                          <td className="py-3 text-center border-y border-white/5 font-mono text-blue-400/60">{p.sbScore.toFixed(2)}</td>
                          <td className="py-3 text-center border-y border-white/5 border-r rounded-r-2xl font-black text-blue-400">{p.points.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Cross Table and Schedule */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <Card title="Cross Table" icon={Users}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] border-collapse">
                      <thead>
                        <tr>
                          <th className="p-1 border border-white/5"></th>
                          {players.map((_, i) => <th key={i} className="p-1 border border-white/5 text-center bg-white/5 text-white/40">{i+1}</th>)}
                          <th className="p-1 border border-white/5 text-center bg-blue-500/10 text-blue-400">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {players.map((p1, i) => (
                          <tr key={i}>
                            <th className="p-2 border border-white/5 text-left font-bold text-white/80 whitespace-nowrap overflow-hidden max-w-[100px] text-ellipsis">{i+1}. {p1}</th>
                            {players.map((p2, j) => {
                              if (i === j) return <td key={j} className="p-1 border border-white/5 text-center bg-white/5 text-white/20">—</td>;
                              const matchGames = games.filter(g => (g.white === p1 && g.black === p2) || (g.white === p2 && g.black === p1));
                              return (
                                <td key={j} className="p-1 border border-white/5 text-center h-8">
                                  <div className="flex flex-col gap-0.5 justify-center items-center">
                                    {matchGames.map((mg, k) => <React.Fragment key={k}>{renderResultBadge(mg, p1)}</React.Fragment>)}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="p-1 border border-white/5 text-center font-black bg-blue-500/5 text-blue-400">
                              {standings.find(s => s.name === p1)?.points.toFixed(1) || '0.0'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card title="Schedule & Results" icon={Calendar}>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-[10px] uppercase font-black text-[#97a6c3] tracking-wider">Results Matrix</span>
                    <button onClick={handleClearResults} className="text-[10px] uppercase font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1"><Eraser className="w-3 h-3" /> Clear Results</button>
                  </div>
                  <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-[#11182d] z-20">
                        <tr className="text-[#98a6c3]/40">
                          <th className="pb-2 text-left font-black pr-2">Rnd</th>
                          <th className="pb-2 text-left font-bold">Matchup <span className="text-[10px] font-medium opacity-70">(White vs Black)</span></th>
                          <th className="pb-2 text-right">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {games.map((g, i) => (
                          <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2 text-[10px] opacity-40">R{g.round}-B{g.board}</td>
                            <td className="py-2 flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-white border border-white/20 shadow-[0_0_5px_rgba(255,255,255,0.3)] shrink-0" title="White" />
                              <span className="font-bold whitespace-nowrap">{g.white}</span>
                              <ChevronRight className="w-3 h-3 opacity-20 shrink-0" />
                              <div className="w-2 h-2 rounded-full bg-[#1e293b] border border-white/10 shadow-[0_0_5px_rgba(0,0,0,0.5)] shrink-0" title="Black" />
                              <span className="font-bold whitespace-nowrap">{g.black}</span>
                            </td>
                            <td className="py-2 text-right">
                              <select 
                                value={g.result}
                                onChange={e => handleResultChange(i, e.target.value as Game['result'])}
                                className="bg-[#0f172a] border border-white/10 rounded-lg p-1 text-[10px] font-bold outline-none focus:border-blue-500/50"
                              >
                                <option value="">—</option>
                                <option value="1-0">1-0</option>
                                <option value="0.5-0.5">½-½</option>
                                <option value="0-1">0-1</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <footer className="mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4 text-[#97a6c3] text-[10px] uppercase font-bold tracking-[0.2em]">
          <div>&copy; {new Date().getFullYear()} Checkmate Tournament Engine</div>
          <div className="flex gap-6">
            <button onClick={() => setShowHelp(true)} className="flex items-center gap-2 hover:text-white transition-colors">
              <HelpCircle className="w-3 h-3" /> System Support
            </button>
            <span>v1.0.4-stable</span>
          </div>
        </footer>
      </div>

      {/* Dashboard Modal */}
      <AnimatePresence>
        {showDataModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowDataModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }} 
              animate={{ scale: 1, opacity: 1, y: 0 }} 
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-[#0a0f1d] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div>
                  <h3 className="text-2xl font-black tracking-tight flex items-center gap-3">
                    Tournament <span className="text-blue-500">Browser</span>
                  </h3>
                  <p className="text-[#97a6c3] text-xs mt-1">Manage and access your cloud-saved tournaments.</p>
                </div>
                <button 
                  onClick={() => setShowDataModal(false)}
                  className="p-3 hover:bg-white/5 rounded-2xl text-[#97a6c3] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-3">
                {myTournaments.length > 0 ? (
                  myTournaments.map((t, idx) => (
                    <div 
                      key={idx}
                      className="group flex items-center gap-4 bg-[#141d30] border border-white/5 rounded-2xl p-4 hover:border-blue-500/30 transition-all hover:bg-blue-500/[0.02]"
                    >
                      <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-400 shrink-0">
                        <Database className="w-4 h-4" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">{t.name || "Untitled"}</div>
                        <div className="text-[10px] font-mono text-[#97a6c3] opacity-60 flex items-center gap-1">
                          <Hash className="w-3 h-3" /> {t.id}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button 
                          onClick={() => handleLoad(t.id)}
                          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-lg shadow-blue-600/5"
                        >
                          Load
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTournament(t.id);
                          }}
                          className={cn(
                            "p-2 rounded-lg transition-all flex items-center gap-2",
                            deletingId === t.id 
                              ? "bg-rose-500 text-white text-[9px] font-bold px-3" 
                              : "text-rose-500/40 hover:text-rose-500 hover:bg-rose-500/10"
                          )}
                        >
                          {deletingId === t.id ? "Delete?" : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-20 text-center">
                    <LayoutDashboard className="w-12 h-12 text-white/5 mx-auto mb-4" />
                    <div className="text-sm font-bold text-white/20 uppercase tracking-[0.2em]">No tournaments found</div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-white/[0.02] border-t border-white/5 text-center">
                <button 
                  onClick={() => setShowDataModal(false)}
                  className="px-8 py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-[#97a6c3] hover:text-white transition-colors"
                >
                  Close Browser
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Help Modal */}
      <AnimatePresence>
        {showHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setShowHelp(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-[#141d30] border border-white/10 rounded-3xl p-8 shadow-2xl"
            >
              <h3 className="text-2xl font-black mb-4 tracking-tight">System <span className="text-blue-500">Manual</span></h3>
              <div className="space-y-4 text-[#97a6c3] text-sm leading-relaxed">
                <p>1. <strong className="text-white">Setup:</strong> Add players and choose Single or Double Round Robin. Player names must be unique.</p>
                <p>2. <strong className="text-white">Generate:</strong> Once players are added, hit Generate to build the schedule. Results are entered directly in the schedule table.</p>
                <p>3. <strong className="text-white">Sync:</strong> Sign in with Google to enable Cloud Save. Your tournament ID allows you to reopen the board from any device.</p>
                <p>4. <strong className="text-white">Analytics:</strong> Standings and the cross-table update in real-time. In case of ties, the system follows the professional hierarchy: Direct Encounter → SB Score → Total Wins → Wins with Black.</p>
              </div>
              <button 
                onClick={() => setShowHelp(false)}
                className="mt-8 w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
              >
                Understood
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59,130,246,0.5); }
      `}</style>
    </div>
  );
}

// --- Sub-components ---

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="px-5 py-3 bg-[#0f172a] border border-white/5 rounded-2xl min-w-[100px]">
      <div className="text-[20px] font-black text-white leading-none mb-1">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#97a6c3]">{label}</div>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <motion.section 
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-[#11182d] border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden group"
    >
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-black tracking-tight">{title}</h2>
        <Icon className="w-5 h-5 text-white/20 group-hover:text-blue-500/40 transition-colors" />
      </div>
      {children}
    </motion.section>
  );
}

function InputGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[11px] font-black uppercase tracking-widest text-[#97a6c3] block">{label}</label>
      {children}
    </div>
  );
}

function PodiumCard({ place, name, points }: { place: 1 | 2 | 3, name?: string, points?: number }) {
  const meta = {
    1: { icon: "🏅", label: "First", color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
    2: { icon: "🥈", label: "Second", color: "text-slate-300", bg: "bg-slate-400/10", border: "border-slate-400/20" },
    3: { icon: "🥉", label: "Third", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
  }[place];

  return (
    <motion.div 
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn("p-6 rounded-3xl border text-center relative overflow-hidden transition-all", meta.bg, meta.border)}
    >
      <div className="text-3xl mb-3">{meta.icon}</div>
      <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40 mb-2">{meta.label} Place</div>
      <div className="text-xl font-black truncate px-2 mb-1">{name || "—"}</div>
      <div className={cn("text-xs font-bold", meta.color)}>{points?.toFixed(1) || "0.0"} Points</div>
      <div className="absolute bottom-[-20%] left-1/2 -translate-x-1/2 text-8xl font-black text-white/[0.03] pointer-events-none">{place}</div>
    </motion.div>
  );
}
