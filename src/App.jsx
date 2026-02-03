import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { 
  Dumbbell, 
  History, 
  TrendingUp, 
  Calendar as CalendarIcon, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Trash2,
  Save,
  AlertTriangle,
  X,
  Clock,
  Cloud,
  Loader2,
  Download,
  Upload,
  User,
  Settings,
  Target
} from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';

// --- Firebase Configuration ---
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined') {
    return JSON.parse(__firebase_config);
  }
  const config = {};
  try {
    const metaEnv = (import.meta && import.meta.env) ? import.meta.env : {};
    config.apiKey = metaEnv.VITE_FIREBASE_API_KEY;
    config.authDomain = metaEnv.VITE_FIREBASE_AUTH_DOMAIN;
    config.projectId = metaEnv.VITE_FIREBASE_PROJECT_ID;
    config.storageBucket = metaEnv.VITE_FIREBASE_STORAGE_BUCKET;
    config.messagingSenderId = metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID;
    config.appId = metaEnv.VITE_FIREBASE_APP_ID;
  } catch (e) {}
  return config;
};

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'workout-app-v3';

// --- Constants ---
const INITIAL_EXERCISES = ["ベンチプレス", "スクワット", "デッドリフト", "ショルダープレス"];

// --- Helpers ---
const calculate1RM = (w, r) => {
  if (!w || !r) return 0;
  return Math.round(w * (1 + r / 30) * 10) / 10;
};

const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const getTodayString = () => new Date().toISOString().split('T')[0];

