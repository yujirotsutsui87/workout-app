import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
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
  CloudOff,
  Loader2,
  Download,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  User,
  Info
} from 'lucide-react';

// --- Firebase インポート ---
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

// --- Firebase 設定の安全な初期化 ---
const getInitialConfig = () => {
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
  } catch (e) {
    // プレビュー環境用フォールバック
  }
  return config;
};

const firebaseConfig = getInitialConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'workout-app-pro';

// --- 定数 ---
const INITIAL_EXERCISES = ["ベンチプレス", "スクワット", "デッドリフト", "ショルダープレス"];

// --- ヘルパー関数 ---
const calculate1RM = (w, r) => {
  if (!w || !r) return 0;
  return Math.round(w * (1 + r / 30) * 10) / 10;
};

const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

const getTodayString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const App = () => {
  // --- 状態管理 ---
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [exercises, setExercises] = useState(INITIAL_EXERCISES);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState('record');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // --- フォーム状態 ---
  const [recordDate, setRecordDate] = useState(getTodayString());
  const [selectedExercise, setSelectedExercise] = useState(INITIAL_EXERCISES[0]);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [newExerciseName, setNewExerciseName] = useState("");
  const [showAddExercise, setShowAddExercise] = useState(false);

  // --- モーダル状態 ---
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importStatus, setImportStatus] = useState('idle');
  const [importResult, setImportResult] = useState({ success: 0, error: 0 });
  const fileInputRef = useRef(null);

  // 1. 認証 (ルール3遵守)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth failed:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. データ同期 (ルール1, 2遵守)
  useEffect(() => {
    if (!user) return;
    setIsLoadingData(true);

    const logsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'logs');
    const qLogs = query(logsRef, orderBy('date', 'desc'));

    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      const fetchedLogs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLogs(fetchedLogs);
      setIsLoadingData(false);
    }, (error) => {
      console.error("Logs error:", error);
      setIsLoadingData(false);
    });

    const settingsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'settings');
    const unsubscribeSettings = onSnapshot(settingsRef, (snapshot) => {
      const configDoc = snapshot.docs.find(d => d.id === 'config');
      if (configDoc && configDoc.data().customExercises) {
        setExercises(Array.from(new Set([...INITIAL_EXERCISES, ...configDoc.data().customExercises])));
      }
    });

    return () => {
      unsubscribeLogs();
      unsubscribeSettings();
    };
  }, [user]);

  // --- アクション ---
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
      setWeight("");
      setReps("");
      setActiveTab('history');
    } catch (e) {
      console.error("Save error:", e);
    }
  };

  const handleAddExercise = async () => {
    if (newExerciseName && !exercises.includes(newExerciseName) && user) {
      const customOnes = exercises.filter(e => !INITIAL_EXERCISES.includes(e));
      const newCustomList = [...customOnes, newExerciseName];
      try {
        const configRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'config');
        await setDoc(configRef, { customExercises: newCustomList }, { merge: true });
        setSelectedExercise(newExerciseName);
        setNewExerciseName("");
        setShowAddExercise(false);
      } catch (e) {
        console.error("Settings update error:", e);
      }
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'logs', deleteTarget.id));
    } catch (e) {
      console.error("Delete error:", e);
    }
    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  const handleExportCSV = () => {
    if (logs.length === 0) return;
    const headers = ["日付", "種目", "重量(kg)", "回数", "推定1RM(kg)"];
    const csvContent = [
      headers.join(","),
      ...logs.map(log => [formatDate(log.date), log.exercise, log.weight, log.reps, log.oneRM].join(","))
    ].join("\n");
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `workout_logs_${getTodayString()}.csv`;
    link.click();
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setImportFile(file);
      setImportStatus('idle');
      setShowImportModal(true);
      event.target.value = '';
    }
  };

  const executeImport = async () => {
    if (!importFile || !user) return;
    setImportStatus('processing');
    const reader = new FileReader();
    reader.onload = async (e) => {
      const lines = e.target.result.split('\n');
      let success = 0, error = 0;
      try {
        for (const line of lines.slice(1)) {
          const cols = line.trim().split(',');
          if (cols.length < 4) continue;
          const [d, ex, w, r] = cols;
          if (!isNaN(parseFloat(w)) && !isNaN(parseInt(r))) {
            await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'logs'), {
              date: new Date(d).toISOString(),
              exercise: ex.trim(),
              weight: parseFloat(w),
              reps: parseInt(r),
              oneRM: calculate1RM(parseFloat(w), parseInt(r)),
              createdAt: serverTimestamp()
            });
            success++;
          } else { error++; }
        }
        setImportResult({ success, error });
        setImportStatus('done');
      } catch (err) { setImportStatus('error'); }
    };
    reader.readAsText(importFile);
  };

  // --- 派生状態 ---
  const groupedLogs = useMemo(() => {
    const groups = {};
    logs.forEach(log => {
      const d = formatDate(log.date);
      if (!groups[d]) groups[d] = [];
      groups[d].push(log);
    });
    return groups;
  }, [logs]);

  const chartData = useMemo(() => {
    const filtered = logs
      .filter(log => log.exercise === selectedExercise)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const dailyMax = {};
    filtered.forEach(log => {
      const d = formatDate(log.date);
      if (!dailyMax[d] || log.oneRM > dailyMax[d].oneRM) {
        dailyMax[d] = { date: d.split('/').slice(1).join('/'), oneRM: log.oneRM };
      }
    });
    return Object.values(dailyMax);
  }, [logs, selectedExercise]);

  const trainingDays = useMemo(() => new Set(logs.map(log => formatDate(log.date))), [logs]);

  // --- ビュー表示 ---
  const renderCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const days = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

    return (
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 animate-in fade-in duration-300">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-black flex items-center gap-2"><CalendarIcon className="text-purple-500" size={20}/> カレンダー</h2>
          <div className="flex gap-2 items-center">
            <button onClick={() => setCurrentMonth(new Date(year, month - 1))} className="p-2 bg-gray-50 rounded-lg"><ChevronLeft size={16}/></button>
            <span className="text-sm font-black w-24 text-center">{year}年 {month + 1}月</span>
            <button onClick={() => setCurrentMonth(new Date(year, month + 1))} className="p-2 bg-gray-50 rounded-lg"><ChevronRight size={16}/></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {['日', '月', '火', '水', '木', '金', '土'].map(d => <div key={d} className="text-[10px] font-black text-gray-300 uppercase py-2">{d}</div>)}
          {days.map((day, i) => {
            const dateStr = day ? formatDate(new Date(year, month, day)) : null;
            const trained = dateStr && trainingDays.has(dateStr);
            const isToday = dateStr === formatDate(new Date());
            return (
              <div key={i} className="h-10 flex flex-col items-center justify-center relative">
                {day && (
                  <>
                    <span className={`text-sm font-bold ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>{day}</span>
                    {trained && <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-1"></div>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (isAuthLoading) return <div className="flex h-screen items-center justify-center bg-gray-50"><Loader2 className="animate-spin text-blue-500" size={48} /></div>;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 pb-28 font-sans text-gray-900">
      <header className="p-6 flex justify-between items-center sticky top-0 bg-gray-50/80 backdrop-blur-md z-10">
        <h1 className="text-2xl font-black tracking-tighter text-blue-600">TRAINLOG PRO</h1>
        <button onClick={() => setShowUserModal(true)} className="p-2 bg-white rounded-full shadow-sm border border-gray-100 text-gray-400"><User size={20}/></button>
      </header>

      <main className="px-4 space-y-6">
        {activeTab === 'record' && (
          <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100 space-y-4 animate-in fade-in duration-300">
            <h2 className="text-lg font-black flex items-center gap-2 text-gray-800"><Dumbbell className="text-blue-500" size={20} /> 今日の記録</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <input type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-bold border-none" />
                <div className="flex gap-2">
                  <select value={selectedExercise} onChange={e => setSelectedExercise(e.target.value)} className="flex-1 p-4 bg-gray-50 rounded-2xl outline-none font-bold border-none">
                    {exercises.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                  </select>
                  <button onClick={() => setShowAddExercise(!showAddExercise)} className="p-4 bg-gray-100 rounded-2xl">{showAddExercise ? <X size={20}/> : <Plus size={20}/>}</button>
                </div>
              </div>
              {showAddExercise && (
                <div className="flex gap-2 animate-in slide-in-from-top-2">
                  <input type="text" placeholder="新しい種目名" value={newExerciseName} onChange={e => setNewExerciseName(e.target.value)} className="flex-1 p-4 bg-blue-50 rounded-2xl outline-none font-bold border border-blue-100" />
                  <button onClick={handleAddExercise} className="px-6 bg-blue-600 text-white rounded-2xl font-black">追加</button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 ml-2 uppercase tracking-widest">Weight (kg)</label>
                  <input type="number" placeholder="0" value={weight} onChange={e => setWeight(e.target.value)} className="w-full p-5 bg-gray-50 rounded-2xl text-center text-2xl font-black outline-none border-none focus:ring-2 focus:ring-blue-500 transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 ml-2 uppercase tracking-widest">Reps</label>
                  <input type="number" placeholder="0" value={reps} onChange={e => setReps(e.target.value)} className="w-full p-5 bg-gray-50 rounded-2xl text-center text-2xl font-black outline-none border-none focus:ring-2 focus:ring-blue-500 transition-all" />
                </div>
              </div>
              <div className="bg-blue-600 p-5 rounded-2xl flex justify-between items-center text-white shadow-lg shadow-blue-100">
                <div className="flex flex-col"><span className="text-[10px] font-black opacity-70 uppercase tracking-widest">Estimated 1RM</span><span className="text-2xl font-black">{calculate1RM(weight, reps)} kg</span></div>
                <button onClick={handleSaveLog} disabled={!weight || !reps} className="p-4 bg-white/20 rounded-xl hover:bg-white/30 active:scale-95 transition-all"><Save size={24}/></button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex justify-between items-center px-2">
              <h2 className="text-xl font-black flex items-center gap-2"><History className="text-blue-500" size={20} /> トレーニング履歴</h2>
              <div className="flex gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="p-2 bg-white rounded-xl shadow-sm border border-gray-100 text-blue-500"><Upload size={18}/></button>
                <button onClick={handleExportCSV} className="p-2 bg-white rounded-xl shadow-sm border border-gray-100 text-green-500"><Download size={18}/></button>
              </div>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".csv" />
            {logs.length === 0 ? <div className="text-center py-20 bg-white rounded-[32px] border border-dashed text-gray-300 font-black">記録がありません</div> :
              Object.entries(groupedLogs).sort((a,b) => new Date(b[0]) - new Date(a[0])).map(([date, items]) => (
                <div key={date} className="space-y-2">
                  <h3 className="text-[10px] font-black text-gray-300 uppercase tracking-widest px-2">{date}</h3>
                  {items.map(log => (
                    <div key={log.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-50 flex justify-between items-center">
                      <div><div className="font-black text-gray-800">{log.exercise}</div><div className="text-xs font-bold text-gray-400">{log.weight}kg × {log.reps}回 (1RM: {log.oneRM}kg)</div></div>
                      <button onClick={() => {setDeleteTarget(log); setShowDeleteModal(true)}} className="p-2 text-gray-100 hover:text-red-500"><Trash2 size={18}/></button>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100">
              <h2 className="text-lg font-black mb-4 flex items-center gap-2 text-gray-800"><TrendingUp className="text-green-500" size={20} /> 進捗グラフ</h2>
              <select value={selectedExercise} onChange={e => setSelectedExercise(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl outline-none font-bold border-none mb-6">
                {exercises.map(ex => <option key={ex} value={ex}>{ex}</option>)}
              </select>
              <div className="h-56 w-full">
                {chartData.length < 2 ? <div className="h-full flex items-center justify-center text-xs font-black text-gray-300 border-2 border-dashed rounded-3xl">データが不足しています</div> :
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 5, left: -30, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" hide />
                      <YAxis domain={['dataMin - 5', 'dataMax + 5']} hide />
                      <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontWeight: 'black' }} />
                      <Line type="monotone" dataKey="oneRM" stroke="#3b82f6" strokeWidth={4} dot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>}
              </div>
            </div>
            {renderCalendar()}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/90 backdrop-blur-xl border-t border-gray-100 p-4 flex justify-around items-center rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.08)] z-20">
        <NavBtn active={activeTab === 'record'} icon={<Plus size={24}/>} label="記録" onClick={() => setActiveTab('record')} />
        <NavBtn active={activeTab === 'history'} icon={<History size={24}/>} label="履歴" onClick={() => setActiveTab('history')} />
        <NavBtn active={activeTab === 'analytics'} icon={<TrendingUp size={24}/>} label="分析" onClick={() => setActiveTab('analytics')} />
      </nav>

      {/* 削除モーダル */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-xs text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500"><AlertTriangle size={32} /></div>
            <h3 className="font-black text-xl mb-6">削除しますか？</h3>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={confirmDelete} className="py-4 bg-red-500 text-white rounded-2xl font-black shadow-lg shadow-red-100">削除</button>
              <button onClick={() => setShowDeleteModal(false)} className="py-4 bg-gray-100 text-gray-500 rounded-2xl font-black">戻る</button>
            </div>
          </div>
        </div>
      )}

      {/* ユーザー情報モーダル */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-xs shadow-2xl text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-500"><Info size={32}/></div>
            <h3 className="font-black text-xl mb-4">アカウント情報</h3>
            <div className="bg-gray-50 p-3 rounded-xl font-mono text-[10px] break-all text-gray-400 mb-6">{user?.uid}</div>
            <button onClick={() => setShowUserModal(false)} className="w-full py-4 bg-gray-100 rounded-2xl font-black">閉じる</button>
          </div>
        </div>
      )}

      {/* インポートモーダル */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-white rounded-[40px] p-8 w-full max-w-xs text-center shadow-2xl">
            <h3 className="font-black text-xl mb-6">CSVインポート</h3>
            {importStatus === 'idle' ? <button onClick={executeImport} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-100">インポート実行</button> :
             importStatus === 'processing' ? <Loader2 className="animate-spin mx-auto text-blue-500" size={32}/> :
             <div className="space-y-4">
               <div className="p-4 bg-green-50 rounded-2xl text-green-600 font-black text-sm">完了: {importResult.success}件</div>
               <button onClick={() => setShowImportModal(false)} className="w-full py-4 bg-gray-100 rounded-2xl font-black">閉じる</button>
             </div>}
          </div>
        </div>
      )}
    </div>
  );
};

const NavBtn = ({ active, icon, label, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all duration-300 ${active ? 'text-blue-600 scale-110' : 'text-gray-300 hover:text-gray-400'}`}>
    <div className={`p-1 ${active ? 'bg-blue-50 rounded-xl' : ''}`}>{icon}</div>
    <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

export default App;