# CLAUDE.md — Water City Rental
# PASTE THIS AT THE TOP OF EVERY CLAUDE SESSION — NO EXCEPTIONS
# Last updated: April 2025 | Status: Stitch design done, VS Code starting

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 1. PROJECT IDENTITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name:     Water City Rental  ← NEVER "Water City Rentals" (no S)
Type:     Boat rental marketplace (Chicago-focused, like GetMyBoat)
Location: Chicago, Illinois, USA
Approach: Vibe coding — one file per prompt

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 2. TECH STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Frontend:  React 18 + Vite + Tailwind CSS
Backend:   Node.js 20 + Express 4
Database:  MongoDB Atlas (Mongoose)
Auth:      JWT access (15min) + refresh token (7d, httpOnly cookie)
Images:    Cloudinary
Events:    Ticketmaster Discovery API (Chicago events)
Deploy:    Vercel (frontend) + Render (backend)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 3. DESIGN SYSTEM — Sunset Harbor Luxe
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COLORS:
  primary:  #C4623A  (rust/terracotta — buttons, links, accents)
  cream:    #FAF7F2  (page backgrounds)
  navy:     #1A1A2E  (headings, dark sections)
  gold:     #D4A843  (italic emphasis, decorative lines)
  surface:  #F5F0EA  (card backgrounds, alternating sections)
  muted:    #6B6560  (secondary text, labels)
  dark:     #2C2825  (body text)

FONTS:
  Headings: Playfair Display, serif → font-serif class
            Use italic weight for one emphasis word per headline
  Body:     Manrope, sans-serif → font-sans class
  Google Fonts URL:
  https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Manrope:wght@300;400;500;600&display=swap

TAILWIND CONFIG (tailwind.config.js):
  colors: {
    primary: "#C4623A", cream: "#FAF7F2", navy: "#1A1A2E",
    gold: "#D4A843", surface: "#F5F0EA", muted: "#6B6560", dark: "#2C2825"
  }
  fontFamily: {
    serif: ["Playfair Display", "Georgia", "serif"],
    sans: ["Manrope", "Inter", "system-ui", "sans-serif"]
  }
  content: ["./index.html", "./src/**/*.{js,jsx}"]

BUTTONS:
  Primary:   bg-primary text-white px-6 py-2.5 rounded-full font-semibold
  Secondary: border border-primary text-primary px-6 py-2.5 rounded-full
  Ghost:     text-primary font-medium underline

