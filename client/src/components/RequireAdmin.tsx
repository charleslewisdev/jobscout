import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export function RequireAdmin() {
  const { user } = useAuth();

  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
