"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import { collection, query, where, getDocs, limit } from "firebase/firestore";

const AppContext = createContext<any>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      const q = query(
        collection(db, "employee"),
        where("userId", "==", firebaseUser.uid),
        limit(1)
      );

      const snap = await getDocs(q);
      let docSnap = !snap.empty ? snap.docs[0] : null;

      if (!docSnap && firebaseUser.email) {
        try {
          const qEmail = query(
            collection(db, "employee"),
            where("nisEmail", "==", firebaseUser.email),
            limit(1)
          );
          const snapEmail = await getDocs(qEmail);
          if (!snapEmail.empty) {
            docSnap = snapEmail.docs[0];
          }
        } catch {
          // Ignore fallback error
        }
      }

      if (docSnap) {
        setProfile({
          id: docSnap.id,
          ...docSnap.data(),
          email: docSnap.data().nisEmail,
        });
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  return (
    <AppContext.Provider value={{ user, profile, loading }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}
