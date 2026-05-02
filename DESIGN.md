# DESIGN.md — Water City Rental
# Stitch prompts for all remaining pages
# Paste each prompt into Stitch — "Imagine a new screen"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PAGES REMAINING TO DESIGN IN STITCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After designing each page in Stitch:
1. Click Export → Code to Clipboard
2. In VS Code → frontend/public/ → New File
3. Name it exactly as shown → Paste → Save
4. Done — React route already exists

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PAGE 1 — List a Boat
## Save as: list-boat.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Design a "List Your Boat" page for Water City Rental Chicago.
Match the exact design system of this project exactly.
Same sidebar as Owner Dashboard. Active: My Boats.

Page heading: "List Your Boat"
Subheading: "Fill in the details below to add your vessel"

STEP PROGRESS BAR at top (5 steps with connecting line):
Step 1 "Basic Info" (active, filled circle)
Step 2 "Details" · Step 3 "Photos"
Step 4 "Pricing" · Step 5 "Review"

STEP 1 FORM — "Basic Information":
Boat Name: text input · placeholder "e.g. Azure Serenity"
Boat Type: dropdown
  Luxury Yacht · Catamaran · Sailboat ·
  Powerboat · Day Cruiser · Speedboat · Jet Ski
Year Built: number input · "e.g. 2019"
Length (ft): number input · "e.g. 45"
Maximum Guests: number input · "e.g. 12"
Home Harbor: dropdown
  Monroe Harbor · Navy Pier · Belmont Harbor ·
  Burnham Harbor · Diversey Harbor · DuSable Harbor
Description: textarea 4 rows
  "Describe your vessel, its features..."

TWO BUTTONS bottom:
Left: "Cancel" ghost link
Right: "Save & Continue →" primary filled button

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PAGE 2 — My Boats
## Save as: my-boats.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Design a "My Boats" page for Water City Rental Chicago.
Match exact design system. Same sidebar, Active: My Boats.

Heading: "My Fleet"
Top right: "+ Add New Boat" primary button

FILTER TABS: All · Active · Pending Approval · Inactive

4 BOAT CARDS (horizontal layout each):
Photo left 140px · content middle · actions right

Content: name bold · location · specs chips ·
"★4.9 · 24 bookings · $42,000 earned"

Actions right: "Edit" · "View Bookings" · "Deactivate" red

4 boats to show:
1. Azure Serenity · Monroe Harbor · ACTIVE (teal badge)
2. Golden Horizon · Burnham Harbor · ACTIVE (teal badge)
3. Sea Whisper · Diversey Harbor · PENDING APPROVAL (amber)
4. Midnight Sun · DuSable Harbor · INACTIVE (gray badge)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PAGE 3 — My Bookings
## Save as: my-bookings.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Design a "My Bookings" page for Water City Rental Chicago.
Match exact design. Same sidebar as Customer. Active: My Bookings.

Heading: "My Bookings"
FILTER TABS: All · Upcoming · Completed · Cancelled

4 BOOKING CARDS (horizontal):
Photo left · content middle · status + actions right

Content: boat name serif · location · dates ·
Captain avatar + name · total paid bold

4 bookings:
1. Azure Serenity · CONFIRMED (teal)
   Actions: "View Details" + "Cancel Booking" red link
2. Lake Sovereign · PENDING (amber)
   Actions: "View Details" + "Cancel Request" red link
3. Golden Horizon · COMPLETED (gray)
   Actions: "View Details" + "Leave Review" primary button
4. Sea Whisper · CANCELLED (red)
   Actions: "View Details" only

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PAGE 4 — Booking Detail
## Save as: booking-detail.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Design a "Booking Detail" page for Water City Rental Chicago.
Match exact design. Same navbar as public pages.

BREADCRUMB: My Bookings > Booking #WCR-2025-0847

TWO COLUMN LAYOUT (65% left, 35% right sticky):

