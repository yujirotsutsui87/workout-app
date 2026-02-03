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
// Canvas環境のグローバル変数 __firebase_config を優先し、
// Vite環境の import.meta.env はエラーにならないよう保護して読み込みます。
const getInitialConfig = () => {
  if (typeof __firebase_config !== 'undefined') {
    return JSON.parse(__firebase_config);
  }
  
  // ローカルの .env ファイルからの読み込みを試みる
  const config = {};
  try {
    // コンパイルエラーを避けるため、動的なアクセスを試みるか
    // または、グローバルオブジェクト経由でのアクセスを想定します。
    // Vite環境では以下が有効になります。
    const metaEnv = (import.meta && import.meta.env) ? import.meta.env : {};
    config.apiKey = metaEnv.VITE_FIREBASE_API_KEY;
    config.authDomain = metaEnv.VITE_FIREBASE_AUTH_DOMAIN;
    config.projectId = metaEnv.VITE_FIREBASE_PROJECT_ID;
    config.storageBucket = metaEnv.VITE_FIREBASE_STORAGE_BUCKET;
    config.messagingSenderId = metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID;
    config.appId = metaEnv.VITE_FIREBASE_APP_ID;
  } catch (e) {
    // プレビュー環境などで import.meta が使えない場合は無視
  }
  return config;
};

