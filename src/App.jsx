import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously, 
  signInWithCustomToken 
} from 'firebase/auth';
import { 
  getFirestore,
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  deleteDoc,
  doc 
} from 'firebase/firestore';

// --- Firebase Initialization ---
// The environment provides these variables for the preview to work.
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'workout-app';

// Simple SVG Icon for the UI
const DumbbellIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
    <path d="m6.5 6.5 11 11"/><path d="m11.8 5.8 5.2 5.2"/><path d="m5.8 11.8 5.2 5.2"/><path d="M16 4.5a3.9 3.9 0 0 1 3.5 3.5L21 10l-1.1 1.1-2.4-2.4L16.4 7.6 14 5.2l1.1-1.1L16 4.5Z"/><path d="M8 19.5a3.9 3.9 0 0 1-3.5-3.5L3 14l1.1-1.1 2.4 2.4L7.6 16.4 10 18.8l-1.1 1.1-0.9-0.4Z"/>
  </svg>
);

export default function App() {
  const [user, setUser] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [menu, setMenu] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [loading, setLoading] = useState(true);

  // 1. Handle Authentication (Rule 3: Auth before queries)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Data Sync (Rule 1: Use specific path structure)
  useEffect(() => {
    if (!user) return;

    // Path: /artifacts/{appId}/public/data/workouts
    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'workouts'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setWorkouts(data);
    }, (error) => {
      console.error("Firestore error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Submit Workout
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!menu || !weight || !reps || !user) return;

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'workouts'), {
        menu,
        weight: Number(weight),
        reps: Number(reps),
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      setMenu('');
      setWeight('');
      setReps('');
    } catch (error) {
      console.error("Save error:", error);
    }
  };

  // 4. Delete Workout
  const deleteWorkout = async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'workouts', id));
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="max-w-md mx-auto">
        <header className="bg-white rounded-2xl p-6 shadow-sm mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center">
            <DumbbellIcon /> 筋トレログ
          </h1>
          <span className="text-xs text-gray-400">UID: {user?.uid.slice(0, 8)}...</span>
        </header>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm mb-8">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">メニュー名</label>
              <input
                type="text"
                value={menu}
                onChange={(e) => setMenu(e.target.value)}
                placeholder="ベンチプレス"
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">重量 (kg)</label>
                <input
                  type="number"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="60"
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">回数 (reps)</label>
                <input
                  type="number"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                  placeholder="10"
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 transition-all transform active:scale-95"
            >
              記録する
            </button>
          </div>
        </form>

        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-700 px-2">最近のトレーニング</h2>
          {workouts.length === 0 ? (
            <div className="text-center py-10 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-300">
              まだ記録がありません
            </div>
          ) : (
            workouts.map((workout) => (
              <div key={workout.id} className="bg-white p-4 rounded-2xl shadow-sm flex items-center justify-between group">
                <div>
                  <h3 className="font-bold text-gray-800">{workout.menu}</h3>
                  <p className="text-sm text-gray-500">
                    {workout.weight}kg × {workout.reps}回
                  </p>
                </div>
                <button 
                  onClick={() => deleteWorkout(workout.id)}
                  className="text-gray-300 hover:text-red-500 p-2 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}