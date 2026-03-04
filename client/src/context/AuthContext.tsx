import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import { type AuthUser, fetchMe, login as apiLogin } from "../api";

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("token"),
  );
  const [isLoading, setIsLoading] = useState(true);

  // On mount: validate stored token
  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    fetchMe()
      .then(({ user: u }) => {
        setUser(u);
      })
      .catch(() => {
        // Token invalid or expired — clear it
        localStorage.removeItem("token");
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(
    async (email: string, password: string) => {
      const { token: newToken, user: u } = await apiLogin(email, password);
      localStorage.setItem("token", newToken);
      setToken(newToken);
      setUser(u);
      navigate("/");
    },
    [navigate],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    navigate("/login");
  }, [navigate]);

  const isAdmin = user?.role === "admin";

  const value = useMemo(
    () => ({ user, token, login, logout, isAdmin, isLoading }),
    [user, token, login, logout, isAdmin, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
