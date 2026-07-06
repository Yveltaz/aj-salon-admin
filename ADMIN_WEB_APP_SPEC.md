# ADMIN WEB APP — BUILD SPEC

Extract the existing admin portal into a completely separate Vite + React web
application with its own Vercel deployment, its own URL, and proper email +
password + TOTP 2FA authentication. Staff have no knowledge this app exists.

## Why separate

The current app has both staff and admin on the same surface — a staff member
on the PIN screen is one URL away from the admin portal. The goal is complete
separation: different codebase, different URL, different auth system, same
Supabase backend (data is shared, surfaces are not).

---

## What to build

A new Vite + React project at `B:\aj-salon-admin` (sibling to `B:\aj-salon-app`).

### Tech stack
- Vite + React (same as current app)
- Supabase Auth — email + password + TOTP 2FA
- Same Supabase project (same URL, same anon key, same tables)
- Tailwind is fine here since this is desktop-first — or reuse the existing
  CSS token system from styles.css (copy it across). Either is fine.
- No new Supabase Edge Functions needed — all existing ones work as-is
- Deploy to a new Vercel project: `aj-salon-admin.vercel.app`

---

## Auth flow

### Login screen
- Email input + password input (not a PIN pad)
- "Sign in" button
- Clean, branded — same AJ Salon aesthetic (ivory, gold, Cormorant Garamond
  headings, Jost body) but desktop layout (centred card, max-width 420px)
- No "sign up" link — admin accounts are created manually by you (the
  developer) directly in Supabase Auth dashboard. Amelia is the only user.
- Forgot password link → Supabase sends a reset email → standard flow

### 2FA (TOTP)
After correct email + password, if 2FA is enrolled:
- Show a 6-digit code input ("Enter the code from your authenticator app")
- Verify using Supabase's MFA TOTP challenge/verify flow
- "Remember this device for 30 days" checkbox (optional — implement if
  Supabase supports it, skip if not)

### 2FA enrollment (first login)
If the owner hasn't enrolled 2FA yet (fresh account):
- After first successful password login, redirect to a mandatory 2FA setup
  screen before accessing the admin portal
- Show a QR code to scan with Google Authenticator / Authy / any TOTP app
- Ask them to enter a code to confirm enrollment before proceeding
- Once enrolled, they won't see this screen again

### Session
- Supabase session persists in localStorage (standard behaviour)
- Session expires after 1 week of inactivity (configure via Supabase dashboard
  JWT expiry — note this in setup instructions)
- Sign out button clears session

---

## Supabase Auth setup (manual steps — document in README)