const firebaseConfig = getInitialConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'workout-app-pro';

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
  const [exercises, setExercises] = useState(["ベンチプレス", "スクワット", "デッドリフト", "ショルダープレス"]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState('record');
  const [recordDate, setRecordDate] = useState(getTodayString());
  const [selectedExercise, setSelectedExercise] = useState("ベンチプレス");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [newExerciseName, setNewExerciseName] = useState("");
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // 1. 認証 (ルール3: 認証を最優先)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("認証エラー:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. データの同期 (ルール1: artifactsパス構造を使用)
  useEffect(() => {
    if (!user) return;
    setIsLoadingData(true);

    // ログの取得
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
      console.error("Firestore同期エラー:", error);
      setIsLoadingData(false);
    });

    // 設定（種目リスト）の取得
    const settingsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'settings');
    const unsubscribeSettings = onSnapshot(settingsRef, (snapshot) => {
      const configDoc = snapshot.docs.find(d => d.id === 'config');
      if (configDoc && configDoc.data().customExercises) {
        setExercises(prev => Array.from(new Set([...prev, ...configDoc.data().customExercises])));
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
      console.error("保存エラー:", e);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'logs', deleteTarget.id));
    } catch (e) {
      console.error("削除エラー:", e);
    }
    setShowDeleteModal(false);
  };

  const handleAddExercise = async () => {
    if (newExerciseName && !exercises.includes(newExerciseName) && user) {
      const newCustom = [...exercises.filter(ex => !INITIAL_EXERCISES.includes(ex)), newExerciseName];
      try {
        const configRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'config');
        await setDoc(configRef, { customExercises: newCustom }, { merge: true });
        setSelectedExercise(newExerciseName);
        setNewExerciseName("");
        setShowAddExercise(false);
      } catch (e) {
        console.error("種目追加エラー:", e);
      }
    }
  };

  // グラフ用データ
  const chartData = useMemo(() => {
    return logs
      .filter(log => log.exercise === selectedExercise)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(log => ({
        date: formatDate(log.date).split('/').slice(1).join('/'),
        oneRM: log.oneRM
      }));
  }, [logs, selectedExercise]);

  if (isAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-500" size={48} />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen bg-gray-50 pb-24 font-sans text-gray-900">
      <header className="p-6 flex justify-between items-center sticky top-0 bg-gray-50/80 backdrop-blur-md z-10">
        <h1 className="text-2xl font-black tracking-tighter text-blue-600">TRAINLOG PRO</h1>
        <div className="text-[10px] font-bold bg-white px-2 py-1 rounded-full shadow-sm border text-gray-400">
          ID: {user?.uid.slice(0, 8)}...
        </div>
      </header>

      <main className="px-4 space-y-6">
        {/* 記録タブ */}
        {activeTab === 'record' && (
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4 animate-in fade-in duration-300">
            <h2 className="text-lg font-bold flex items-center gap-2 text-gray-800">
              <Dumbbell className="text-blue-500" size={20} /> トレーニングを記録
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 font-bold mb-1 block">日付</label>
                <input 
                  type="date" 
                  value={recordDate} 
                  onChange={e => setRecordDate(e.target.value)} 
                  className="w-full p-3 bg-gray-50 rounded-xl outline-none font-bold border-none focus:ring-2 focus:ring-blue-500 transition-all" 
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 font-bold mb-1 block">種目</label>
                <div className="flex gap-2">
                  <select 
                    value={selectedExercise} 
                    onChange={e => setSelectedExercise(e.target.value)} 
                    className="flex-1 p-3 bg-gray-50 rounded-xl outline-none font-bold border-none focus:ring-2 focus:ring-blue-500"
                  >
                    {exercises.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                  </select>
                  <button 
                    onClick={() => setShowAddExercise(!showAddExercise)}
                    className="p-3 bg-gray-100 rounded-xl text-gray-600 active:scale-95 transition-transform"
                  >
                    {showAddExercise ? <X size={20} /> : <Plus size={20} />}
                  </button>
                </div>
              </div>

              {showAddExercise && (
                <div className="flex gap-2 animate-in slide-in-from-top-2 duration-200">
                  <input 
                    type="text" 
                    placeholder="新しい種目名" 
                    value={newExerciseName} 
                    onChange={e => setNewExerciseName(e.target.value)} 
                    className="flex-1 p-3 bg-blue-50 border border-blue-100 rounded-xl outline-none font-bold" 
                  />
                  <button 
                    onClick={handleAddExercise} 
                    className="px-4 bg-blue-500 text-white rounded-xl font-bold active:scale-95 transition-transform"
                  >
                    追加
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 font-bold mb-1 block">重量 (kg)</label>
                  <input 
                    type="number" 
                    placeholder="0" 
                    value={weight} 
                    onChange={e => setWeight(e.target.value)} 
                    className="w-full p-4 bg-gray-50 rounded-xl text-center text-xl font-bold outline-none border-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-bold mb-1 block">回数 (reps)</label>
                  <input 
                    type="number" 
                    placeholder="0" 
                    value={reps} 
                    onChange={e => setReps(e.target.value)} 
                    className="w-full p-4 bg-gray-50 rounded-xl text-center text-xl font-bold outline-none border-none focus:ring-2 focus:ring-blue-500" 
                  />
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-2xl flex justify-between items-center border border-blue-100">
                <span className="text-blue-600 text-sm font-bold">推定 1RM</span>
                <span className="text-blue-600 font-black text-xl">{calculate1RM(weight, reps)} kg</span>
              </div>

              <button 
                onClick={handleSaveLog} 
                disabled={!weight || !reps}
                className={`w-full py-4 rounded-2xl font-black text-lg shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${
                  !weight || !reps ? 'bg-gray-200 text-gray-400' : 'bg-blue-600 text-white shadow-blue-200'
                }`}
              >
                <Save size={20} /> 保存する
              </button>
            </div>
          </div>
        )}

        {/* 履歴タブ */}
        {activeTab === 'history' && (
          <div className="space-y-3 animate-in fade-in duration-300">
            <h2 className="text-xl font-black px-2 flex items-center gap-2">
              <History className="text-blue-500" size={20} /> トレーニング履歴
            </h2>
            {logs.length === 0 ? (
              <div className="text-center py-20 text-gray-300 bg-white rounded-3xl border border-dashed border-gray-200 font-bold">
                まだ記録がありません
              </div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-50 flex justify-between items-center group">
                  <div>
                    <div className="font-black text-gray-800">{log.exercise}</div>
                    <div className="text-xs text-gray-400 font-bold mt-0.5">
                      {formatDate(log.date)} • {log.weight}kg × {log.reps}回
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400 font-bold leading-none">1RM</div>
                      <div className="text-blue-600 font-black leading-none mt-1">{log.oneRM}kg</div>
                    </div>
                    <button 
                      onClick={() => {setDeleteTarget(log); setShowDeleteModal(true)}} 
                      className="p-2 text-gray-200 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={18}/>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 分析タブ */}
        {activeTab === 'analytics' && (
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 animate-in fade-in duration-300">
            <h2 className="text-lg font-black mb-4 flex items-center gap-2">
              <TrendingUp className="text-green-500" size={20} /> パフォーマンス分析
            </h2>
            <select 
              value={selectedExercise} 
              onChange={e => setSelectedExercise(e.target.value)} 
              className="w-full p-3 mb-6 bg-gray-50 rounded-xl outline-none font-bold border-none"
            >
              {exercises.map(ex => <option key={ex} value={ex}>{ex}</option>)}
            </select>
            
            <div className="h-56 w-full">
              {chartData.length < 2 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm font-bold border-2 border-dashed border-gray-100 rounded-2xl">
                  <p>グラフを表示するには</p>
                  <p>あと {2 - chartData.length} 件以上の記録が必要です</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="oneRM" 
                      stroke="#3b82f6" 
                      strokeWidth={4} 
                      dot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} 
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                <div className="text-[10px] text-blue-400 font-bold uppercase">ベスト 1RM</div>
                <div className="text-xl font-black text-blue-600">
                  {chartData.length > 0 ? Math.max(...chartData.map(d => d.oneRM)) : 0} <span className="text-xs">kg</span>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <div className="text-[10px] text-gray-400 font-bold uppercase">合計セット数</div>
                <div className="text-xl font-black text-gray-800">
                  {logs.filter(l => l.exercise === selectedExercise).length} <span className="text-xs">sets</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 下部ナビゲーション */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/80 backdrop-blur-lg border-t border-gray-100 p-4 flex justify-around items-center rounded-t-[32px] shadow-[0_-8px_30px_rgba(0,0,0,0.05)] z-20">
        <button 
          onClick={() => setActiveTab('record')} 
          className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'record' ? 'text-blue-600 scale-110' : 'text-gray-300'}`}
        >
          <div className={`p-1 ${activeTab === 'record' ? 'bg-blue-50 rounded-xl' : ''}`}><Plus size={24}/></div>
          <span className="text-[10px] font-black">記録</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')} 
          className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'history' ? 'text-blue-600 scale-110' : 'text-gray-300'}`}
        >
          <div className={`p-1 ${activeTab === 'history' ? 'bg-blue-50 rounded-xl' : ''}`}><History size={24}/></div>
          <span className="text-[10px] font-black">履歴</span>
        </button>
        <button 
          onClick={() => setActiveTab('analytics')} 
          className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'analytics' ? 'text-blue-600 scale-110' : 'text-gray-300'}`}
        >
          <div className={`p-1 ${activeTab === 'analytics' ? 'bg-blue-50 rounded-xl' : ''}`}><TrendingUp size={24}/></div>
          <span className="text-[10px] font-black">分析</span>
        </button>
      </nav>

      {/* 削除確認モーダル */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] p-8 w-full max-w-xs text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-red-500" size={32} />
            </div>
            <h3 className="font-black text-xl mb-2 text-gray-800">削除しますか？</h3>
            <p className="text-gray-400 text-sm font-bold mb-6">この操作は取り消せません。</p>
            <div className="flex gap-3">
              <button 
                onClick={confirmDelete} 
                className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-black shadow-lg shadow-red-100 active:scale-95 transition-all"
              >
                削除
              </button>
              <button 
                onClick={() => setShowDeleteModal(false)} 
                className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-2xl font-black active:scale-95 transition-all"
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;