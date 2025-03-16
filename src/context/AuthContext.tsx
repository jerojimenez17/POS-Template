"use client";
import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { onAuthStateChanged, getAuth, User } from "firebase/auth";
import firebase_app from "@/firebase/config";

const auth = getAuth(firebase_app);

interface AuthContextType {
  user: User | null;
}

interface props {
  children: ReactNode;
}
const AuthContext = createContext<AuthContextType>({ user: null });

export const AuthContextProvider = ({ children }: props) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);
  return (
    <AuthContext.Provider value={{ user }}>
      {/* {loading ? (
        <div className="relative bg-transparent h-auto flex justify-center align-middle">
          <div className="absolute top-1/2 bottom-auto">
            <h2 className="font-semibold text-3xl text-pink-400">Loading...</h2>
          </div>
        </div>
      ) : (
        )} */}
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = (): AuthContextType => useContext(AuthContext);