LEFT:
Status banner: teal background · "Your booking is confirmed!"
Boat Info Card: large photo · "Azure Serenity" · specs chips
Trip Details Card with icons:
  📅 Check-in: Aug 5, 2025 · 9:00 AM
  📅 Check-out: Aug 7, 2025 · 6:00 PM
  ⏱️ Duration: 2 days · 👥 Guests: 4
  📍 Monroe Harbor, Chicago
Captain Card: avatar · "Capt. Marco Rossi" · ★4.9 ·
  "Message Captain" outlined button

RIGHT sticky:
Payment Summary:
  $1,200 × 2 days = $2,400
  Service fee = $220 · Total: $2,620 bold
  "Paid · Visa ending 4242" green text
  CONFIRMED teal badge centered

Cancellation: "Free cancellation until Aug 3"
  "Cancel Booking" outlined red button

Booking Timeline (4 items):
✓ Requested · Apr 20
✓ Owner approved · Apr 21
✓ Payment confirmed · Apr 21
⏳ Trip starts · Aug 5 (upcoming)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PAGE 5 — My Trips (Captain)
## Save as: my-trips.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Design a "My Trips" page for Water City Rental Chicago.
Match exact design. Same sidebar as Captain. Active: My Trips.

Heading: "My Trips"
FILTER TABS: All · New · Upcoming · Ongoing · Completed

5 TRIP CARDS (horizontal):
Photo left · content middle · status + action right

Content: boat name + harbor · customer name ·
date + time · duration · payout amount

5 trips:
1. NEW (amber) · Azure Serenity · James Wilson
   Aug 5 · 9AM · 2 days · $480
   "Accept Trip" primary + "Decline" outlined

2. UPCOMING (blue) · Lake Sovereign · Sarah Chen
   Aug 10 · 10AM · 1 day · $240
   "View Details" outlined

3. ONGOING (teal) · Golden Horizon · David Kim
   Today · Started 9:15AM · $320
   "Mark Complete" green button

4. COMPLETED (gray) · Sea Whisper · Ana Martinez
   Jul 24 · 1 day · $200 Paid
   "View Details" link

5. COMPLETED (gray) · Azure Serenity · Robert Chen
   Jul 18 · 3 days · $720 Paid
   "View Details" link

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PAGE 6 — Earnings
## Save as: earnings.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Design an "Earnings" page for Water City Rental Chicago.
Match exact design. Same sidebar as Owner. Active: Earnings.

Heading: "Earnings Overview"

STATS ROW (4 cards):
This Month: $8,400 · Last Month: $6,200
This Year: $42,000 · Total Lifetime: $67,500

BAR CHART — "Monthly Earnings"
"Download CSV" button top right
Months Jan–Jul on x-axis
Primary color bars · Jul bar highlighted
Values shown on top of each bar

RECENT PAYOUTS TABLE:
Date | Booking # | Boat | Trip Dates | Amount | Status
8 rows — mix of PAID (teal) and PENDING (amber)

PAYOUT ACCOUNT card at bottom:
"Chase Bank ****4242"
"Next payout: $4,698 — expected May 15"
"Edit Payout Account" outlined button

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PAGE 7 — Profile Settings
## Save as: profile.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Design a "Profile Settings" page for Water City Rental Chicago.
Match exact design. Same sidebar as Customer. Active: Profile.

Heading: "Profile Settings"
4 TABS: Profile · Security · Notifications · Payment

PROFILE TAB:
Avatar 96px circle · "Alex Johnson" · "Customer" badge
"Change Photo" button · "Member since April 2025"
Form: First + Last name (side by side) · Email + Verified badge
Phone · City (Chicago IL) · Bio textarea
"Save Changes" primary button

SECURITY TAB:
Change Password card: current + new + confirm + button
Two-Factor Auth card: toggle switch (off)
Active Sessions: MacBook (active now) + iPhone (revoke link)

NOTIFICATIONS TAB:
EMAIL toggles: Booking Confirmations ON · Messages ON ·
  Trip Reminders ON · Promotions OFF
SMS toggles: Trip Reminders ON · Status Updates OFF

