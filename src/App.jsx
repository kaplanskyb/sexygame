import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, setDoc, onSnapshot, 
  query, serverTimestamp, updateDoc, getDocs, deleteDoc, addDoc, where
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { 
  Flame, Zap, RefreshCw, Trophy, 
  CheckCircle2, ArrowRight, Upload, X, Check, ThumbsUp, ThumbsDown
} from 'lucide-react';

// --- PASTE YOUR CONFIG BELOW ---
const firebaseConfig = {
  apiKey: "AIzaSyAw5vlbzCXUa1WDR_YFXyzC6mZ-Dt6cms8",
  authDomain: "sexygame-6e8f3.firebaseapp.com",
  projectId: "sexygame-6e8f3",
  storageBucket: "sexygame-6e8f3.firebasestorage.app",
  messagingSenderId: "474661099120",
  appId: "1:474661099120:web:d594e499ac94200c3146b5"
};
const appId = 'truth-dare-v1';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function TruthAndDareApp() {
  const [user, setUser] = useState(null);
  const [userName, setUserName] = useState('');
  const [gender, setGender] = useState('male');
  const [coupleNumber, setCoupleNumber] = useState('');
  const [code, setCode] = useState('');
  const [gameState, setGameState] = useState(null);
  const [players, setPlayers] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [pairChallenges, setPairChallenges] = useState([]);
  const [uniqueLevels, setUniqueLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [loading, setLoading] = useState(true);
  const [inputAnswer, setInputAnswer] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  // 1. Authentication
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth Error:", error);
      }
    };
    initAuth();
    
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      const savedName = localStorage.getItem('td_username');
      if (savedName) setUserName(savedName);
    });
  }, []);

  // 2. Synchronization
  useEffect(() => {
    if (!user) return;

    // Listen to Game State
    const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main');
    const unsubGame = onSnapshot(gameRef, (docSnap) => {
      if (docSnap.exists()) {
        setGameState(docSnap.data());
      } else {
        setDoc(gameRef, {
          mode: 'lobby',
          currentTurnIndex: 0,
          questionStreak: 0,
          answers: {},
          votes: {},
          points: {},
          code: '',
          timestamp: serverTimestamp()
        });
      }
      setLoading(false);
    });

    // Listen to Players
    const playersRef = collection(db, 'artifacts', appId, 'public', 'data', 'players');
    const unsubPlayers = onSnapshot(query(playersRef), (snapshot) => {
      const pList = snapshot.docs.map(d => d.data());
      pList.sort((a, b) => (a.joinedAt?.seconds || 0) - (b.joinedAt?.seconds || 0));
      setPlayers(pList);
    });

    // Listen to Challenges (Truth/Dare)
    const challengesRef = collection(db, 'artifacts', appId, 'public', 'data', 'challenges');
    const unsubChallenges = onSnapshot(query(challengesRef), (snapshot) => {
      const cList = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
      setChallenges(cList);
      const levels = [...new Set(cList.map(c => c.level))];
      setUniqueLevels(levels);
    });

    // Listen to PairChallenges (Y/N)
    const pairChallengesRef = collection(db, 'artifacts', appId, 'public', 'data', 'pairChallenges');
    const unsubPairChallenges = onSnapshot(query(pairChallengesRef), (snapshot) => {
      const pcList = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
      setPairChallenges(pcList);
    });

    return () => {
      unsubGame();
      unsubPlayers();
      unsubChallenges();
      unsubPairChallenges();
    };
  }, [user]);

  // Actions
  const joinGame = async () => {
    if (!userName.trim() || !user) return;
    localStorage.setItem('td_username', userName);

    if (userName.toLowerCase() === 'admin') {
      setIsAdmin(true);
      return;
    }

    if (!gender || !code || !coupleNumber) return;

    if (code !== gameState?.code) {
      alert('Invalid code');
      return;
    }

    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', user.uid), {
      uid: user.uid, name: userName, gender, coupleNumber, joinedAt: serverTimestamp(), isActive: true
    });
  };

  const setGameCode = async () => {
    if (!code.trim()) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main'), {
      code: code
    });
  };

  const startGame = async () => {
    if (players.length < 1) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main'), {
      mode: 'admin_setup'
    });
  };

  const startRound = async () => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main'), {
      mode: selectedType === 'yn' ? 'yn' : selectedType === 'dare' ? 'dare' : 'question',
      currentTurnIndex: 0,
      questionStreak: 0,
      answers: {},
      votes: {},
      adminUid: players[0].uid,
      currentChallengeId: await getNextChallengeId(selectedType === 'yn' ? 'YN' : selectedType.toUpperCase())
    });
  };

  const submitAnswer = async (val) => {
    if (!user) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main'), {
      [`answers.${user.uid}`]: val
    });
    setInputAnswer('');
  };

  const submitVote = async (vote) => {
    if (!user) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main'), {
      [`votes.${user.uid}`]: vote
    });
  };

  const nextTurn = async () => {
    const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main');
    let updates = {};
    if (gameState?.mode === 'question') {
      const currentUid = players[gameState?.currentTurnIndex]?.uid;
      const likeVotes = Object.values(gameState?.votes || {}).filter(v => v === 'like').length;
      const points = gameState?.points || {};
      points[currentUid] = (points[currentUid] || 0) + likeVotes;
      updates.points = points;

      const nextTurnIndex = gameState.currentTurnIndex + 1;
      if (nextTurnIndex < players.length) {
        updates = { currentTurnIndex: nextTurnIndex, votes: {}, answers: {} };
      } else {
        updates = { mode: 'admin_setup', currentTurnIndex: 0, answers: {}, votes: {} };
      }
    } else if (gameState?.mode === 'dare') {
      // Compute points
      const currentUid = players[gameState?.currentTurnIndex]?.uid;
      const likeVotes = Object.values(gameState?.votes || {}).filter(v => v === 'like').length;
      const points = gameState?.points || {};
      points[currentUid] = (points[currentUid] || 0) + likeVotes;
      updates.points = points;

      const nextTurnIndex = gameState.currentTurnIndex + 1;
      if (nextTurnIndex < players.length) {
        updates = { currentTurnIndex: nextTurnIndex, votes: {} };
      } else {
        updates = { mode: 'admin_setup', currentTurnIndex: 0, answers: {}, votes: {} };
      }
    } else if (gameState?.mode === 'yn') {
      // Compute points for pairs
      const points = gameState?.points || {};
      Object.keys(gameState?.pairs || {}).forEach(uid1 => {
        const uid2 = gameState.pairs[uid1];
        const ans1 = gameState.answers[uid1];
        const ans2 = gameState.answers[uid2];
        const type = currentCard()?.type;
        let match = false;
        if (type === 'direct') {
          match = ans1 === ans2;
        } else if (type === 'inverse') {
          match = ans1 !== ans2;
        }
        if (match) {
          points[uid1] = (points[uid1] || 0) + 1;
          points[uid2] = (points[uid2] || 0) + 1;
        }
      });
      updates.points = points;
      updates = { mode: 'admin_setup', currentTurnIndex: 0, answers: {}, votes: {} };
    }
    updates.currentChallengeId = await getNextChallengeId(selectedType === 'yn' ? 'YN' : selectedType.toUpperCase());
    await updateDoc(gameRef, updates);
  };

  const getNextChallengeId = async (type) => {
    let ref = collection(db, 'artifacts', appId, 'public', 'data', 'challenges');
    if (type === 'YN') ref = collection(db, 'artifacts', appId, 'public', 'data', 'pairChallenges');
    let q = query(ref, where('answered', '==', false), where('level', '==', selectedLevel));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const challenge = snapshot.docs[Math.floor(Math.random() * snapshot.size)];
    await updateDoc(challenge.ref, { answered: true });
    return challenge.id;
  };

  const handleUploadCsv = async (e, collectionName) => {
    const file = e.target.files[0];
    if (!file) return;

    // Delete existing in the collection
    const ref = collection(db, 'artifacts', appId, 'public', 'data', collectionName);
    const snapshot = await getDocs(ref);
    for (const d of snapshot.docs) {
      await deleteDoc(d.ref);
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const csv = event.target.result;
      const lines = csv.split('\n').slice(1); // skip header
      for (const line of lines) {
        if (!line.trim()) continue;
        const [level, male, female, type, answered] = line.split(',');
        await addDoc(ref, {
          level: level.trim(),
          male: male.trim(),
          female: female.trim(),
          type: type.trim(),
          answered: answered.trim() === 'T'
        });
      }
      alert('Upload completed');
    };
    reader.readAsText(file);
  };

  const handleUploadPairCsv = (e) => handleUploadCsv(e, 'pairChallenges');

  const handleEndGame = async () => {
    if (!window.confirm('Are you sure? End game and show results.')) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main'), {
      mode: 'ended'
    });
  };

  const handleRestart = async () => {
    if (!window.confirm('Are you sure? Delete all players and restart game.')) return;

    const playersRef = collection(db, 'artifacts', appId, 'public', 'data', 'players');
    const snapshot = await getDocs(playersRef);
    for (const d of snapshot.docs) {
      await deleteDoc(d.ref);
    }

    const challengesRef = collection(db, 'artifacts', appId, 'public', 'data', 'challenges');
    const cSnapshot = await getDocs(challengesRef);
    for (const d of cSnapshot.docs) {
      await updateDoc(d.ref, { answered: false });
    }

    const pairChallengesRef = collection(db, 'artifacts', appId, 'public', 'data', 'pairChallenges');
    const pcSnapshot = await getDocs(pairChallengesRef);
    for (const d of pcSnapshot.docs) {
      await updateDoc(d.ref, { answered: false });
    }

    const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main');
    await updateDoc(gameRef, {
      mode: 'lobby',
      currentTurnIndex: 0,
      questionStreak: 0,
      answers: {},
      votes: {},
      points: {},
      code: '',
      timestamp: serverTimestamp(),
      adminUid: null
    });
  };

  // Helpers
  const currentPlayerName = () => gameState && players.length > 0 ? players[gameState?.currentTurnIndex]?.name : 'Nobody';
  const currentCard = () => {
    if (!gameState || !gameState?.currentChallengeId) return null;
    return challenges.find(c => c.id === gameState?.currentChallengeId);
  };
  const isJoined = players.some(p => p.uid === user?.uid) || isAdmin;
  const isMyTurn = () => gameState && players[gameState?.currentTurnIndex]?.uid === user?.uid;
  const isGameAdmin = () => gameState?.adminUid === user?.uid;
  const votes = gameState?.votes || {};
  const allAnswered = Object.keys(gameState?.answers || {}).length >= players.length;
  const showDareText = gameState?.mode === 'dare' ? isMyTurn() : true;
  const playerAnswered = gameState?.answers && gameState?.answers[user.uid];
  const allVoted = Object.keys(gameState?.votes || {}).length >= (players.length - 1);
  const yesCount = Object.values(gameState?.votes || {}).filter(v => v === 'yes').length;
  const noCount = (players.length - 1) - yesCount;
  const passed = yesCount >= noCount;
  const currentUid = players[gameState?.currentTurnIndex]?.uid;
  const canVote = gameState?.mode === 'dare' && !isMyTurn() && !votes[user.uid] && !isAdmin;

  // RENDER
  if (loading) return <div className="h-screen bg-slate-900 text-white flex items-center justify-center">Loading...</div>;

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white">
        <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl border border-purple-500/30 text-center">
          <Flame className="w-16 h-16 text-purple-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold mb-2">Truth & Dare</h1>
          <input 
            type="text" placeholder="Your name... (or 'admin')" 
            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4"
            value={userName} onChange={e => setUserName(e.target.value)}
          />
          <select 
            value={gender} 
            onChange={e => setGender(e.target.value)} 
            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
          <input 
            type="number" placeholder="Couple number" 
            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4"
            value={coupleNumber} onChange={e => setCoupleNumber(e.target.value)}
          />
          {userName.toLowerCase() !== 'admin' && (
            <input 
              type="text" placeholder="Game code" 
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4"
              value={code} onChange={e => setCode(e.target.value)}
            />
          )}
          <button onClick={joinGame} disabled={!userName.trim()} className="w-full bg-purple-600 p-3 rounded-lg font-bold">Enter</button>
        </div>
      </div>
    );
  }

  if (gameState?.mode === 'ended') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
        <Trophy className="w-20 h-20 text-yellow-500 mb-6" />
        <h2 className="text-2xl font-bold mb-4">Game Ended</h2>
        <div className="bg-slate-800 p-4 rounded-xl w-full max-w-sm mb-6">
          {players.map(p => <div key={p.uid} className="py-1 flex justify-between">{p.name} ({p.gender[0].toUpperCase()}): {gameState?.points[p.uid] || 0} points</div>)}
        </div>
        {isAdmin && <button onClick={handleRestart} className="w-full max-w-sm bg-red-600 p-4 rounded-xl font-bold mt-4">Restart Game</button>}
      </div>
    );
  }

  if (isAdmin) {
    if (!gameState || gameState?.mode === 'lobby') {
      return (
        <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
          <Trophy className="w-20 h-20 text-yellow-500 mb-6" />
          <h2 className="text-2xl font-bold mb-4">Admin: Lobby ({players.length})</h2>
          <div className="bg-slate-800 p-4 rounded-xl w-full max-w-sm mb-6">
            {players.map(p => <div key={p.uid} className="py-1">{p.name} ({p.gender[0].toUpperCase()})</div>)}
          </div>
          <input 
            type="text" placeholder="Game code" 
            className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4"
            value={code} onChange={e => setCode(e.target.value)}
          />
          <button onClick={setGameCode} disabled={!code.trim()} className="w-full max-w-sm bg-blue-600 p-4 rounded-xl font-bold mb-4">Set Code</button>
          <label className="w-full max-w-sm bg-blue-600 p-4 rounded-xl font-bold mb-4 flex justify-center items-center cursor-pointer">
            <Upload className="mr-2" /> Upload Truth/Dare CSV
            <input type="file" accept=".csv" onChange={(e) => handleUploadCsv(e, 'challenges')} className="hidden" />
          </label>
          <label className="w-full max-w-sm bg-blue-600 p-4 rounded-xl font-bold mb-4 flex justify-center items-center cursor-pointer">
            <Upload className="mr-2" /> Upload Y/N CSV
            <input type="file" accept=".csv" onChange={handleUploadPairCsv} className="hidden" />
          </label>
          <button onClick={startGame} className="w-full max-w-sm bg-green-600 p-4 rounded-xl font-bold">Start Game</button>
          <button onClick={handleRestart} className="w-full max-w-sm bg-red-600 p-4 rounded-xl font-bold mt-4">Restart Game</button>
        </div>
      );
    }

    if (gameState?.mode === 'admin_setup') {
      return (
        <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
          <h2 className="text-2xl font-bold mb-4">Setup Round</h2>
          <select 
            value={selectedType} 
            onChange={e => setSelectedType(e.target.value)} 
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4"
          >
            <option value="">Select Type</option>
            <option value="truth">Truth</option>
            <option value="dare">Dare</option>
            <option value="yn">Y/N</option>
          </select>
          <select 
            value={selectedLevel} 
            onChange={e => setSelectedLevel(e.target.value)} 
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4"
          >
            <option value="">Select Level</option>
            {uniqueLevels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <button onClick={startRound} disabled={!selectedType || !selectedLevel} className="w-full max-w-md bg-green-600 p-4 rounded-xl font-bold">Start Round</button>
        </div>
      );
    }

    const card = currentCard();
    const answers = gameState?.answers || {};
    const allAnswered = Object.keys(answers).length >= players.length;

    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2 font-bold text-lg"><Zap className="text-yellow-400"/> {gameState?.mode === 'question' ? 'Truth' : 'Dare'} (Admin)</div>
          <div className="text-sm text-slate-400">Turn: {currentPlayerName()}</div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center">
          <div className={`w-full max-w-md p-8 rounded-2xl border-2 text-center mb-8 ${gameState?.mode === 'question' ? 'border-indigo-500 bg-indigo-900/20' : 'border-pink-500 bg-pink-900/20'}`}>
            {gameState?.mode === 'question' ? <RefreshCw className="w-12 h-12 text-indigo-400 mx-auto mb-4"/> : <Flame className="w-12 h-12 text-pink-400 mx-auto mb-4"/>}
            <h3 className="text-2xl font-bold">{card ? card.text : 'Loading...'}</h3>
          </div>

          <div className="w-full max-w-md bg-slate-800 p-4 rounded-xl mb-4">
            <h4 className="font-bold mb-2">Answers/Votes:</h4>
            {players.map(p => (
              <div key={p.uid} className="flex justify-between py-1 border-b border-slate-700">
                <span>{p.name} ({p.gender[0].toUpperCase()})</span>
                <span className="font-bold">{gameState?.mode === 'question' ? (answers[p.uid] || 'Pending') : (votes[p.uid] || 'Pending')}</span>
              </div>
            ))}
          </div>

          <select 
            value={selectedLevel} 
            onChange={e => setSelectedLevel(e.target.value)} 
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4"
          >
            <option value="">Select Level</option>
            {uniqueLevels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          <button onClick={nextTurn} disabled={!selectedLevel} className="w-full max-w-md bg-indigo-600 p-3 rounded-lg font-bold">
            Next {allAnswered || allVoted ? '' : '(Force)'}
          </button>
          <button onClick={handleEndGame} className="w-full max-w-md bg-red-600 p-3 rounded-lg font-bold mt-4">End Game</button>
          <button onClick={handleRestart} className="w-full max-w-md bg-red-600 p-3 rounded-lg font-bold mt-4">Restart Game</button>
        </div>
      </div>
    );
  }

  if (gameState && gameState?.mode === 'lobby') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
        <Trophy className="w-20 h-20 text-yellow-500 mb-6" />
        <h2 className="text-2xl font-bold mb-4">Lobby ({players.length})</h2>
        <div className="bg-slate-800 p-4 rounded-xl w-full max-w-sm mb-6">
          {players.map(p => <div key={p.uid} className="py-1">{p.name} ({p.gender[0].toUpperCase()})</div>)}
        </div>
        <p className="text-center text-slate-400">Waiting for admin to start game...</p>
        {isGameAdmin() && <button onClick={startGame} className="w-full max-w-sm bg-green-600 p-4 rounded-xl font-bold">Start Game</button>}
      </div>
    );
  }

  if (gameState?.mode === 'admin_setup') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-4">Waiting for Admin Setup</h2>
      </div>
    );
  }

  const card = currentCard();
  const playerVoted = votes[user.uid];

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2 font-bold text-lg"><Zap className="text-yellow-400"/> {gameState?.mode === 'question' ? 'Truth' : 'Dare'}</div>
        <div className="text-sm text-slate-400">Turn: {currentPlayerName()}</div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        {showDareText ? (
          <div className={`w-full max-w-md p-8 rounded-2xl border-2 text-center mb-8 ${gameState?.mode === 'question' ? 'border-indigo-500 bg-indigo-900/20' : 'border-pink-500 bg-pink-900/20'}`}>
            {gameState?.mode === 'question' ? <RefreshCw className="w-12 h-12 text-indigo-400 mx-auto mb-4"/> : <Flame className="w-12 h-12 text-pink-400 mx-auto mb-4"/>}
            <h3 className="text-2xl font-bold">{card ? card.text : 'Loading...'}</h3>
          </div>
        ) : (
          <div className="w-full max-w-md p-8 rounded-2xl border-2 text-center mb-8 border-pink-500 bg-pink-900/20">
            <Flame className="w-12 h-12 text-pink-400 mx-auto mb-4"/>
            <h3 className="text-2xl font-bold">Waiting for {currentPlayerName()} to complete dare...</h3>
          </div>
        )}

        <div className="w-full max-w-md">
          {gameState?.mode === 'question' && isMyTurn() && !playerAnswered && (
            <button onClick={() => submitAnswer('answered')} className="w-full bg-purple-600 p-4 rounded-xl font-bold">Answered</button>
          )}
          
          {gameState?.mode === 'question' && playerAnswered && !allVoted && (
            <div className="text-center text-slate-400">Waiting for votes...</div>
          )}

          {gameState?.mode === 'question' && !isMyTurn() && !playerVoted && (
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => submitVote('like')} className="bg-green-600 p-4 rounded-xl font-bold flex items-center justify-center"><ThumbsUp className="mr-2" /> Like</button>
              <button onClick={() => submitVote('no like')} className="bg-red-600 p-4 rounded-xl font-bold flex items-center justify-center"><ThumbsDown className="mr-2" /> No Like</button>
            </div>
          )}

          {gameState?.mode === 'question' && allVoted && (
            <div className="bg-slate-800 p-4 rounded-xl mb-4">
              <h4 className="font-bold mb-2">Results:</h4>
              {players.map(p => <div key={p.uid} className="flex justify-between py-1 border-b border-slate-700"><span>{p.name} ({p.gender[0].toUpperCase()})</span><span className="font-bold">{gameState?.votes[p.uid]}</span></div>)}
              <p className="text-center text-slate-400">Waiting for admin...</p>
            </div>
          )}

          {gameState?.mode === 'dare' && !isMyTurn() && !playerVoted && (
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => submitVote('like')} className="bg-green-600 p-4 rounded-xl font-bold flex items-center justify-center"><ThumbsUp className="mr-2" /> Like</button>
              <button onClick={() => submitVote('no like')} className="bg-red-600 p-4 rounded-xl font-bold flex items-center justify-center"><ThumbsDown className="mr-2" /> No Like</button>
            </div>
          )}

          {gameState?.mode === 'dare' && playerVoted && !allVoted && (
            <div className="text-center text-slate-400">Waiting for votes...</div>
          )}

          {gameState?.mode === 'dare' && allVoted && (
            <div className="text-center mb-4">
              <p className="text-center text-slate-400">Waiting for admin...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}