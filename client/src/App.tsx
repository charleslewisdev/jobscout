import { Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { RequireAdmin } from "./components/RequireAdmin";
import { RequireAuth } from "./components/RequireAuth";
import { CandidateCreate } from "./pages/CandidateCreate";
import { CandidateEdit } from "./pages/CandidateEdit";
import { Candidates } from "./pages/Candidates";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { MatchDetail } from "./pages/MatchDetail";
import { Matches } from "./pages/Matches";
import { MyProfile } from "./pages/MyProfile";
import { Pipeline } from "./pages/Pipeline";
import { PortlandGuide } from "./pages/PortlandGuide";
import { Sources } from "./pages/Sources";
import { Users } from "./pages/Users";

export function App() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="matches" element={<Matches />} />
          <Route path="matches/:id" element={<MatchDetail />} />
          <Route path="my-profile" element={<MyProfile />} />
          <Route path="sources" element={<Sources />} />
          <Route path="portland-guide" element={<PortlandGuide />} />
          <Route element={<RequireAdmin />}>
            <Route path="candidates" element={<Candidates />} />
            <Route path="candidates/new" element={<CandidateCreate />} />
            <Route path="candidates/:id" element={<CandidateEdit />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="users" element={<Users />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