1. In Supabase dashboard → Authentication → Users → "Add user" manually:
   - Email: amelia@ameliajacobssalon.com.au (or whatever Amelia's real email is)
   - Set a temporary password, she changes it on first login
2. In Supabase dashboard → Authentication → Sign In / Up:
   - Disable "Enable sign ups" (no self-registration — admin accounts are
     invite-only)
   - Make sure "Email" provider is enabled
3. MFA: Supabase supports TOTP MFA — enable it under Authentication → MFA
   in the Supabase dashboard. Set it to "required" for this app by enforcing
   it in the app code (check for enrolled factor after login, redirect to
   enrollment if missing)

---

## Screens to include

Copy ALL of the following from `src/admin/` in the existing app, adapting
for desktop layout:

1. **Dashboard** — stat cards, location comparison, top staff table, realtime
   shift updates (keep the Supabase Realtime subscription)
2. **Timesheets** — submitted shifts, approve/reject/edit with audit trail
3. **Tasks** — task table, create/delete
4. **Roster** — weekly grid, shift editor, publish/unpublish, copy last week
5. **Leave** — pending badge, approve/reject with reason
6. **Employees** — active list, add (calls create-staff-login Edge Function),
   remove (calls remove-staff-login Edge Function), show removed toggle
7. **Reports** — date range, per-employee table, CSV export, Xero sync card
8. **Audit log** — reverse-chronological, read-only

### Desktop layout differences (since this is web-only, not mobile)
- Sidebar stays fixed — no collapse needed below 768px (this is admin-only,
  always on a laptop/desktop)
- Tables can show more columns — don't truncate aggressively like the mobile
  admin did
- Roster grid: more comfortable spacing, shift editor as a right panel not
  a bottom sheet
- Dashboard stat cards: 4 across in a row, not 2×2

---

## What to strip out of the existing staff app (B:\aj-salon-app)

Once the admin app is built and deployed, remove from `B:\aj-salon-app`:
- `src/admin/` directory entirely
- Admin-related imports and the `role === 'owner'` branch in `src/App.jsx`
- The `getAdminDashboard`, `getShiftsForApproval`, `approveShift`,
  `rejectShift`, `editShiftHours`, `getEmployees`, `addEmployee`,
  `removeEmployee`, `getAllTasks`, `addTask`, `deleteTask`, `getReport`,
  `exportReportCsv`, `getAuditLog`, `getXeroStatus`, `startXeroConnect`,
  `pushToXero`, `getXeroPushHistory`, `disconnectXero` functions from
  `src/api/client.js` (keep only the staff-facing functions)
- Any admin CSS from `src/styles.css` (keep staff CSS only)

After stripping, `npm run build` must pass on the staff app with no errors.

---

## Project structure

```
B:\aj-salon-admin\
  src\
    api\
      supabase.js        (same pattern as staff app)
      client.js          (admin-only functions, copied from staff app)
    components\
      Login.jsx          (new — email + password + 2FA)
      TwoFactorSetup.jsx (new — TOTP enrollment QR)
      TwoFactorVerify.jsx (new — 6-digit code entry)
    admin\               (copied from B:\aj-salon-app\src\admin\)
      AdminPortal.jsx
      Dashboard.jsx
      Timesheets.jsx
      AdminTasks.jsx
      Roster.jsx
      Leave.jsx
      Employees.jsx
      Reports.jsx
      Audit.jsx
    styles.css           (copied from staff app, keep admin section)
    App.jsx              (new — auth state machine: login → 2fa → portal)
    main.jsx
  index.html
  vite.config.js
  package.json
  vercel.json            (SPA rewrite rule — same as staff app)
  .env.local             (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY — same values)
  README.md
```

---

## App.jsx auth state machine

```
states: 'loading' | 'login' | '2fa_enroll' | '2fa_verify' | 'portal'

on load:
  check supabase.auth.getSession()
  if no session → 'login'
  if session exists:
    check MFA factors — if none enrolled → '2fa_enroll'
    if enrolled but not verified this session → '2fa_verify'
    else → 'portal'

on successful password login:
  check MFA factors
  if none enrolled → '2fa_enroll'
  if enrolled → '2fa_verify' (challenge)

on successful 2FA verify → 'portal'
on sign out → clear session → 'login'
```

---

## Vercel deployment

New Vercel project — do NOT link to the same GitHub repo as the staff app.
Options:
1. Create a new GitHub repo `aj-salon-admin` and push there
2. Or deploy directly via `npx vercel` from `B:\aj-salon-admin`

Add environment variables in Vercel:
- `VITE_SUPABASE_URL` (same value as staff app)
- `VITE_SUPABASE_ANON_KEY` (same value as staff app)

---

## Acceptance tests

1. Navigate to admin URL → login screen appears (no PIN pad, no staff screens visible)
2. Wrong password → clear error, no access
3. Correct password, no 2FA enrolled → redirected to TOTP setup screen with QR code
4. Scan QR with Google Authenticator, enter code → enrolled, lands on Dashboard
5. Sign out → sign back in → after password, 2FA code required before portal loads
6. Wrong 2FA code → blocked, clear error
7. Forgot password → reset email received, password reset works
8. All 8 admin screens load and function correctly (data from Supabase matches
   what staff app shows)
9. Adding an employee in admin app → staff can log in with new PIN on staff app immediately
10. Xero sync card visible in Reports, Connect to Xero flow works
11. Staff app (`B:\aj-salon-app`) builds cleanly after admin screens stripped out —
    no admin routes accessible from staff app URL
12. `npm run build` passes on both projects

---

## README must include

- How to create Amelia's auth account in Supabase dashboard
- How to enable/require MFA in Supabase dashboard
- How to deploy to Vercel (new project)
- How to add env vars to Vercel
- Note: admin URL should not be publicised — it's not secret but there's no
  reason to make it easy to find

## Out of scope

Multiple admin users / role-based access within admin (Amelia is the only
admin for now), SSO/Google login, admin mobile app, audit log of admin
logins (Supabase Auth logs cover this natively).
