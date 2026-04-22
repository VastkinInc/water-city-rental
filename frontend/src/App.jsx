import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import SearchPage from "./pages/SearchPage";
import BoatDetailPage from "./pages/BoatDetailPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import CustomerDashboard from "./pages/CustomerDashboard";
import OwnerDashboard from "./pages/OwnerDashboard";
import CaptainDashboard from "./pages/CaptainDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import HarborsPage from "./pages/HarborsPage";
import EventsPage from "./pages/EventsPage";
import ConciergePage from "./pages/ConciergePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/boats" element={<SearchPage />} />
        <Route path="/boats/:id" element={<BoatDetailPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard/customer" element={<CustomerDashboard />} />
        <Route path="/dashboard/owner" element={<OwnerDashboard />} />
        <Route path="/dashboard/captain" element={<CaptainDashboard />} />
        <Route path="/dashboard/admin" element={<AdminDashboard />} />
        <Route path="/harbors" element={<HarborsPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/concierge" element={<ConciergePage />} />
      </Routes>
    </BrowserRouter>
  );
}