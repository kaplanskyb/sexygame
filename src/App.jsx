import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, setDoc, onSnapshot, 
  query, serverTimestamp, updateDoc
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged 
} from 'firebase/auth';
import { 
  Flame, Zap, RefreshCw, Trophy, 
  CheckCircle2, ArrowRight
} from 'lucide-react';

// --- PEGA TU CONFIGURACIÓN AQUÍ ABAJO ---
const firebaseConfig = {
  // BORRA ESTAS LÍNEAS DE EJEMPLO Y PEGA TUS DATOS DE FIREBASE AQUÍ
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

// --- Datos Estáticos ---
const QUESTIONS = [
  { id: 'q1', text: "¿Cuál es tu fantasía más secreta?", type: 'text' },
  { id: 'q2', text: "¿Alguna vez has mentido sobre tu edad?", type: 'binary' },
  { id: 'q3', text: "¿Qué es lo primero que notas en una persona?", type: 'text' },
  { id: 'q4', text: "¿Has tenido un sueño +18 con alguien presente aquí?", type: 'binary' },
  { id: 'q5', text: "¿Qué es lo más vergonzoso que has hecho por amor?", type: 'text' },
];

const DARES = [
  { id: 'd1', text: "Baila sensualmente durante 1 minuto sin música." },
  { id: 'd2', text: "Deja que el grupo elija una foto vergonzosa para tu estado." },
  { id: 'd3', text: "Haz 20 sentadillas mientras gritas el nombre de tu ex." },
  { id: 'd4', text: "Envía un mensaje de voz cantando a la última persona con la que chateaste." },
  { id: 'd5', text: "Intercambia una prenda de ropa con la persona a tu derecha." },
];

export default function TruthAndDareApp() {
  const [user, setUser] = useState(null);
  const [userName, setUserName] = useState('');
  const [gameState, setGameState] = useState(null);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inputAnswer, setInputAnswer] = useState('');

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
          currentCardIndex: 0,
          answers: {},
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

    return () => {
      unsubGame();
      unsubPlayers();
    };
  }, [user]);

  // Acciones
  const joinGame = async () => {
    if (!userName.trim() || !user) return;
    localStorage.setItem('td_username', userName);
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'players', user.uid), {
      uid: user.uid, name: userName, joinedAt: serverTimestamp(), isActive: true
    });
  };

  const startGame = async () => {
    if (players.length < 1) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main'), {
      mode: 'question', currentTurnIndex: 0, currentCardIndex: 0, answers: {}
    });
  };

  const submitAnswer = async (val) => {
    if (!user) return;
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main'), {
      [`answers.${user.uid}`]: val
    });
    setInputAnswer('');
  };

  const nextTurn = async () => {
    const nextMode = gameState.mode === 'question' ? 'dare' : 'question';
    let nextTurnIndex = gameState.currentTurnIndex;
    let nextCardIndex = (gameState.currentCardIndex + 1);

    if (gameState.mode === 'dare') {
      nextTurnIndex = (gameState.currentTurnIndex + 1) % players.length;
    }

    const updates = { mode: nextMode, currentTurnIndex: nextTurnIndex, currentCardIndex: nextCardIndex };
    if (nextMode === 'question') updates.answers = {};

    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'gameState', 'main'), updates);
  };

  // Helpers
  const currentPlayerName = () => gameState && players.length > 0 ? players[gameState.currentTurnIndex]?.name : 'Nadie';
  const currentCard = () => {
    if (!gameState) return null;
    const list = gameState.mode === 'question' ? QUESTIONS : DARES;
    return list[gameState.currentCardIndex % list.length];
  };
  const isJoined = players.some(p => p.uid === user?.uid);
  const isMyTurn = () => gameState && players[gameState.currentTurnIndex]?.uid === user?.uid;

  // RENDER
  if (loading) return <div className="h-screen bg-slate-900 text-white flex items-center justify-center">Cargando...</div>;

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white">
        <div className="w-full max-w-md bg-slate-800 p-8 rounded-2xl border border-purple-500/30 text-center">
          <Flame className="w-16 h-16 text-purple-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold mb-2">Truth & Dare</h1>
          <input 
            type="text" placeholder="Tu nombre..." 
            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 px-4 text-white mb-4"
            value={userName} onChange={e => setUserName(e.target.value)}
          />
          <button onClick={joinGame} disabled={!userName.trim()} className="w-full bg-purple-600 p-3 rounded-lg font-bold">Entrar</button>
        </div>
      </div>
    );
  }

  if (gameState && gameState.mode === 'lobby') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center">
        <Trophy className="w-20 h-20 text-yellow-500 mb-6" />
        <h2 className="text-2xl font-bold mb-4">Sala de Espera ({players.length})</h2>
        <div className="bg-slate-800 p-4 rounded-xl w-full max-w-sm mb-6">
          {players.map(p => <div key={p.uid} className="py-1">{p.name}</div>)}
        </div>
        <button onClick={startGame} className="w-full max-w-sm bg-green-600 p-4 rounded-xl font-bold">¡Empezar Juego!</button>
      </div>
    );
  }

  const card = currentCard();
  const playerAnswered = gameState.answers && gameState.answers[user.uid];
  const allAnswered = Object.keys(gameState.answers || {}).length >= players.length;

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2 font-bold text-lg"><Zap className="text-yellow-400"/> {gameState.mode === 'question' ? 'VERDAD' : 'RETO'}</div>
        <div className="text-sm text-slate-400">Turno: {currentPlayerName()}</div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className={`w-full max-w-md p-8 rounded-2xl border-2 text-center mb-8 ${gameState.mode === 'question' ? 'border-indigo-500 bg-indigo-900/20' : 'border-pink-500 bg-pink-900/20'}`}>
          {gameState.mode === 'question' ? <RefreshCw className="w-12 h-12 text-indigo-400 mx-auto mb-4"/> : <Flame className="w-12 h-12 text-pink-400 mx-auto mb-4"/>}
          <h3 className="text-2xl font-bold">{card ? card.text : 'Cargando...'}</h3>
        </div>

        <div className="w-full max-w-md">
          {gameState.mode === 'question' && !playerAnswered && (
             card.type === 'binary' ? (
               <div className="grid grid-cols-2 gap-4">
                 <button onClick={() => submitAnswer('Sí')} className="bg-green-600 p-4 rounded-xl font-bold">SÍ</button>
                 <button onClick={() => submitAnswer('No')} className="bg-red-600 p-4 rounded-xl font-bold">NO</button>
               </div>
             ) : (
               <div className="flex gap-2">
                 <input type="text" value={inputAnswer} onChange={e => setInputAnswer(e.target.value)} className="flex-1 bg-slate-800 border-slate-600 rounded-xl px-4" placeholder="Respuesta..."/>
                 <button onClick={() => submitAnswer(inputAnswer)} disabled={!inputAnswer} className="bg-purple-600 p-3 rounded-xl"><CheckCircle2/></button>
               </div>
             )
          )}
          
          {gameState.mode === 'question' && playerAnswered && !allAnswered && (
            <div className="text-center text-slate-400">Esperando respuestas...</div>
          )}

          {gameState.mode === 'question' && allAnswered && (
            <div className="bg-slate-800 p-4 rounded-xl mb-4">
              <h4 className="font-bold mb-2">Resultados:</h4>
              {players.map(p => <div key={p.uid} className="flex justify-between py-1 border-b border-slate-700"><span>{p.name}</span><span className="font-bold">{gameState.answers[p.uid]}</span></div>)}
              <button onClick={nextTurn} className="w-full mt-4 bg-indigo-600 p-3 rounded-lg font-bold">Siguiente</button>
            </div>
          )}

          {gameState.mode === 'dare' && (
            <button onClick={nextTurn} className="w-full bg-pink-600 p-4 rounded-xl font-bold flex justify-center gap-2">
              {isMyTurn() ? '¡Reto Cumplido!' : 'Siguiente Turno'} <ArrowRight/>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}