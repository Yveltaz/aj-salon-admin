# AJ Salon — Admin Portal

A standalone owner/admin web app for Amelia Jacob's Salon. It is a completely
separate Vite + React application from the staff app (`../aj-salon-app`), with
its own URL and its own authentication (email + password + TOTP 2FA). It talks
to the **same Supabase project** as the staff app — the data is shared, the
surfaces are not.

Staff have no knowledge this app exists. There is no PIN pad, no sign-up link,
and no link to it from the staff app.

## Screens

Dashboard (with realtime shift updates) · Timesheets · Tasks · Roster · Leave ·
Employees · Reports (CSV export + Xero sync) · Audit log.

---

## Local development

```bash
npm install
npm run dev      # http://localhost:5175  (staff app runs on 5174)
npm run build    # production build to dist/
```

`.env.local` holds the Supabase connection (same values as the staff app):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

---

## Authentication

The app is a small state machine (`src/App.jsx`):

```
loading → login → 2fa_enroll → portal
                → 2fa_verify → portal
```

- **Login** — email + password (`src/components/Login.jsx`).
- **2FA enrollment** — on first login, if no verified authenticator exists, the
  owner is forced through TOTP setup: scan a QR code, enter a code to confirm
  (`src/components/TwoFactorSetup.jsx`). This is mandatory — there is no way to
  reach the portal without it.
- **2FA verify** — on subsequent logins, after the password, a 6-digit code is
  required (`src/components/TwoFactorVerify.jsx`). A "Remember this device for 30
  days" checkbox stores a local flag that skips the code prompt on this browser
  until it expires (the underlying Supabase session still governs sign-in).
- **Sign out** clears the session and the trusted-device flag.

Routing is driven by the Supabase session and its MFA **Authenticator Assurance
Level**, so a page refresh always lands on the correct screen.

---

## Supabase setup (one-time, manual — done in the Supabase dashboard)

### 1. Create Amelia's admin account

`Authentication → Users → Add user`:

- **Email**: Amelia's real email (e.g. `amelia@ameliajacobssalon.com.au`)
- **Password**: a temporary password — she changes it on first login via
  **Forgot password**, or you hand it to her to change.
- Tick **Auto Confirm User** so she can log in immediately.

The account does **not** need a matching `employees` row. The app resolves the
owner's `employee_id` (for the audit-log actor) from the existing
`role = 'owner'` employee automatically.

### 2. Lock down sign-ups

`Authentication → Sign In / Providers`:

- **Disable "Allow new users to sign up"** — admin accounts are invite-only.
- Ensure the **Email** provider is enabled.

### 3. Enable TOTP MFA

`Authentication → Multi-Factor Authentication` (or `Providers → MFA`):

- Enable **TOTP (Authenticator app)**.

MFA is not "required" at the Supabase level — it is **enforced in app code**:
after password login the app checks for a verified factor and forces enrollment
if none exists, so every admin session is protected by 2FA regardless.

### 4. Session length

`Authentication → Sessions` (and JWT settings):

- Set the desired inactivity timeout. The spec calls for **1 week** of
  inactivity — configure the refresh-token / session timeout accordingly. The
  Supabase session persists in `localStorage` by default.

### Resetting 2FA (if Amelia loses her authenticator)

Delete her enrolled factor via the Management API or by removing the factor for
her user, then have her log in again — the app will walk her back through
enrollment. (There is no self-service reset in the UI by design.)

---

## Deployment (Vercel — a NEW project, not linked to the staff repo)

Deploy directly from this folder:

```bash
npx vercel          # first run links/creates the project — accept a new project
npx vercel --prod   # production deploy
```

Or create a new GitHub repo `aj-salon-admin`, push, and import it in Vercel as a
**separate** project. Do **not** attach it to the staff app's repo.

### Environment variables (Vercel → Project → Settings → Environment Variables)

Add both, for all environments:

- `VITE_SUPABASE_URL` — same value as the staff app
- `VITE_SUPABASE_ANON_KEY` — same value as the staff app

`vercel.json` already contains the SPA rewrite so client-side routes and the
Xero OAuth redirect (`/?xero=...`) resolve to `index.html`.

> **Note:** The admin URL should not be publicised. It isn't secret, but there's
> no reason to make it easy to find — it is `noindex, nofollow` and is never
> linked from the staff app.

---

## Relationship to the staff app

- **Same** Supabase project, tables, and Edge Functions (`create-staff-login`,
  `remove-staff-login`, `xero-*`). No new Edge Functions are required.
- Adding an employee here calls `create-staff-login`, so the new PIN works on the
  staff app immediately. Removing an employee calls `remove-staff-login`.
- After this app is live, the `src/admin/` surface is removed from the staff app
  so the two are fully separated.
