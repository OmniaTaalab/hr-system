"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import { collection, query, where, getDocs, limit, doc, updateDoc } from "firebase/firestore";

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

      try {
        const q = query(
          collection(db, "employee"),
          where("userId", "==", firebaseUser.uid),
          limit(1)
        );

        const snap = await getDocs(q);
        let docSnap = !snap.empty ? snap.docs[0] : null;

        if (!docSnap && firebaseUser.email) {
          const userEmail = firebaseUser.email.trim();
          const userEmailLower = userEmail.toLowerCase();

          // Try nisEmail exact match
          try {
            const qNis = query(
              collection(db, "employee"),
              where("nisEmail", "==", userEmailLower),
              limit(1)
            );
            const snapNis = await getDocs(qNis);
            if (!snapNis.empty) {
              docSnap = snapNis.docs[0];
            }
          } catch {
            // Ignore error
          }

          // Try nisEmail raw case
          if (!docSnap && userEmail !== userEmailLower) {
            try {
              const qNisRaw = query(
                collection(db, "employee"),
                where("nisEmail", "==", userEmail),
                limit(1)
              );
              const snapNisRaw = await getDocs(qNisRaw);
              if (!snapNisRaw.empty) {
                docSnap = snapNisRaw.docs[0];
              }
            } catch {
              // Ignore error
            }
          }

          // Try personalEmail
          if (!docSnap) {
            try {
              const qPersonal = query(
                collection(db, "employee"),
                where("personalEmail", "==", userEmailLower),
                limit(1)
              );
              const snapPersonal = await getDocs(qPersonal);
              if (!snapPersonal.empty) {
                docSnap = snapPersonal.docs[0];
              }
            } catch {
              // Ignore error
            }
          }
        }

        if (docSnap) {
          const data = docSnap.data();
          // Link the user's auth UID to their employee record if not yet linked
          if (!data.userId || data.userId !== firebaseUser.uid) {
            try {
              await updateDoc(doc(db, "employee", docSnap.id), {
                userId: firebaseUser.uid,
              });
            } catch (err) {
              console.warn("Could not automatically link userId to employee doc:", err);
            }
          }

          setProfile({
            id: docSnap.id,
            ...data,
            userId: firebaseUser.uid,
            email: data.nisEmail || firebaseUser.email,
          });
        } else {
          setProfile(null);
        }
      } catch (err) {
        console.error("Error loading employee profile in AppProvider:", err);
        setProfile(null);
      } finally {
        setLoading(false);
      }
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
