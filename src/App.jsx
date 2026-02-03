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
  Settings
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

  // 1. Auth (Rule 3)
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

  // 2. Data Sync (Rules 1 & 2)
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
    <div className="min-h-screen bg-[#F8FAFC] flex justify-center items-start overflow-x-hidden">
      <div className="w-full max-w-md bg-[#F8FAFC] min-h-screen relative shadow-2xl shadow-gray-200">
        
        {/* Header */}
        <header className="px-6 py-8 flex justify-between items-center sticky top-0 bg-[#F8FAFC]/90 backdrop-blur-md z-30">
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-slate-900 leading-none">TRAIN<span className="text-blue-600">LOG</span></h1>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Premium Edition</p>
          </div>
          <div className="flex gap-2">
            <button className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100 text-slate-400 hover:text-blue-600 transition-colors"><Settings size={20}/></button>
          </div>
        </header>

        <main className="px-5 pb-32">
          {/* Record Tab */}
          {activeTab === 'record' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-7 rounded-[40px] shadow-xl shadow-blue-900/5 border border-white">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600"><Dumbbell size={22}/></div>
                  <h2 className="text-xl font-black text-slate-800">記録を追加</h2>
                </div>
                <div className="space-y-5">
                  <div className="group">
                    <label className="text-[10px] font-black text-slate-400 ml-4 mb-1 block uppercase tracking-tighter">Date</label>
                    <input type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)} className="w-full p-4 bg-slate-50 rounded-3xl font-bold border-2 border-transparent focus:border-blue-500/20 focus:bg-white transition-all outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 ml-4 mb-1 block uppercase tracking-tighter">Exercise</label>
                    <div className="flex gap-2">
                      <select value={selectedExercise} onChange={e => setSelectedExercise(e.target.value)} className="flex-1 p-4 bg-slate-50 rounded-3xl font-bold border-2 border-transparent focus:border-blue-500/20 focus:bg-white transition-all outline-none appearance-none">
                        {exercises.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                      </select>
                      <button onClick={() => setShowAddExercise(!showAddExercise)} className="p-4 bg-slate-100 rounded-3xl text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-all">{showAddExercise ? <X size={22}/> : <Plus size={22}/>}</button>
                    </div>
                  </div>
                  {showAddExercise && (
                    <div className="flex gap-2 animate-in slide-in-from-top-4 duration-300">
                      <input type="text" placeholder="新種目名..." value={newExerciseName} onChange={e => setNewExerciseName(e.target.value)} className="flex-1 p-4 bg-blue-50 rounded-3xl font-bold border-2 border-blue-100 outline-none" />
                      <button onClick={handleAddExercise} className="px-6 bg-blue-600 text-white rounded-3xl font-black shadow-lg shadow-blue-200 active:scale-95">追加</button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-[32px] border-2 border-transparent focus-within:border-blue-500/20 focus-within:bg-white transition-all">
                      <label className="text-[10px] font-black text-slate-400 block text-center uppercase mb-1">Weight (kg)</label>
                      <input type="number" placeholder="0" value={weight} onChange={e => setWeight(e.target.value)} className="w-full bg-transparent text-center text-3xl font-black outline-none" />
                    </div>
                    <div className="bg-slate-50 p-4 rounded-[32px] border-2 border-transparent focus-within:border-blue-500/20 focus-within:bg-white transition-all">
                      <label className="text-[10px] font-black text-slate-400 block text-center uppercase mb-1">Reps</label>
                      <input type="number" placeholder="0" value={reps} onChange={e => setReps(e.target.value)} className="w-full bg-transparent text-center text-3xl font-black outline-none" />
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-6 rounded-[32px] text-white shadow-xl shadow-blue-600/20 flex justify-between items-center group overflow-hidden relative">
                    <div className="relative z-10">
                      <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest mb-1">Estimated 1RM</p>
                      <p className="text-4xl font-black">{calculate1RM(weight, reps)} <span className="text-sm font-normal opacity-80">kg</span></p>
                    </div>
                    <button onClick={handleSaveLog} disabled={!weight || !reps} className="relative z-10 w-16 h-16 bg-white/20 hover:bg-white/30 rounded-2xl flex items-center justify-center transition-all active:scale-90 disabled:opacity-30">
                      <Save size={28}/>
                    </button>
                    <div className="absolute -right-4 -bottom-4 text-white/5 rotate-12 group-hover:scale-110 transition-transform"><Dumbbell size={120}/></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-end px-2">
                <h2 className="text-2xl font-black text-slate-800">履歴</h2>
                <div className="flex gap-2">
                  <button onClick={() => fileInputRef.current.click()} className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 text-slate-400"><Upload size={18}/></button>
                  <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={e => {/* CSV Logic */}} />
                </div>
              </div>
              {logs.length === 0 ? (
                <div className="py-20 text-center bg-white rounded-[40px] border-2 border-dashed border-slate-100 text-slate-300 font-bold uppercase tracking-widest">No Records Yet</div>
              ) : (
                Object.entries(logs.reduce((acc, l) => {
                  const d = formatDate(l.date);
                  if(!acc[d]) acc[d] = [];
                  acc[d].push(l);
                  return acc;
                }, {})).sort((a,b) => new Date(b[0]) - new Date(a[0])).map(([date, items]) => (
                  <div key={date} className="space-y-3">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-4">{date}</h3>
                    {items.map(l => (
                      <div key={l.id} className="bg-white p-5 rounded-[28px] shadow-sm border border-slate-50 flex justify-between items-center group">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 font-black text-sm group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">{l.weight}</div>
                          <div>
                            <p className="font-black text-slate-800 leading-tight">{l.exercise}</p>
                            <p className="text-xs text-slate-400 font-bold">{l.reps} reps • 1RM {l.oneRM}kg</p>
                          </div>
                        </div>
                        <button onClick={() => {setDeleteTarget(l); setShowDeleteModal(true)}} className="p-3 text-slate-100 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={18}/></button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Analytics Tab (Dedicated Calendar & Charts) */}
          {activeTab === 'analytics' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Stats Card */}
              <div className="bg-white p-7 rounded-[40px] shadow-xl shadow-blue-900/5">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><TrendingUp className="text-emerald-500" size={20}/> 進捗推移</h2>
                  <select value={selectedExercise} onChange={e => setSelectedExercise(e.target.value)} className="bg-slate-100 p-2 px-4 rounded-xl font-black text-xs outline-none">
                    {exercises.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                  </select>
                </div>
                <div className="h-48 w-full mb-6">
                  {chartData.length < 2 ? <div className="h-full bg-slate-50 rounded-[32px] border-2 border-dashed border-slate-100 flex items-center justify-center text-[10px] font-black text-slate-300 uppercase tracking-widest">More Data Needed</div> :
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorRM" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" hide />
                        <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                        <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px rgba(0,0,0,0.05)', fontWeight: 'black' }} />
                        <Area type="monotone" dataKey="oneRM" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorRM)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  }
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-3xl text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-1">Best 1RM</p>
                    <p className="text-2xl font-black text-blue-600">{chartData.length > 0 ? Math.max(...chartData.map(d => d.oneRM)) : 0}<span className="text-xs ml-1">kg</span></p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-3xl text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter mb-1">Total Sets</p>
                    <p className="text-2xl font-black text-slate-800">{logs.filter(l => l.exercise === selectedExercise).length}<span className="text-xs ml-1">sets</span></p>
                  </div>
                </div>
              </div>

              {/* Calendar Section (Always visible here) */}
              <div className="bg-white p-7 rounded-[40px] shadow-xl shadow-purple-900/5">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><CalendarIcon className="text-purple-500" size={20}/> 実施日カレンダー</h2>
                  <div className="flex gap-1">
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))} className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:text-slate-800"><ChevronLeft size={16}/></button>
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))} className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:text-slate-800"><ChevronRight size={16}/></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => <div key={d} className="text-[10px] font-black text-slate-300 py-2">{d}</div>)}
                  {(() => {
                    const y = currentMonth.getFullYear(), m = currentMonth.getMonth();
                    const first = new Date(y, m, 1).getDay();
                    const days = new Date(y, m + 1, 0).getDate();
                    return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)].map((day, i) => {
                      const dateStr = day ? formatDate(new Date(y, m, day)) : null;
                      const hasTrained = dateStr && trainingDays.has(dateStr);
                      const isToday = dateStr === formatDate(new Date());
                      return (
                        <div key={i} className="h-10 flex flex-col items-center justify-center relative">
                          {day && (
                            <>
                              <span className={`text-xs font-black ${isToday ? 'text-blue-600 bg-blue-50 px-2 py-1 rounded-lg' : 'text-slate-700'}`}>{day}</span>
                              {hasTrained && <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full mt-1 animate-pulse"></div>}
                            </>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/80 backdrop-blur-2xl border-t border-slate-100 px-8 py-5 flex justify-around items-center rounded-t-[44px] shadow-[0_-15px_40px_rgba(0,0,0,0.04)] z-40">
          <NavBtn active={activeTab === 'record'} icon={<Plus size={26}/>} label="RECORD" onClick={() => setActiveTab('record')} />
          <NavBtn active={activeTab === 'history'} icon={<History size={26}/>} label="HISTORY" onClick={() => setActiveTab('history')} />
          <NavBtn active={activeTab === 'analytics'} icon={<TrendingUp size={26}/>} label="STATS" onClick={() => setActiveTab('analytics')} />
        </nav>

        {/* Delete Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-slate-900/60 z-[60] flex items-center justify-center p-8 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[44px] p-10 w-full max-w-xs text-center shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500"><Trash2 size={36}/></div>
              <h3 className="text-2xl font-black text-slate-800 mb-2">削除しますか？</h3>
              <p className="text-sm font-bold text-slate-400 mb-8">この記録をクラウドから完全に消去します。</p>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={confirmDelete} className="py-4 bg-red-500 text-white rounded-[24px] font-black shadow-xl shadow-red-200 active:scale-95 transition-all">削除</button>
                <button onClick={() => setShowDeleteModal(false)} className="py-4 bg-slate-100 text-slate-500 rounded-[24px] font-black active:scale-95 transition-all">戻る</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const NavBtn = ({ active, icon, label, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1.5 transition-all duration-300 relative ${active ? 'text-blue-600 -translate-y-2' : 'text-slate-300 hover:text-slate-400'}`}>
    <div className={`p-2 transition-all ${active ? 'bg-blue-50 rounded-[20px] shadow-sm' : ''}`}>{icon}</div>
    <span className="text-[9px] font-black tracking-widest">{label}</span>
    {active && <div className="absolute -bottom-1 w-1 h-1 bg-blue-600 rounded-full"></div>}
  </button>
);

export default App;