# CLAUDE.md — Water City Rental
# PASTE THIS AT THE TOP OF EVERY NEW CLAUDE SESSION
# Last updated: April 2025

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 1. PROJECT IDENTITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name:     Water City Rental (NEVER "Water City Rentals")
Type:     Boat rental marketplace — Chicago, USA
Live URL: https://illustrious-pegasus-59c79d.netlify.app

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 2. TECH STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Frontend:  React 18 + Vite + Tailwind CSS
Backend:   Node.js 20 + Express 4 (NOT STARTED)
Database:  MongoDB Atlas (NOT STARTED)
Auth:      JWT access (15min) + refresh token (7d, httpOnly cookie)
Payments:  Stripe Connect (escrow — client provides keys)
Deploy:    Netlify (frontend done) + Render (backend — not yet)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 3. DESIGN SYSTEM — Sunset Harbor Luxe
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Primary font:  Playfair Display (serif) — headings
Body font:     Manrope (sans-serif)
Primary:       #C4623A
Cream:         #FAF7F2
Navy:          #1A1A2E
Gold:          #D4A843
Surface:       #F5F0EA
Muted:         #6B6560

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 4. HOW THE PROJECT IS BUILT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IFRAME METHOD — every page works like this:
- Raw HTML file saved in frontend/public/
- React page wraps it in an iframe
- Navigation: window.parent.location.href='/path'

React page template (same for every page):
  export default function PageName() {
    return (
      <iframe
        src="/filename.html"
        style={{width:"100vw",height:"100vh",
        border:"none",display:"block"}}
      />
    )
  }

Navigation script (must be in EVERY HTML file before </body>):
  <script>
  document.addEventListener('click',function(e){
    var a=e.target.closest('a[href]');
    if(!a)return;
    var h=a.getAttribute('href');
    if(!h||h.startsWith('http')||h==='#')return;
    e.preventDefault();
    window.parent.location.href=h;
  });
  </script>

For buttons: onclick="window.parent.location.href='/path'"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 5. ALL ROUTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DONE:
/                    → home.html
/boats               → search.html
/boats/:id           → boat.html
/login               → login.html (2-step role selector)
/register            → register.html
/partner             → partner.html
/partner-login       → partner-login.html
/admin-login         → admin-login.html (SECRET URL)
/dashboard/customer  → customer.html
/dashboard/owner     → owner.html
/dashboard/captain   → captain.html
/dashboard/admin     → admin.html
/harbors             → harbors.html
/events              → events.html
/concierge           → concierge.html
/terms               → terms.html
/list-boat           → list-boat.html
/my-boats            → my-boats.html
/my-bookings         → my-bookings.html
/my-trips            → my-trips.html
/earnings            → earnings.html
/profile             → profile.html
/messages            → messages.html
/booking/:id         → booking-detail.html

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 6. LOGIN FLOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PUBLIC /login — 2 steps:
  Step 1: Pick role card:
    🚢 Rent a Boat → /dashboard/customer
    ⛵ Boat Owner  → /dashboard/owner
    ⚓ Captain     → /dashboard/captain
  Step 2: Email + password

/partner-login — for owners + captains via partner page

/admin-login — SECRET, not linked anywhere public

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 7. PAYMENT MODEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Boat rent → 100% to Boat Owner
Captain fee → 100% to Captain (set by each captain)
Platform fee → ZERO during launch phase
Captain is REQUIRED on every booking — for safety
Owner recommends a default captain at listing time
Customer can override and pick any available captain
Stripe keys provided by client

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 8. CHICAGO DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Harbors:
  Monroe Harbor · Navy Pier · Belmont Harbor
  Burnham Harbor · Diversey Harbor · DuSable Harbor

Sample boats:
  Azure Serenity  · 45ft · 12g · Monroe Harbor  · $1,200/day · ★4.9
  Lake Sovereign  · 32ft · 8g  · Navy Pier      · $890/day   · ★5.0
  Solaris Dream   · 55ft · 20g · Belmont Harbor · $2,400/day · ★4.8
  Golden Horizon  · 38ft · 12g · Burnham Harbor · $320/hr    · ★4.7
  Sea Whisper     · 24ft · 6g  · Diversey Harbor· $180/hr    · ★4.9
  Midnight Sun    · 32ft · 8g  · DuSable Harbor · $280/hr    · ★4.6

Sample captains:
  Marco Rossi    · ★4.9 · 12 yrs · $240/day · $40/hr · USCG licensed
  Sofia Martinez · ★4.8 · 8 yrs  · $200/day · $35/hr · Multilingual
  James Chen     · ★5.0 · 15 yrs · $280/day · $45/hr · Ex-Coast Guard
  Diana Webb     · ★4.7 · 6 yrs  · $180/day · $30/hr · Family expert

Users:
  Customer: Alex Johnson  · alex@example.com
  Owner:    Sarah Chen    · sarah@example.com
  Captain:  Marco Rossi   · marco@example.com
  Admin:    System Admin  · admin@watercityrental.com

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 9. BUILD STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DONE ✓
  All public HTML pages live on Netlify
  2-step login with role selector
  Partner page + partner login
  Admin secret login
  Terms of Service (4 tabs: ToS, Renter, Owner, Captain)
  All React routes in App.jsx
  list-boat.html · my-boats.html · my-bookings.html
  my-trips.html · earnings.html · profile.html
  messages.html · booking-detail.html
  Role-aware sidebars on shared pages (localStorage.wcr_role)

NOT STARTED ✗
  Backend (Node.js + Express + MongoDB)
  Stripe payments
  Real auth API

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 10. NEXT STEPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Add captain-selection feature to boat.html and list-boat.html
2. Rebuild + redeploy to Netlify
3. Build full backend
4. Connect frontend to backend
5. Deploy backend to Render
6. Final test + hand to client