PAYMENT TAB:
Visa card ending 4242 · Default badge · Remove link
"Add New Card" dashed button
Payout Account: Chase ****4242 · last payout Apr 20
"Edit Payout Account" button

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PAGE 8 — Messages
## Save as: messages.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Design a "Messages" page for Water City Rental Chicago.
Match exact design. Same sidebar as Customer. Active: Messages.

Heading: "Messages"
TWO COLUMN LAYOUT:

LEFT (320px) — Conversation List:
Search input "Search conversations..."
6 conversations (avatar + name + preview + time):
1. Capt. Marco Rossi · "See you at Monroe Harbor!" · 2m · UNREAD dot
2. Azure Serenity Host · "Booking confirmed" · 1h
3. Water City Rental · "Account verified" · 2h
4. Sarah (Owner) · "Boat is ready" · Yesterday
5. Support Team · "How can we help?" · 2 days
6. Capt. James · "Trip completed" · 3 days

RIGHT — Active Conversation:
Header: Capt. Marco Rossi + green Online dot
Chat bubbles (received left gray, sent right primary):
  Received: "Hi! Looking forward to our trip Aug 5!"
  Sent: "Will there be life jackets for 4 guests?"
  Received: "Absolutely! Fully Coast Guard compliant."
  Sent: "What time to arrive at Monroe Harbor?"
  Received: "8:45 AM. I'll be at Dock 7. See you! ⚓"
Input bar: text field + send button primary

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PAGE 9 — Partner With Us
## Save as: partner.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Design a "Partner With Us" page for Water City Rental Chicago.
Match exact design. Same navbar as public pages. No sidebar.

HERO:
Chicago harbor at golden hour photo. Dark overlay.
Badge: "🤝 Partner Program — Now Open"
Serif heading: "Grow Your Business on the Water"
Subheading: "Zero joining fees to get started"
Two buttons: "Join as Boat Owner →" primary + "Join as Captain →" outlined

BENEFITS (2 large cards side by side):
Card 1 — ⛵ Boat Owner · "Earn up to $8,400/month"
  ✓ Free to list · ✓ Set your own price
  ✓ We handle bookings · ✓ Paid after every trip
  "Join as Boat Owner" button

Card 2 — ⚓ Captain · "Earn on your schedule"
  ✓ Free to join · ✓ Choose your trips
  ✓ Verified captain badge · ✓ Paid after every trip
  "Join as Captain" button

GREEN BANNER:
"🎉 Zero joining fees during our launch phase"

HOW IT WORKS (3 steps):
Apply → Get Verified → Start Earning

STATS ROW:
$42,000 · 4.9★ · 48 captains · Zero fees

BOTTOM CTA (dark navy):
"Ready to start earning on the water?"
Two buttons + "No joining fees · Cancel anytime"

Same footer as other pages.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## PAGE 10 — Partner Login
## Save as: partner-login.html
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Design a "Partner Login" page for Water City Rental Chicago.
Match exact design. Split layout like login.html.

LEFT SIDE:
"Water City Rental" logo at top

STEP 1 (shown first):
Heading: "Welcome Back, Partner"
Subheading: "Select your role to continue"
2 role cards:
  ⛵ "Boat Owner" · "Manage your fleet"
  ⚓ "Captain" · "Manage your trips"
Selected card gets primary color border + light tint
"Continue →" primary button (disabled until selected)
"Not a partner yet? Join free →" link → /partner

STEP 2 (after Continue clicked):
Role badge showing selected role
"← Change role" back link
"Welcome back." serif heading
Email input · Password with show/hide · Forgot link
"Sign In" primary full-width button
  Boat Owner → /dashboard/owner
  Captain → /dashboard/captain

RIGHT SIDE:
Full-height yacht photo with dark overlay
Centered glass card:
  "Water City Rental" italic serif
  "$42,000" large bold number
  "Top partner earnings" small muted
  "★4.9 Average rating"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## CAPTAIN SELECTION FEATURE — boat.html update
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[paste Stitch Prompt 1 here]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## CAPTAIN STEP — list-boat.html update
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[paste Stitch Prompt 2 here]
