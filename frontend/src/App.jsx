import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import SearchPage from "./pages/SearchPage";
import BoatDetailPage from "./pages/BoatDetailPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import RegisterOwner from "./pages/RegisterOwner";
import RegisterCaptain from "./pages/RegisterCaptain";
import CustomerDashboard from "./pages/CustomerDashboard";
import OwnerDashboard from "./pages/OwnerDashboard";
import CaptainDashboard from "./pages/CaptainDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import HarborsPage from "./pages/HarborsPage";
import EventsPage from "./pages/EventsPage";
import ConciergePage from "./pages/ConciergePage";
import PartnerPage from "./pages/PartnerPage";
import PartnerLogin from "./pages/PartnerLogin";
import TermsPage from "./pages/TermsPage";
import ListBoat from "./pages/ListBoat";
import EditBoat from "./pages/EditBoat";
import MyBoats from "./pages/MyBoats";
import MyBookings from "./pages/MyBookings";
import MyTrips from "./pages/MyTrips";
import BookingDetail from "./pages/BookingDetail";
import Earnings from "./pages/Earnings";
import Profile from "./pages/Profile";
import Messages from "./pages/Messages";
import Checkout from "./pages/Checkout";
import BookingConfirmed from "./pages/BookingConfirmed";
import Saved from "./pages/Saved";
import ReviewTrip from "./pages/ReviewTrip";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/boats" element={<SearchPage />} />
        <Route path="/boats/:id" element={<BoatDetailPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register-owner" element={<RegisterOwner />} />
        <Route path="/register-captain" element={<RegisterCaptain />} />
        <Route path="/dashboard/customer" element={<CustomerDashboard />} />
        <Route path="/dashboard/owner" element={<OwnerDashboard />} />
        <Route path="/dashboard/captain" element={<CaptainDashboard />} />
        <Route path="/dashboard/admin" element={<AdminDashboard />} />
        <Route path="/harbors" element={<HarborsPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/concierge" element={<ConciergePage />} />
        <Route path="/partner" element={<PartnerPage />} />
        <Route path="/partner-login" element={<PartnerLogin />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/list-boat" element={<ListBoat />} />
        <Route path="/edit-boat" element={<EditBoat />} />
        <Route path="/my-boats" element={<MyBoats />} />
        <Route path="/my-bookings" element={<MyBookings />} />
        <Route path="/my-trips" element={<MyTrips />} />
        <Route path="/booking/:id" element={<BookingDetail />} />
        <Route path="/earnings" element={<Earnings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/review-trip" element={<ReviewTrip />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/booking-confirmed" element={<BookingConfirmed />} />
        <Route path="/booking/new" element={<Checkout />} />
      </Routes>
    </BrowserRouter>
  );
}