CARDS: bg-white rounded-2xl shadow-sm border border-[#f0ece8]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 4. NAVBAR — SAME ON EVERY PUBLIC PAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Position: fixed top-0 left-0 right-0 z-50 h-[68px]
Left:     "Water City Rental" font-serif → React Router Link to /
Center:   Charters(/) · Harbors(/harbors) · Events(/events) · Concierge(/concierge)
Right:    user SVG icon + "Book Now" bg-primary rounded-full button
Active:   link gets text-primary + bottom underline via useLocation

Scroll behavior:
  scrollY === 0 → transparent bg, white text (over hero)
  scrollY > 60  → bg-white shadow-sm, dark text
  useEffect + addEventListener("scroll") to toggle

Mobile < 768px:
  Hide center links
  Show hamburger icon right side
  Click → full-height drawer slides in from right
  Drawer: all links stacked vertically + Book Now button
  useState(false) for open/close

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 5. USER ROLES + ROUTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Roles: customer · owner · captain · admin

Public routes:
  /                     → HomePage
  /harbors              → HarborsPage
  /events               → EventsPage
  /concierge            → ConciergePage
  /boats                → SearchPage
  /boats/:id            → BoatDetailPage
  /login                → LoginPage
  /register             → RegisterPage

Protected routes (need token):
  /dashboard/customer   → CustomerDashboard
  /dashboard/owner      → OwnerDashboard
  /dashboard/captain    → CaptainDashboard
  /dashboard/admin      → AdminDashboard

ProtectedRoute logic:
  No token → redirect /login
  Wrong role → redirect to correct dashboard

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 6. CHICAGO DATA — use these exact names
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HARBORS:
  Monroe Harbor · Navy Pier · Belmont Harbor
  Burnham Harbor · Diversey Harbor · DuSable Harbor

SAMPLE BOATS (hardcoded data until API):
  Azure Serenity  · 45ft · 12 guests · Monroe Harbor  · $1,200/day · ★4.9 · Featured
  Lake Sovereign  · 32ft · 8 guests  · Navy Pier      · $890/day   · ★5.0 · Eco-Choice
  Solaris Dream   · 55ft · 20 guests · Belmont Harbor · $2,400/day · ★4.8 · Popular
  Golden Horizon  · 38ft · 12 guests · Burnham Harbor · $320/hr    · ★4.7 · Catamaran
  Sea Whisper     · 24ft · 6 guests  · Diversey Harbor· $180/hr    · ★4.9 · Motorboat
  Midnight Sun    · 32ft · 8 guests  · DuSable Harbor · $280/hr    · ★4.6 · Day Cruiser

CHICAGO EVENTS (events strip):
  Independence Day Fireworks Cruise · Jul 4  · Navy Pier          · FIREWORKS
  Chicago Sailing Regatta           · Jul 12 · Belmont Harbor     · RACING
  Air & Water Show                  · Jul 24 · North Avenue Beach · AIRSHOW
  Sunset Jazz Cruise                · Aug 3  · Monroe Harbor      · MUSIC
  Chicago Boat Expo                 · Aug 15 · Navy Pier          · EXPO
  Lake Wine & Sail Evening          · Sep 6  · South Harbor       · SOCIAL

SAMPLE USERS (for dashboard hardcoded data):
  Customer: Alex Johnson · alex@example.com
  Owner:    Sarah Chen   · sarah@example.com
  Captain:  Marco Rossi  · marco@example.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 7. PAGES — content of each
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HomePage.jsx sections (top to bottom):
  1. Navbar (transparent over hero)
  2. Hero: full-screen yacht + Chicago skyline photo, dark overlay
           Bottom-left: "The Lake is" then italic "Yours." in gold
           Right side: floating "Plan Your Voyage" glass card
           Card fields: Destination dropdown, Date, Guests, Search button
  3. Stats bar: 120+ Vessels · 48 Captains · 4.9★ · 2,400+ Trips
  4. Chicago Events: horizontal scroll, 6 photo cards, category badges
  5. Fleet: "Exceptional Vessels" heading, 3 boat cards, arrow nav
  6. Experiences grid: Sunset Cruises, Jet Ski Rentals, Paddleboarding
  7. How It Works: 3 step cards (Find, Pay, Sail)
  8. Testimonials: 3 cards, 5 stars, italic quotes
  9. CTA: "Chart Your Own Course" + email subscribe
  10. Footer: 4 columns

SearchPage.jsx:
  Navbar (solid)
  Search header + sort + view toggle
  Left: filter sidebar (price range, vessel type, capacity, amenities)
  Right: active filter chips + 6 boat cards + pagination
  Chicago Events strip below search header

BoatDetailPage.jsx:
  Navbar (solid)
  Breadcrumb: Home > Fleet > Azure Serenity
  Photo grid: 1 large + 2 stacked right + "View 24 Photos"
  Left col: name, italic subtitle, rating + Super Host badge,
            amenities grid, description, calendar, captain card, reviews
  Right col sticky: price/day, check-in/out, guests, breakdown, Book button

CustomerDashboard.jsx:
  Sidebar: Dashboard · Browse Boats · My Bookings · Saved · Messages · Profile
  Stats: Total Bookings 8 · Upcoming 2 · Completed 5 · Saved 12
  Upcoming Trips: 2 booking cards (CONFIRMED, PENDING)
  Recommended: 3 boat cards
  Activity timeline: 4 items

OwnerDashboard.jsx:
  Sidebar: Overview · My Boats · Booking Requests(3) · Earnings · Reviews · Settings
  Header: italic "Owner's Deck" + "Add New Boat" button
  Stats: Boats 4 · Requests 3 · Month $8,400 · Total $42,000
  Incoming Requests table: Accept/Decline buttons
  My Fleet: 3 boat cards with ACTIVE/PENDING/INACTIVE badges
  Monthly Earnings bar chart: Jan–Jul

CaptainDashboard.jsx:
  Sidebar: Overview · My Trips · Schedule · Earnings · Profile
  Header: italic "Captain's Bridge" + ★4.9 rating
  Stats: Assigned 6 · Upcoming 2 · Completed 8 · Avg 4.9★
  Next Trip card: Azure Serenity, James Wilson, Aug 5 9:00AM, Monroe Harbor
  All Trips list: NEW/ACCEPTED/ONGOING/COMPLETED + action buttons
  This Week schedule strip

AdminDashboard.jsx:
  Sidebar: Dashboard · Boat Approvals(5) · Users · All Bookings · Transactions · Settings
  Header: "Control Center" + green "All Systems Operational"
  Stats: Users 1,240 · Pending 5 · Bookings 38 · Revenue $28,400
  Pending Approvals table: Approve/Reject + Reject modal
  User Management: role/status badges, Suspend/Activate
  Recent Bookings table

HarborsPage.jsx:
  Navbar (HARBORS active)
  Hero: "Chicago's Premier Harbors"
  6 harbor cards grid
  Chicago map with location pins
  4 facilities icons strip

EventsPage.jsx:
  Navbar (EVENTS active)
  Hero: "Events on the Water"
  Featured event banner
  6 event cards grid (with real photos)
  Past events photo gallery

ConciergePage.jsx:
  Navbar (CONCIERGE active)
  Hero: "The Water City Concierge"
  6 service cards: Private Chef, Floral, Champagne, Photography, Music, Corporate
  How it works: 3 steps
  Request form: name, email, event type, date, guests, message
  3 testimonials

LoginPage.jsx:
  Split: form left, boat photo right with dark overlay
  "Welcome back." Playfair serif heading
  Email + password (show/hide) + forgot password
  "Sign In" bg-primary button
  Google button + link to register

RegisterPage.jsx:
  Split: photo left, form right
  "Create your account." heading
  First + Last name (side by side)
  Email, Password + Confirm (side by side)
  Role selector: 3 cards — Customer, Boat Owner, Captain
    Selected: primary color border + light primary bg
  "Create Account" button

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 8. BACKEND API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Base URL dev:  http://localhost:5000/api/v1
Base URL prod: https://water-city-rental-api.onrender.com/api/v1

AUTH:     POST /auth/register · /login · /logout · /refresh-token · GET /auth/me
BOATS:    GET /boats · GET /boats/:id · POST · PUT · DELETE · POST /boats/:id/images
BOOKINGS: POST /bookings · GET /bookings/my · /owner · /captain
          PUT /bookings/:id/approve · /reject · /assign-captain · /trip-status
ADMIN:    GET /admin/users · /boats/pending · /bookings · /dashboard-stats
          PUT /admin/users/:id/status · /boats/:id/approve · /boats/:id/reject
EVENTS:   GET /events/chicago

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 9. STATUS BADGE COLORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONFIRMED/APPROVED/ACTIVE: bg-teal-100 text-teal-700
PENDING/PENDING APPROVAL:  bg-amber-100 text-amber-700
ONGOING/NEW ASSIGNMENT:    bg-blue-100 text-blue-700
COMPLETED:                 bg-gray-100 text-gray-600
CANCELLED/REJECTED/SUSPENDED: bg-red-100 text-red-600
INACTIVE:                  bg-gray-100 text-gray-400

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 10. PAYMENT FLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Customer pays 100% upfront → WCR escrow
2. Booking confirmed → owner + captain notified
3. Captain marks "ongoing" → funds still held
4. Captain marks "completed" → auto-release:
   Owner 70% · Captain 20% · WCR fee 10%
5. Cancel 48h+ before → full refund

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 11. BUILD ORDER (tick off as you go)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PHASE 1 — SETUP (do once)
[ ] index.css — CSS variables + font import
[ ] tailwind.config.js — colors + fonts
[ ] Navbar.jsx
[ ] Footer.jsx
[ ] App.jsx — all routes + ProtectedRoute
[ ] AuthContext.jsx

PHASE 2 — PUBLIC PAGES
[ ] HomePage.jsx
[ ] LoginPage.jsx
[ ] RegisterPage.jsx
[ ] SearchPage.jsx
[ ] BoatDetailPage.jsx
[ ] HarborsPage.jsx
[ ] EventsPage.jsx
[ ] ConciergePage.jsx

PHASE 3 — DASHBOARDS
[ ] CustomerDashboard.jsx
[ ] OwnerDashboard.jsx
[ ] CaptainDashboard.jsx
[ ] AdminDashboard.jsx

PHASE 4 — BACKEND
[ ] server.js + app.js
[ ] config/db.js
[ ] utils/asyncHandler.js + ApiError.js + ApiResponse.js
[ ] models/User.js + Boat.js + Booking.js
[ ] controllers/auth + boat + booking + admin
[ ] routes/auth + boat + booking + admin
[ ] middleware/auth + upload

PHASE 5 — CONNECT + DEPLOY
[ ] services/api.js (axios + interceptors)
[ ] Wire login/register to API
[ ] Wire boat search to API
[ ] Wire booking form to API
[ ] Wire all dashboards to API
[ ] Deploy backend → Render
[ ] Deploy frontend → Vercel
[ ] Seed sample data
[ ] Final end-to-end test

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 12. TOKEN-SAVING RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ALWAYS: Paste this CLAUDE.md first in every session
ALWAYS: One prompt = one file
ALWAYS: End every prompt with "Code only, no explanation."
NEVER:  Ask for multiple files in one prompt
NEVER:  Paste whole file for a bug — paste only broken function
NEVER:  Describe design in words — upload Stitch screenshot

PROMPT TEMPLATE:
  [PASTE CLAUDE.md]
  Build [filename].
  File: [exact/path/filename.jsx]
  - requirement 1
  - requirement 2
  Code only, no explanation.
