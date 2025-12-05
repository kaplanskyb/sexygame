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
  CheckCircle2, ArrowRight, Upload, X, Check
} from 'lucide-react';

// --- PEGA TU CONFIGURACIÓN AQUÍ ABAJO ---
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
  const [code, setCode] = useState('');
  const [gameState, setGameState] = useState(null);
  const [players, setPlayers] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [pairChallenges, setPairChallenges] = useState([]);
  const [uniqueLevels, setUniqueLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState('');
  const [loading, setLoading] = useState(true);
  const [inputAnswer, setInputAnswer] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  // 1. Autenticación
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Error Auth:", error);
      }
    };
    initAuth();
    
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      const savedName = localStorage.getItem('td_username');
      if (savedName) setUserName(savedName);
    });
  }, []);

  // 2. Sincronización
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
      setLoading(false);
    });

    // Escuchar Jugadores
    const playersRef = collection(db, 'artifacts', appId, 'public', 'data', 'players');
    const unsubPlayers = onSnapshot(query(playersRef), (snapshot) => {
      const pList = snapshot.docs.map(d => d.data());
      pList.sort((a, b) => (a.joinedAt?.seconds || 0) - (b.joinedAt?.seconds || 0));
      setPlayers(pList);
    });

    // Escuchar Challenges (Truth/Dare)
    const challengesRef = collection(db, 'artifacts', appId, 'public', 'data', 'challenges');
    const unsubChallenges = onSnapshot(query(challengesRef), (snapshot) => {
      const cList = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
      setChallenges(cList);
      const levels = [...new Set(cList.map(c => c.level))];
      setUniqueLevels(levels);
    });

    // Escuchar PairChallenges (Y/N)
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

  // Acciones
  const joinGame = async () => {
    if (!userName.trim() || !user) return;
    localStorage.setItem('td_username', userName);

    if (userName.toLowerCase() === 'admin') {
      setIsAdmin(true);
      return;
    }

    if (!gender || !code) return;

    if (code !== gameState?.code) {
      alert('Código incorrecto');
      return;
    }

    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', user.uid), {
      uid: user.uid, name: userName, gender, joinedAt: serverTimestamp(), isActive: true
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
      mode: 'question', currentTurnIndex: 0, questionStreak: 0, answers: {}, votes: {}, adminUid: players[0].uid
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
      const newStreak = gameState.questionStreak + 1;
      if (newStreak < 3) {
        updates = { questionStreak: newStreak, answers: {}, votes: {} };
      } else {
        updates = { mode: 'dare', questionStreak: 0, currentTurnIndex: 0, answers: {}, votes: {} };
      }
    } else { // dare
      // Compute points
      const currentUid = players[gameState?.currentTurnIndex]?.uid;
      const yesVotes = Object.values(gameState?.votes || {}).filter(v => v === 'yes').length;
      const points = gameState?.points || {};
      points[currentUid] = (points[currentUid] || 0) + yesVotes;
      updates.points = points;

      const nextTurnIndex = gameState.currentTurnIndex + 1;
      if (nextTurnIndex < players.length) {
        updates = { currentTurnIndex: nextTurnIndex, votes: {} };
      } else {
        updates = { mode: 'question', questionStreak: 0, currentTurnIndex: 0, answers: {}, votes: {} };
      }
    }
    updates.currentChallengeId = await getNextChallengeId(gameState?.mode === 'question' ? 'T' : 'D');
    await updateDoc(gameRef, updates);
  };

  const getNextChallengeId = async (type) => {
    let q = query(collection(db, 'artifacts', appId, 'public', 'data', 'challenges'), where('type', '==', type), where('answered', '==', false), where('level', '==', selectedLevel));
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
        const [level, type, text, answered] = line.split(',');
        await addDoc(ref, {
          level: level.trim(),
          type: type.trim(),
          text: text.trim(),
          answered: answered.trim() === 'T'
        });
      }
    };
    reader.readAsText(file);
  };

  const handleUploadPairCsv = (e) => handleUploadCsv(e, 'pairChallenges');

  const handleEndGame = async () => {
    if (!window.confirm('¿Seguro? Terminar el juego y mostrar resultados.')) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main'), {
      mode: 'ended'
    });
  };

  const handleRestart = async () => {
    if (!window.confirm('¿Seguro? Se eliminarán todos los jugadores y se reiniciará el juego.')) return;

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
  const currentPlayerName = () => gameState && players.length > 0 ? players[gameState?.currentTurnIndex]?.name : 'Nadie';
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
  if (loading) return <div className="h-screen bg-slate-900 text-white flex items-center justify-center">Cargando...</div>;

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white">
        <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl border border-purple-500/30 text-center">
          <Flame className="w-16 h-16 text-purple-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold mb-2">Truth & Dare</h1>
          <input 
            type="text" placeholder="Tu nombre... (o 'admin')" 
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
          {userName.toLowerCase() !== 'admin' && (
            <input 
              type="text" placeholder="Código del juego" 
              className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4"
              value={code} onChange={e => setCode(e.target.value)}
            />
          )}
          <button onClick={joinGame} disabled={!userName.trim()} className="w-full bg-purple-600 p-3 rounded-lg font-bold">Entrar</button>
        </div>
      </div>
    );
  }

  if (gameState?.mode === 'ended') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
        <Trophy className="w-20 h-20 text-yellow-500 mb-6" />
        <h2 className="text-2xl font-bold mb-4">Juego Terminado</h2>
        <div className="bg-slate-800 p-4 rounded-xl w-full max-w-sm mb-6">
          {players.map(p => <div key={p.uid} className="py-1 flex justify-between">{p.name} ({p.gender[0].toUpperCase()}): {gameState?.points[p.uid] || 0} puntos</div>)}
        </div>
        {isAdmin && <button onClick={handleRestart} className="w-full max-w-sm bg-red-600 p-4 rounded-xl font-bold mt-4">Reiniciar Juego</button>}
      </div>
    );
  }

  if (isAdmin) {
    if (!gameState || gameState?.mode === 'lobby') {
      return (
        <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
          <Trophy className="w-20 h-20 text-yellow-500 mb-6" />
          <h2 className="text-2xl font-bold mb-4">Admin: Sala de Espera ({players.length})</h2>
          <div className="bg-slate-800 p-4 rounded-xl w-full max-w-sm mb-6">
            {players.map(p => <div key={p.uid} className="py-1">{p.name} ({p.gender[0].toUpperCase()})</div>)}
          </div>
          <input 
            type="text" placeholder="Código del juego" 
            className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4"
            value={code} onChange={e => setCode(e.target.value)}
          />
          <button onClick={setGameCode} disabled={!code.trim()} className="w-full max-w-sm bg-blue-600 p-4 rounded-xl font-bold mb-4">Establecer Código</button>
          <label className="w-full max-w-sm bg-blue-600 p-4 rounded-xl font-bold mb-4 flex justify-center items-center cursor-pointer">
            <Upload className="mr-2" /> Subir CSV Truth/Dare
            <input type="file" accept=".csv" onChange={(e) => handleUploadCsv(e, 'challenges')} className="hidden" />
          </label>
          <label className="w-full max-w-sm bg-blue-600 p-4 rounded-xl font-bold mb-4 flex justify-center items-center cursor-pointer">
            <Upload className="mr-2" /> Subir CSV Y/N
            <input type="file" accept=".csv" onChange={handleUploadPairCsv} className="hidden" />
          </label>
          <button onClick={startGame} className="w-full max-w-sm bg-green-600 p-4 rounded-xl font-bold">¡Empezar Juego!</button>
          <button onClick={handleRestart} className="w-full max-w-sm bg-red-600 p-4 rounded-xl font-bold mt-4">Reiniciar Juego</button>
        </div>
      );
    }

    const card = currentCard();
    const answers = gameState?.answers || {};
    const allAnswered = Object.keys(answers).length >= players.length;

    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2 font-bold text-lg"><Zap className="text-yellow-400"/> {gameState?.mode === 'question' ? 'VERDAD' : 'RETO'} (Admin)</div>
          <div className="text-sm text-slate-400">Turno: {currentPlayerName()}</div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center">
          <div className={`w-full max-w-md p-8 rounded-2xl border-2 text-center mb-8 ${gameState?.mode === 'question' ? 'border-indigo-500 bg-indigo-900/20' : 'border-pink-500 bg-pink-900/20'}`}>
            {gameState?.mode === 'question' ? <RefreshCw className="w-12 h-12 text-indigo-400 mx-auto mb-4"/> : <Flame className="w-12 h-12 text-pink-400 mx-auto mb-4"/>}
            <h3 className="text-2xl font-bold">{card ? card.text : 'Cargando...'}</h3>
          </div>

          <div className="w-full max-w-md bg-slate-800 p-4 rounded-xl mb-4">
            <h4 className="font-bold mb-2">Respuestas/Votos:</h4>
            {players.map(p => (
              <div key={p.uid} className="flex justify-between py-1 border-b border-slate-700">
                <span>{p.name} ({p.gender[0].toUpperCase()})</span>
                <span className="font-bold">{gameState?.mode === 'question' ? (answers[p.uid] || 'Pendiente') : (votes[p.uid] || 'Pendiente')}</span>
              </div>
            ))}
          </div>

          <select 
            value={selectedLevel} 
            onChange={e => setSelectedLevel(e.target.value)} 
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4"
          >
            <option value="">Selecciona Nivel</option>
            {uniqueLevels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          <button onClick={nextTurn} disabled={!selectedLevel} className="w-full max-w-md bg-indigo-600 p-3 rounded-lg font-bold">
            Siguiente {allAnswered || allVoted ? '' : '(Forzar)'}
          </button>
          <button onClick={handleEndGame} className="w-full max-w-md bg-red-600 p-3 rounded-lg font-bold mt-4">Terminar Juego</button>
          <button onClick={handleRestart} className="w-full max-w-md bg-red-600 p-3 rounded-lg font-bold mt-4">Reiniciar Juego</button>
        </div>
      </div>
    );
  }

  if (gameState && gameState?.mode === 'lobby') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
        <Trophy className="w-20 h-20 text-yellow-500 mb-6" />
        <h2 className="text-2xl font-bold mb-4">Sala de Espera ({players.length})</h2>
        <div className="bg-slate-800 p-4 rounded-xl w-full max-w-sm mb-6">
          {players.map(p => <div key={p.uid} className="py-1">{p.name} ({p.gender[0].toUpperCase()})</div>)}
        </div>
        <p className="text-center text-slate-400">Esperando a que el admin inicie el juego...</p>
        {isGameAdmin() && <button onClick={startGame} className="w-full max-w-sm bg-green-600 p-4 rounded-xl font-bold">¡Empezar Juego!</button>}
      </div>
    );
  }

  const card = currentCard();
  const playerVoted = votes[user.uid];

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2 font-bold text-lg"><Zap className="text-yellow-400"/> {gameState?.mode === 'question' ? 'VERDAD' : 'RETO'}</div>
        <div className="text-sm text-slate-400">Turno: {currentPlayerName()}</div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        {showDareText ? (
          <div className={`w-full max-w-md p-8 rounded-2xl border-2 text-center mb-8 ${gameState?.mode === 'question' ? 'border-indigo-500 bg-indigo-900/20' : 'border-pink-500 bg-pink-900/20'}`}>
            {gameState?.mode === 'question' ? <RefreshCw className="w-12 h-12 text-indigo-400 mx-auto mb-4"/> : <Flame className="w-12 h-12 text-pink-400 mx-auto mb-4"/>}
            <h3 className="text-2xl font-bold">{card ? card.text : 'Cargando...'}</h3>
          </div>
        ) : (
          <div className="w-full max-w-md p-8 rounded-2xl border-2 text-center mb-8 border-pink-500 bg-pink-900/20">
            <Flame className="w-12 h-12 text-pink-400 mx-auto mb-4"/>
            <h3 className="text-2xl font-bold">Esperando a {currentPlayerName()} que cumpla el reto...</h3>
          </div>
        )}

        <div className="w-full max-w-md">
          {gameState?.mode === 'question' && !playerAnswered && (
            <div className="flex gap-2">
              <input type="text" value={inputAnswer} onChange={e => setInputAnswer(e.target.value)} className="flex-1 bg-slate-800 border-slate-600 rounded-xl px-4" placeholder="Respuesta..."/>
              <button onClick={() => submitAnswer(inputAnswer)} disabled={!inputAnswer} className="bg-purple-600 p-3 rounded-xl"><CheckCircle2/></button>
            </div>
          )}
          
          {gameState?.mode === 'question' && playerAnswered && !allAnswered && (
            <div className="text-center text-slate-400">Esperando respuestas...</div>
          )}

          {gameState?.mode === 'question' && allAnswered && (
            <div className="bg-slate-800 p-4 rounded-xl mb-4">
              <h4 className="font-bold mb-2">Resultados:</h4>
              {players.map(p => <div key={p.uid} className="flex justify-between py-1 border-b border-slate-700"><span>{p.name} ({p.gender[0].toUpperCase()})</span><span className="font-bold">{gameState?.answers[p.uid]}</span></div>)}
              {isGameAdmin() && <button onClick={nextTurn} className="w-full mt-4 bg-indigo-600 p-3 rounded-lg font-bold">Siguiente</button>}
            </div>
          )}

          {gameState?.mode === 'dare' && canVote && (
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => submitVote('yes')} className="bg-green-600 p-4 rounded-xl font-bold">Pasó</button>
              <button onClick={() => submitVote('no')} className="bg-red-600 p-4 rounded-xl font-bold">No Pasó</button>
            </div>
          )}

          {gameState?.mode === 'dare' && playerVoted && !allVoted && (
            <div className="text-center text-slate-400">Esperando votos...</div>
          )}

          {gameState?.mode === 'dare' && allVoted && (
            <div className="text-center mb-4">
              {passed ? <Check className="w-12 h-12 text-green-500 mx-auto" /> : <X className="w-12 h-12 text-red-500 mx-auto" />}
              <p>{passed ? 'Pasó' : 'No Pasó'}</p>
            </div>
          )}

          {gameState?.mode === 'dare' && (
            <button onClick={nextTurn} className="w-full bg-pink-600 p-4 rounded-xl font-bold flex justify-center gap-2" disabled={!isMyTurn() && !isGameAdmin()}>
              {isMyTurn() || isGameAdmin() ? '¡Reto Cumplido!' : 'Siguiente Turno'} <ArrowRight/>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}