const App = () => {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [exercises, setExercises] = useState(INITIAL_EXERCISES);
  const [activeTab, setActiveTab] = useState('record');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Form & UI States
  const [recordDate, setRecordDate] = useState(getTodayString());
  const [selectedExercise, setSelectedExercise] = useState(INITIAL_EXERCISES[0]);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [newExerciseName, setNewExerciseName] = useState("");
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const fileInputRef = useRef(null);

  // 1. Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) { console.error(error); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => { setUser(u); setIsAuthLoading(false); });
    return () => unsubscribe();
  }, []);

  // 2. Data Sync
  useEffect(() => {
    if (!user) return;
    const logsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'logs');
    const qLogs = query(logsRef, orderBy('date', 'desc'));
    const unsubscribeLogs = onSnapshot(qLogs, (s) => {
      setLogs(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const settingsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'settings');
    const unsubscribeSettings = onSnapshot(settingsRef, (s) => {
      const config = s.docs.find(d => d.id === 'config');
      if (config?.data().customExercises) {
        setExercises(Array.from(new Set([...INITIAL_EXERCISES, ...config.data().customExercises])));
      }
    });
    return () => { unsubscribeLogs(); unsubscribeSettings(); };
  }, [user]);

  // Actions
  const handleSaveLog = async () => {
    if (!weight || !reps || !user) return;
    const targetDate = new Date(recordDate);
    const now = new Date();
    targetDate.setHours(now.getHours(), now.getMinutes());
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'logs'), {
        date: targetDate.toISOString(),
        exercise: selectedExercise,
        weight: parseFloat(weight),
        reps: parseInt(reps),
        oneRM: calculate1RM(parseFloat(weight), parseInt(reps)),
        createdAt: serverTimestamp()
      });
      setWeight(""); setReps(""); setActiveTab('history');
    } catch (e) { console.error(e); }
  };

  const handleAddExercise = async () => {
    if (newExerciseName && !exercises.includes(newExerciseName) && user) {
      const custom = [...exercises.filter(e => !INITIAL_EXERCISES.includes(e)), newExerciseName];
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'config'), { customExercises: custom }, { merge: true });
      setSelectedExercise(newExerciseName); setNewExerciseName(""); setShowAddExercise(false);
    }
  };

  const confirmDelete = async () => {
    if (deleteTarget && user) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'logs', deleteTarget.id));
      setShowDeleteModal(false); setDeleteTarget(null);
    }
  };

  // Derived
  const trainingDays = useMemo(() => new Set(logs.map(l => formatDate(l.date))), [logs]);
  const chartData = useMemo(() => {
    const dailyMax = {};
    logs.filter(l => l.exercise === selectedExercise)
        .sort((a,b) => new Date(a.date) - new Date(b.date))
        .forEach(l => {
          const d = formatDate(l.date).split('/').slice(1).join('/');
          if (!dailyMax[d] || l.oneRM > dailyMax[d].oneRM) dailyMax[d] = { date: d, oneRM: l.oneRM };
        });
    return Object.values(dailyMax);
  }, [logs, selectedExercise]);

  if (isAuthLoading) return <div className="flex h-screen items-center justify-center bg-white"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex justify-center items-start overflow-x-hidden p-0 sm:p-4">
      <div className="w-full max-w-md bg-white min-h-screen sm:min-h-[90vh] sm:my-4 relative shadow-2xl sm:rounded-[3rem] overflow-hidden flex flex-col">
        
        {/* Header */}
        <header className="px-6 pt-8 pb-4 flex justify-between items-center bg-white z-30">
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-slate-900 leading-none">TRAIN<span className="text-blue-600">LOG</span></h1>
            <p className="text-[10px] font-black text-blue-600/50 mt-1 uppercase tracking-[0.2em]">Premium Edition</p>
          </div>
          <button className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-blue-600 transition-all active:scale-90">
            <User size={20}/>
          </button>
        </header>

        <main className="flex-1 px-6 overflow-y-auto pb-32">
          {/* Record Tab */}
          {activeTab === 'record' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 py-4">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 ml-4 uppercase tracking-widest">Training Date</label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                    <input type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)} className="w-full p-4 pl-12 bg-slate-50 rounded-3xl font-bold border-2 border-transparent focus:border-blue-500/20 focus:bg-white transition-all outline-none text-slate-700" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 ml-4 uppercase tracking-widest">Exercise</label>
                  <div className="flex gap-2">
                    <select value={selectedExercise} onChange={e => setSelectedExercise(e.target.value)} className="flex-1 p-4 bg-slate-50 rounded-3xl font-bold border-2 border-transparent focus:border-blue-500/20 focus:bg-white transition-all outline-none appearance-none text-slate-700">
                      {exercises.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                    </select>
                    <button onClick={() => setShowAddExercise(!showAddExercise)} className="w-14 h-14 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-500 hover:bg-blue-600 hover:text-white transition-all active:scale-90">
                      {showAddExercise ? <X size={24}/> : <Plus size={24}/>}
                    </button>
                  </div>
                </div>

                {showAddExercise && (
                  <div className="flex gap-2 animate-in zoom-in-95 duration-300">
                    <input type="text" placeholder="種目名を入力..." value={newExerciseName} onChange={e => setNewExerciseName(e.target.value)} className="flex-1 p-4 bg-blue-50 rounded-3xl font-bold border-2 border-blue-100 outline-none placeholder:text-blue-300 text-blue-700" />
                    <button onClick={handleAddExercise} className="px-6 bg-blue-600 text-white rounded-3xl font-black shadow-lg shadow-blue-200 active:scale-95 transition-all">追加</button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-5 rounded-[2.5rem] border-2 border-transparent focus-within:border-blue-500/20 focus-within:bg-white transition-all text-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Weight (kg)</label>
                    <input type="number" placeholder="0" value={weight} onChange={e => setWeight(e.target.value)} className="w-full bg-transparent text-center text-4xl font-black outline-none text-slate-800" />
                  </div>
                  <div className="bg-slate-50 p-5 rounded-[2.5rem] border-2 border-transparent focus-within:border-blue-500/20 focus-within:bg-white transition-all text-center">
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Reps</label>
                    <input type="number" placeholder="0" value={reps} onChange={e => setReps(e.target.value)} className="w-full bg-transparent text-center text-4xl font-black outline-none text-slate-800" />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                  <div className="relative z-10">
                    <p className="text-[11px] font-black opacity-50 uppercase tracking-[0.3em] mb-2">Maximum Strength</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-black tabular-nums">{calculate1RM(weight, reps)}</span>
                      <span className="text-xl font-bold opacity-70">kg</span>
                    </div>
                    <p className="text-[10px] font-bold opacity-30 mt-2 uppercase">Estimated 1RM (Epley Formula)</p>
                  </div>
                  <button 
                    onClick={handleSaveLog} 
                    disabled={!weight || !reps} 
                    className="absolute right-6 bottom-6 w-16 h-16 bg-blue-600 hover:bg-blue-500 rounded-3xl flex items-center justify-center shadow-xl shadow-blue-600/30 transition-all active:scale-90 disabled:opacity-20 disabled:grayscale"
                  >
                    <Save size={28}/>
                  </button>
                  <Dumbbell className="absolute -left-4 -bottom-4 text-white/5 rotate-12" size={120}/>
                </div>
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 py-4">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black text-slate-900">Training History</h2>
                <div className="flex gap-2">
                  <button className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-blue-600"><Download size={18}/></button>
                </div>
              </div>
              
              {logs.length === 0 ? (
                <div className="py-24 text-center">
                  <div className="w-20 h-20 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 text-slate-200">
                    <History size={32}/>
                  </div>
                  <p className="text-slate-300 font-black uppercase tracking-widest text-xs">No entries found</p>
                </div>
              ) : (
                Object.entries(logs.reduce((acc, l) => {
                  const d = formatDate(l.date);
                  if(!acc[d]) acc[d] = [];
                  acc[d].push(l);
                  return acc;
                }, {})).sort((a,b) => new Date(b[0]) - new Date(a[0])).map(([date, items]) => (
                  <div key={date} className="space-y-3">
                    <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] ml-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                      {date}
                    </h3>
                    <div className="space-y-2">
                      {items.map(l => (
                        <div key={l.id} className="bg-slate-50 p-5 rounded-[2rem] flex justify-between items-center group hover:bg-blue-50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center font-black text-blue-600 shadow-sm">{l.weight}</div>
                            <div>
                              <p className="font-black text-slate-800 leading-tight">{l.exercise}</p>
                              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">{l.reps} Reps • 1RM {l.oneRM}kg</p>
                            </div>
                          </div>
                          <button onClick={() => {setDeleteTarget(l); setShowDeleteModal(true)}} className="p-3 text-slate-200 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 active:scale-90">
                            <Trash2 size={18}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Calendar Tab */}
          {activeTab === 'calendar' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 py-4">
              <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center"><CalendarIcon size={20}/></div>
                    <h2 className="text-xl font-black">{currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月</h2>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center hover:bg-white/20 transition-all"><ChevronLeft size={20}/></button>
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center hover:bg-white/20 transition-all"><ChevronRight size={20}/></button>
                  </div>
                </div>
                
                <div className="grid grid-cols-7 gap-y-4 text-center">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                    <div key={d} className="text-[10px] font-black text-white/30 uppercase tracking-widest">{d}</div>
                  ))}
                  {(() => {
                    const y = currentMonth.getFullYear(), m = currentMonth.getMonth();
                    const first = new Date(y, m, 1).getDay();
                    const days = new Date(y, m + 1, 0).getDate();
                    return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)].map((day, i) => {
                      const dateStr = day ? formatDate(new Date(y, m, day)) : null;
                      const hasTrained = dateStr && trainingDays.has(dateStr);
                      const isToday = dateStr === formatDate(new Date());
                      return (
                        <div key={i} className="flex flex-col items-center justify-center h-12 relative">
                          {day && (
                            <>
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black transition-all ${isToday ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-white hover:bg-white/5'}`}>
                                {day}
                              </div>
                              {hasTrained && <div className="absolute bottom-1 w-1.5 h-1.5 bg-blue-400 rounded-full shadow-[0_0_8px_#3b82f6]"></div>}
                            </>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-50 flex flex-col items-center">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">Monthly Logs</p>
                  <p className="text-3xl font-black text-slate-800">
                    {logs.filter(l => {
                      const d = new Date(l.date);
                      return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
                    }).length}
                  </p>
                </div>
                <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-50 flex flex-col items-center">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2">Total Trained</p>
                  <p className="text-3xl font-black text-blue-600">{trainingDays.size} <span className="text-xs">days</span></p>
                </div>
              </div>
            </div>
          )}

          {/* Stats Tab */}
          {activeTab === 'stats' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 py-4">
              <div className="bg-slate-50 p-8 rounded-[3rem] border-2 border-white shadow-sm">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-xl font-black text-slate-800">Progress</h2>
                  <select value={selectedExercise} onChange={e => setSelectedExercise(e.target.value)} className="bg-white border-none p-2 px-4 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-sm outline-none">
                    {exercises.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                  </select>
                </div>
                
                <div className="h-56 w-full">
                  {chartData.length < 2 ? (
                    <div className="h-full bg-white/50 rounded-[2rem] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300">
                      <TrendingUp size={32} className="mb-2 opacity-20"/>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em]">Add more data</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorRM" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="date" hide />
                        <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
                        <Tooltip contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontWeight: 'black', fontSize: '12px' }} />
                        <Area type="monotone" dataKey="oneRM" stroke="#3b82f6" strokeWidth={5} fillOpacity={1} fill="url(#colorRM)" animationDuration={1500} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-600 p-6 rounded-[2.5rem] text-white">
                  <p className="text-[10px] font-black opacity-50 uppercase tracking-widest mb-1">Personal Best</p>
                  <p className="text-3xl font-black">{chartData.length > 0 ? Math.max(...chartData.map(d => d.oneRM)) : 0} <span className="text-xs font-bold opacity-60 italic">kg</span></p>
                </div>
                <div className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-50 shadow-sm">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Total Logs</p>
                  <p className="text-3xl font-black text-slate-800">{logs.filter(l => l.exercise === selectedExercise).length}</p>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Footer Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-2xl border-t border-slate-100 px-6 pt-4 pb-8 flex justify-around items-end rounded-t-[3.5rem] shadow-[0_-20px_50px_rgba(0,0,0,0.08)] z-40">
          <NavBtn active={activeTab === 'record'} icon={<Plus size={26}/>} label="ADD" onClick={() => setActiveTab('record')} />
          <NavBtn active={activeTab === 'history'} icon={<History size={26}/>} label="LOGS" onClick={() => setActiveTab('history')} />
          <NavBtn active={activeTab === 'calendar'} icon={<CalendarIcon size={26}/>} label="CAL" onClick={() => setActiveTab('calendar')} />
          <NavBtn active={activeTab === 'stats'} icon={<TrendingUp size={26}/>} label="PB" onClick={() => setActiveTab('stats')} />
        </nav>

        {/* Delete Confirmation */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-8 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-[3rem] p-10 w-full max-w-xs text-center shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="w-20 h-20 bg-red-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-red-500">
                <Trash2 size={36}/>
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-2 leading-tight">記録を削除しますか？</h3>
              <p className="text-xs font-bold text-slate-400 mb-8 uppercase tracking-widest">Permanent removal</p>
              <div className="flex flex-col gap-3">
                <button onClick={confirmDelete} className="w-full py-5 bg-red-500 text-white rounded-[1.5rem] font-black shadow-xl shadow-red-200 active:scale-95 transition-all uppercase tracking-widest">Delete</button>
                <button onClick={() => setShowDeleteModal(false)} className="w-full py-5 bg-slate-100 text-slate-400 rounded-[1.5rem] font-black active:scale-95 transition-all uppercase tracking-widest">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const NavBtn = ({ active, icon, label, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-2 transition-all duration-300 group relative ${active ? 'text-blue-600' : 'text-slate-300'}`}>
    <div className={`p-3 transition-all duration-500 rounded-3xl ${active ? 'bg-blue-50 -translate-y-4 shadow-xl shadow-blue-100' : 'hover:bg-slate-50'}`}>
      {icon}
    </div>
    <span className={`text-[9px] font-black tracking-[0.2em] transition-all absolute -bottom-1 ${active ? 'opacity-100' : 'opacity-0'}`}>
      {label}
    </span>
  </button>
);

export default App;