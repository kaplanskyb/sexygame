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
  Flame, Zap, RefreshCw, Trophy, Upload, X, Check, ThumbsUp, ThumbsDown
} from 'lucide-react';

// --- CONFIGURACIÓN FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAw5vlbzCXUa1WDR_YFXyzC6mZ-Dt6cms8",
  authDomain: "sexygame-6e8f3.firebaseapp.com",
  projectId: "sexygame-6e8f3",
  storageBucket: "sexygame-6e8f3.firebasestorage.app",
  messagingSenderId: "474661099120",
  appId: "1:474661099120:web:d594e499ac94200c3146b5"
};

const appId = 'truth-dare-v1';

// Inicializar Firebase
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
  const [uploading, setUploading] = useState(false);

  // 1. Autenticación
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

  // 2. Sincronización de Datos
  useEffect(() => {
    if (!user) return;

    // Escuchar Estado del Juego
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
      // NOTA: No quitamos loading aquí todavía para evitar parpadeos,
      // pero si prefieres, puedes descomentar la siguiente línea:
      // setLoading(false);
    });

    // Escuchar Jugadores
    const playersRef = collection(db, 'artifacts', appId, 'public', 'data', 'players');
    const unsubPlayers = onSnapshot(query(playersRef), (snapshot) => {
      const pList = snapshot.docs.map(d => d.data());
      pList.sort((a, b) => (a.joinedAt?.seconds || 0) - (b.joinedAt?.seconds || 0));
      setPlayers(pList);
    });

    // Escuchar Retos
    const challengesRef = collection(db, 'artifacts', appId, 'public', 'data', 'challenges');
    const unsubChallenges = onSnapshot(query(challengesRef), (snapshot) => {
      const cList = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
      setChallenges(cList);
      const levels = [...new Set(cList.map(c => c.level))];
      setUniqueLevels(levels);
      setLoading(false); // Quitamos loading cuando cargan los retos
    });

    // Escuchar Retos de Pareja
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

  // --- Funciones Auxiliares ---
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
    const challengesRef = collection(db, 'artifacts', appId, 'public', 'data', 'challenges');
    const cSnapshot = await getDocs(challengesRef);
    for (const d of cSnapshot.docs) { await updateDoc(d.ref, { answered: false }); }
    const pairChallengesRef = collection(db, 'artifacts', appId, 'public', 'data', 'pairChallenges');
    const pcSnapshot = await getDocs(pairChallengesRef);
    for (const d of pcSnapshot.docs) { await updateDoc(d.ref, { answered: false }); }
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main'), {
      mode: 'admin_setup'
    });
  };

  const startRound = async () => {
    const id = await getNextChallengeId(selectedType === 'yn' ? 'YN' : selectedType.toUpperCase());
    if (!id) { alert('No more challenges for this level'); return; }
    let updates = {
      mode: selectedType === 'yn' ? 'yn' : selectedType === 'dare' ? 'dare' : 'question',
      currentTurnIndex: 0,
      questionStreak: 0,
      answers: {},
      votes: {},
      adminUid: players[0].uid,
      currentChallengeId: id
    };
    if (selectedType === 'yn') {
        // computePairs logic simplified
        const groups = {};
        const pairs = {};
        players.forEach(p => { if (!groups[p.coupleNumber]) groups[p.coupleNumber] = []; groups[p.coupleNumber].push(p); });
        Object.values(groups).forEach(group => {
          if (group.length === 2) { pairs[group[0].uid] = group[1].uid; pairs[group[1].uid] = group[0].uid; }
        });
        updates.pairs = pairs;
    }
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main'), updates);
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
    const currentUid = players[gameState?.currentTurnIndex]?.uid;
    const likeVotes = Object.values(gameState?.votes || {}).filter(v => v === 'like').length;
    const points = gameState?.points || {};
   
    if (gameState?.mode === 'question' || gameState?.mode === 'dare') {
      points[currentUid] = (points[currentUid] || 0) + likeVotes;
      updates.points = points;
      const nextTurnIndex = gameState.currentTurnIndex + 1;
      if (nextTurnIndex < players.length) {
        updates = { ...updates, currentTurnIndex: nextTurnIndex, votes: {}, answers: {} };
      } else {
        updates = { ...updates, mode: 'admin_setup', currentTurnIndex: 0, answers: {}, votes: {} };
      }
    } else if (gameState?.mode === 'yn') {
      Object.keys(gameState?.pairs || {}).forEach(uid1 => {
        const uid2 = gameState.pairs[uid1];
        const ans1 = gameState.answers[uid1];
        const ans2 = gameState.answers[uid2];
        const type = currentCard()?.type;
        let match = false;
        if (type === 'direct') match = ans1 === ans2;
        else if (type === 'inverse') match = ans1 !== ans2;
        if (match) { points[uid1] = (points[uid1] || 0) + 1; points[uid2] = (points[uid2] || 0) + 1; }
      });
      updates.points = points;
      updates = { ...updates, mode: 'admin_setup', currentTurnIndex: 0, answers: {}, votes: {} };
    }
    updates.currentChallengeId = await getNextChallengeId(selectedType === 'yn' ? 'YN' : selectedType.toUpperCase());
    await updateDoc(gameRef, updates);
  };

  const getNextChallengeId = async (type) => {
    let ref = collection(db, 'artifacts', appId, 'public', 'data', 'challenges');
    let q;
    if (type === 'YN') {
      ref = collection(db, 'artifacts', appId, 'public', 'data', 'pairChallenges');
      q = query(ref, where('answered', '==', false), where('level', '==', selectedLevel));
    } else {
      q = query(ref, where('answered', '==', false), where('level', '==', selectedLevel), where('type', '==', type.toLowerCase()));
    }
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const challenge = snapshot.docs[Math.floor(Math.random() * snapshot.size)];
    await updateDoc(challenge.ref, { answered: true });
    return challenge.id;
  };

  const handleUploadCsv = async (e, collectionName) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const ref = collection(db, 'artifacts', appId, 'public', 'data', collectionName);
      const snapshot = await getDocs(ref);
      for (const d of snapshot.docs) { await deleteDoc(d.ref); }
      const reader = new FileReader();
      reader.onload = async (event) => {
        const csv = event.target.result;
        const lines = csv.split('\n').slice(1);
        for (const line of lines) {
          if (!line.trim()) continue;
          if (collectionName === 'challenges') {
            const [level, typeStr, pregunta, sexo, answered] = line.split(',');
            const typeTrim = typeStr.trim().toUpperCase();
            const type_val = typeTrim === 'T' ? 'truth' : typeTrim === 'D' ? 'dare' : typeTrim.toLowerCase();
            const answered_val = answered.trim().toLowerCase() === 'true';
            await addDoc(ref, { level: level.trim(), type: type_val, pregunta: pregunta.trim(), sexo: sexo.trim().toUpperCase(), answered: answered_val });
          } else if (collectionName === 'pairChallenges') {
            const [level, male, female, type, answered] = line.split(',');
            const answered_val = answered.trim().toLowerCase() === 'true';
            await addDoc(ref, { level: level.trim(), male: male.trim(), female: female.trim(), type: type.trim().toLowerCase(), answered: answered_val });
          }
        }
        alert('Upload completed');
      };
      reader.readAsText(file);
    } catch (error) { console.error('Error:', error); alert('Error: ' + error.message); } finally { setUploading(false); }
  };
  const handleUploadPairCsv = (e) => handleUploadCsv(e, 'pairChallenges');
  const handleEndGame = async () => { if (!window.confirm('Are you sure?')) return; await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main'), { mode: 'ended' }); };
  const handleRestart = async () => {
    if (!window.confirm('Restart game?')) return;
    const playersRef = collection(db, 'artifacts', appId, 'public', 'data', 'players');
    const snapshot = await getDocs(playersRef); for (const d of snapshot.docs) await deleteDoc(d.ref);
    const cRef = collection(db, 'artifacts', appId, 'public', 'data', 'challenges');
    const cSnap = await getDocs(cRef); for (const d of cSnap.docs) await updateDoc(d.ref, { answered: false });
    const pcRef = collection(db, 'artifacts', appId, 'public', 'data', 'pairChallenges');
    const pcSnap = await getDocs(pcRef); for (const d of pcSnap.docs) await updateDoc(d.ref, { answered: false });
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main'), {
      mode: 'lobby', currentTurnIndex: 0, questionStreak: 0, answers: {}, votes: {}, points: {}, code: '', timestamp: serverTimestamp(), adminUid: null
    });
  };

  // --- SOLUCIÓN DEL ERROR ---
  const getChallengeText = (card, gender) => {
    // Si no hay carta cargada, mostramos cargando en vez de romper la app
    if (!card) return 'Loading...';
    if (card.sexo === 'B') return card.pregunta;
    if (card.sexo === 'M' && gender === 'male') return card.pregunta;
    if (card.sexo === 'F' && gender === 'female') return card.pregunta;
    return 'No challenge for this gender';
  };

  const currentPlayer = players.find(p => p.uid === user?.uid);
  const currentPlayerName = () => gameState && players.length > 0 ? players[gameState?.currentTurnIndex]?.name : 'Nobody';
  const currentCard = () => {
    if (!gameState || !gameState?.currentChallengeId) return null;
    if (gameState.mode === 'yn') return pairChallenges.find(c => c.id === gameState?.currentChallengeId);
    return challenges.find(c => c.id === gameState?.currentChallengeId);
  };
  const isJoined = players.some(p => p.uid === user?.uid) || isAdmin;
  const isMyTurn = () => gameState && players[gameState?.currentTurnIndex]?.uid === user?.uid;
  const isGameAdmin = () => gameState?.adminUid === user?.uid;
  const votes = gameState?.votes || {};
  const answers = gameState?.answers || {};
  const allAnswered = Object.keys(answers).length >= players.length;
  const allVoted = Object.keys(votes).length >= (players.length - 1);
  const showDareText = gameState?.mode === 'dare' ? isMyTurn() : true;
  const playerAnswered = answers[user?.uid];
  const playerVoted = votes[user?.uid];

  if (loading) return <div className="h-screen bg-slate-900 text-white flex items-center justify-center">Loading...</div>;

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white">
        <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl border border-purple-500/30 text-center">
          <Flame className="w-16 h-16 text-purple-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold mb-2">Truth & Dare</h1>
          <input type="text" placeholder="Name" className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4" value={userName} onChange={e => setUserName(e.target.value)} />
          <select value={gender} onChange={e => setGender(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4">
            <option value="male">Male</option><option value="female">Female</option>
          </select>
          <input type="number" placeholder="Couple #" className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4" value={coupleNumber} onChange={e => setCoupleNumber(e.target.value)} />
          {userName.toLowerCase() !== 'admin' && <input type="text" placeholder="Code" className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4" value={code} onChange={e => setCode(e.target.value)} />}
          <button onClick={joinGame} disabled={!userName.trim()} className="w-full bg-purple-600 p-3 rounded-lg font-bold">Enter</button>
        </div>
      </div>
    );
  }
 
  if (gameState?.mode === 'ended') return <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center"><h2 className="text-2xl font-bold">Game Ended</h2></div>;

  if (isAdmin) {
    if (!gameState || gameState?.mode === 'lobby') {
      return (
        <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
          <h2 className="text-2xl font-bold mb-4">Admin Lobby ({players.length})</h2>
          <div className="bg-slate-800 p-4 rounded-xl w-full max-w-sm mb-6">{players.map(p => <div key={p.uid}>{p.name}</div>)}</div>
          <input type="text" placeholder="Code" className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 mb-4" value={code} onChange={e => setCode(e.target.value)} />
          <button onClick={setGameCode} className="w-full max-w-sm bg-blue-600 p-4 rounded-xl font-bold mb-4">Set Code</button>
          <label className="w-full max-w-sm bg-blue-600 p-4 rounded-xl font-bold mb-4 flex justify-center cursor-pointer"><Upload className="mr-2" /> Upload TD <input type="file" accept=".csv" onChange={(e) => handleUploadCsv(e, 'challenges')} className="hidden" /></label>
          <label className="w-full max-w-sm bg-blue-600 p-4 rounded-xl font-bold mb-4 flex justify-center cursor-pointer"><Upload className="mr-2" /> Upload YN <input type="file" accept=".csv" onChange={handleUploadPairCsv} className="hidden" /></label>
          <button onClick={startGame} className="w-full max-w-sm bg-green-600 p-4 rounded-xl font-bold">Start Game</button>
        </div>
      );
    }
    if (gameState?.mode === 'admin_setup') {
      return (
        <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
            <h2 className="text-2xl font-bold mb-4">Setup Round</h2>
            <select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 mb-4"><option value="">Type</option><option value="truth">Truth</option><option value="dare">Dare</option><option value="yn">Y/N</option></select>
            <select value={selectedLevel} onChange={e => setSelectedLevel(e.target.value)} className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 mb-4"><option value="">Level</option>{uniqueLevels.map(l => <option key={l} value={l}>{l}</option>)}</select>
            <button onClick={startRound} disabled={!selectedType || !selectedLevel} className="w-full max-w-md bg-green-600 p-4 rounded-xl font-bold">Start Round</button>
        </div>
      );
    }
    const card = currentCard();
    const isQuestionLike = gameState?.mode === 'question' || gameState?.mode === 'yn';
    const currentGender = players[gameState.currentTurnIndex]?.gender;
    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col p-6 items-center">
             <div className="text-xl font-bold mb-4">Admin View: {gameState?.mode}</div>
             <div className={`w-full max-w-md p-8 rounded-2xl border-2 text-center mb-8 ${isQuestionLike ? 'border-indigo-500' : 'border-pink-500'}`}>
                <h3 className="text-2xl font-bold">{gameState?.mode === 'yn' ? `M: ${card?.male} / F: ${card?.female}` : `For ${currentGender}: ${getChallengeText(card, currentGender)}`}</h3>
             </div>
             <button onClick={nextTurn} className="w-full max-w-md bg-indigo-600 p-3 rounded-lg font-bold">Next Turn</button>
             <button onClick={handleEndGame} className="w-full max-w-md bg-red-600 p-3 rounded-lg font-bold mt-4">End Game</button>
        </div>
    );
  }

  if (gameState && gameState?.mode === 'lobby') return <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center"><h2 className="text-2xl font-bold">Lobby ({players.length})</h2><p>Waiting for admin...</p>{isGameAdmin() && <button onClick={startGame} className="mt-4 bg-green-600 p-2 rounded">Start</button>}</div>;
  if (gameState?.mode === 'admin_setup') return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center"><h2>Waiting for Admin Setup...</h2></div>;

  // PLAYER VIEW
  const card = currentCard();
  // PROTECCIÓN AQUÍ TAMBIÉN:
  const challengeText = gameState.mode === 'yn' ? card?.[currentPlayer?.gender] : getChallengeText(card, currentPlayer?.gender);
 
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col p-6">
      <div className="flex justify-between mb-6"><div>{currentPlayer?.name}</div><div>Turn: {currentPlayerName()}</div></div>
      <div className="flex-1 flex flex-col items-center justify-center">
         <div className="w-full max-w-md p-8 rounded-2xl border-2 text-center mb-8 border-indigo-500 bg-indigo-900/20">
            <h3 className="text-2xl font-bold">{challengeText || 'Loading challenge...'}</h3>
         </div>
         {/* Botones simplificados para no saturar el código aquí, la lógica es la misma */}
         {gameState?.mode === 'question' && isMyTurn() && !playerAnswered && <button onClick={() => submitAnswer('answered')} className="w-full bg-purple-600 p-4 rounded-xl font-bold">Done</button>}
         {!isMyTurn() && !playerVoted && (gameState?.mode === 'question' || gameState?.mode === 'dare') && (
             <div className="grid grid-cols-2 gap-4 w-full max-w-md"><button onClick={() => submitVote('like')} className="bg-green-600 p-4 rounded">Like</button><button onClick={() => submitVote('no like')} className="bg-red-600 p-4 rounded">No Like</button></div>
         )}
         {gameState?.mode === 'yn' && !playerAnswered && (
             <div className="grid grid-cols-2 gap-4 w-full max-w-md"><button onClick={() => submitAnswer('yes')} className="bg-green-600 p-4 rounded">Yes</button><button onClick={() => submitAnswer('no')} className="bg-red-600 p-4 rounded">No</button></div>
         )}
         {allVoted && <div className="mt-4">All voted. Waiting for admin.</div>}
      </div>
    </div>
  );
}