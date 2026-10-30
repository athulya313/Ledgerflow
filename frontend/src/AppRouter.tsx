
import { useCallback, useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";

import App from "./App";
import LoginPage from "./pages/login";
import RegisterPage from "./pages/Register";
import { authApi, type CurrentUser } from "./services/api";

function AppRoutes() {
  const navigate = useNavigate();

  const [current, setCurrent] = useState<CurrentUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const refreshSession = useCallback(async () => {
    const result = await authApi.me();
    setCurrent(result);
    return result;
  }, []);

  useEffect(() => {
    let mounted = true;

    authApi
      .me()
      .then((result) => {
        if (mounted) setCurrent(result);
      })
      .catch(() => {
        if (mounted) setCurrent(null);
      })
      .finally(() => {
        if (mounted) setCheckingSession(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function handleLogin(
    email: string,
    password: string,
  ): Promise<void> {
    await authApi.login({ email, password });
    await refreshSession();
    navigate("/", { replace: true });
  }

  async function handleRegister(input: {
    name: string;
    email: string;
    password: string;
    organizationName: string;
  }): Promise<void> {
    await authApi.register(input);
    await refreshSession();
    navigate("/", { replace: true });
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        Loading LedgerFlow...
      </div>
    );
  }

  return (
    <Routes>
   <Route
  path="/login"
  element={
    current ? (
      <Navigate to="/" replace />
    ) : (
      <LoginPage
        onLogin={handleLogin}
        onRegisterClick={() => navigate("/register")}
      />
    )
  }
/>

<Route
  path="/register"
  element={
    current ? (
      <Navigate to="/" replace />
    ) : (
      <RegisterPage
        onRegister={handleRegister}
        onLoginClick={() => navigate("/login")}
      />
    )
  }
/><Route
  path="/"
  element={
    current ? (
      <App currentUser={current} />
    ) : (
      <Navigate to="/login" replace />
    )
  }
/>
      

      <Route
        path="*"
        element={
          <Navigate to={current ? "/" : "/login"} replace />
        }
      />
    </Routes>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
