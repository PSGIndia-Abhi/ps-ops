# ps-ops — Test Cases & Application Flow

Compiled from the actual repository at `ps-ops/` (frontend Playwright specs, mobile Jest scaffold, Android scaffold, backend source). No test cases were invented — every row below maps to a real test in the codebase.

---

## 1. Project Stack (as found)

| Layer | Technology |
|---|---|
| Web frontend | React 19 + Vite, React Router 7, `frontend/` |
| Old Android wrapper | Capacitor 8, `frontend/android/` (protected, not the new app) |
| New mobile app | React Native 0.87, `mobile/` (in progress) |
| Backend | Node.js + Express 5, `backend/` |
| ORM / DB | Prisma 7 + MySQL (`mysql2`), database `ps_ops` |
| Auth | JWT (`jsonwebtoken`), bcrypt password hashing |
| Other services | Redis, Minio (file storage), Nodemailer, node-cron (scheduled jobs) |
| E2E test tool | Playwright (`frontend/tests`) |
| Mobile unit test tool | Jest (`mobile/__tests__`) — scaffold only |
| Android unit test | JUnit (`frontend/android/.../ExampleUnitTest.java`) — scaffold only |
| Backend tests | **None found** — `backend/package.json` test script is the default `"echo \"Error: no test specified\" && exit 1"` |

---

## 2. Existing Test Cases (complete inventory)

### 2.1 `frontend/tests/auth/login.spec.js` — Login flow
| Test | Verifies |
|---|---|
| `login requires accepting terms` | Login button stays disabled until the Terms checkbox is checked |
| `admin can log in and is sent to the admin dashboard` | Valid admin credentials → redirect to `/admin`, Admin Panel + "New Booking" button visible |
| `shows an alert for invalid credentials` | Wrong password → native alert with "Invalid credentials", user stays on `/login` |

### 2.2 `frontend/tests/auth/route-guards.spec.js` — Route protection
| Test | Verifies |
|---|---|
| `protected routes send anonymous users to login` | Visiting `/admin` while logged out redirects to `/login` |
| `root sends an authenticated user to their role home` | Visiting `/` as a logged-in supervisor redirects to `/supervisor` |
| `users cannot open another role area` | A `client` visiting `/admin` is redirected back to their own home (`/client`) |

### 2.3 `frontend/tests/role-dashboards.spec.js` — Dashboard rendering per role
Parameterized test run once per role, confirming each role's shell + expected content renders:
| Role | Path | Expected shell | Expected content |
|---|---|---|---|
| admin | `/admin` | Admin Panel | Acme Facilities |
| branch_admin | `/admin` | Admin Panel | Acme Facilities |
| supervisor | `/supervisor` | Supervisor Panel | Active Jobs |
| technician | `/technician?tab=today` | Technician Panel | Deep Cleaning |
| client | `/client` | Client Portal | Overview |

### 2.4 `frontend/tests/access-control.spec.js` — Role-based data scoping (largest suite, 16 tests)
| Test | Verifies |
|---|---|
| `admin can see jobs from multiple branches` | Admin sees jobs across all branches (Acme + Orbit) |
| `branch admin sees their branch jobs only` | branch_admin only sees North Branch jobs, not South |
| `supervisor sees their branch jobs only` | Same branch scoping as branch_admin |
| `technician sees only their assigned visit` | Technician's "today" tab shows only their own assigned job |
| `client jobs page shows only the client job` | Client sees only their own job, no branch names leak |
| `admin bookings page can include all branches` | Admin sees bookings from every branch + client bookings |
| `branch admin bookings page hides other branch bookings` | Cross-branch booking leakage blocked |
| `supervisor bookings page hides other branch bookings` | Same as above for supervisor |
| `admin tickets page can include all branches` | Admin sees all support tickets (branch + client) |
| `branch admin tickets page hides other branch and client tickets` | Tickets scoped to own branch, client tickets hidden |
| `client tickets page shows only client tickets` | Client sees only their own tickets |
| `branch admin cannot open another branch job by direct URL` | Direct URL access to a foreign-branch job (`/admin/jobs/202`) is blocked ("Job not found") — guards against IDOR |
| `branch admin can open their own branch job by direct URL` | Own-branch job detail loads correctly |
| `client cannot open admin pages` | Client hitting `/admin/bookings` is redirected home |
| `technician cannot open supervisor pages` | Technician hitting `/supervisor` is redirected home |
| `technician job page does not show assignment or schedule controls` | UI hides "Schedule Visit" / "Assign Work Order" actions from technicians |
| `branch admin assignment modal lists only same-branch people` | Work-order assignment modal only lists same-branch supervisors/technicians |

### 2.5 `frontend/tests/example.spec.js`
| Test | Verifies |
|---|---|
| `homepage loads` | Dev server responds and serves the app on port 5173 |

### 2.6 `mobile/__tests__/App.test.tsx`
| Test | Verifies |
|---|---|
| `renders correctly` | Default React Native scaffold smoke test — renders `<App />` without crashing. **Not yet a real test of app functionality.** |

### 2.7 `frontend/android/app/src/test/java/.../ExampleUnitTest.java`
Default Capacitor/Android Studio scaffold test (`assertEquals(4, 2+2)`), unrelated to app logic — placeholder only, on the **protected** old Capacitor project.

### 2.8 Backend (`backend/`)
No automated test files exist anywhere under `backend/src`. `npm test` in `backend/package.json` just exits with an error. **This is the biggest test-coverage gap** — all authorization/business logic (routes, controllers, services, middleware) is currently unverified except indirectly through the frontend Playwright suite's mocked-API assertions.

---

## 3. Application Flow (reverse-engineered from `mockApi.js` fixtures + route guard tests)

### 3.1 Roles
`admin`, `branch_admin`, `supervisor`, `technician`, `client` — role is embedded in the JWT and read from `localStorage` (`token`, `role`, `userId`, and `contactId` for clients).

### 3.2 Login → Landing flow
```
Unauthenticated user
      │
      ▼
   /login  ──(must check "Terms" checkbox to enable Login button)
      │
      │  POST /api/auth/login {email, password}
      │  invalid → alert("Invalid credentials"), stays on /login
      │  valid   → {token, role, user_id, contact_id?}
      ▼
   Redirect to role home:
      admin, branch_admin → /admin
      supervisor          → /supervisor
      technician          → /technician
      client              → /client
```

### 3.3 Route-guard flow
```
Request for any protected route
      │
      ├─ no token in localStorage ─────────────► redirect to /login
      │
      ├─ token present, role doesn't own route ─► redirect to own role home
      │
      └─ token present, role owns route ────────► render page
```

### 3.4 Data-scoping flow (per entity)
Every list/detail endpoint (`/api/jobs`, `/api/bookings`, `/api/tickets`, `/api/visits/*`) is filtered server-side (mocked in tests, presumably mirrored in real `backend/src/controllers`) according to role:

```
                admin ─────────────► sees ALL branches + ALL clients
                  │
     branch_admin/supervisor ─────► sees only their own branch_id
                  │
              technician ─────────► sees only jobs/visits where they're on the team
                  │
                client ────────────► sees only records matching their contact_id
```

Direct-URL / IDOR protection: fetching a specific resource by ID (e.g. `/admin/jobs/202`) re-applies the same scoping — a branch_admin requesting a foreign-branch job ID gets "Job not found" rather than the record.

### 3.5 Core business entities and relationships (from fixtures)
```
Booking (BK-xxx) ──has many──► Job (JOB-xxx: status, service_type, branch, supervisor, team[])
                                   │
                                   ├──has many──► Visit (scheduled_date, technicians[], status)
                                   │
                                   └──referenced by──► Ticket (subject, priority, messages[])
```
- A **Job** belongs to a branch, has one supervisor and a team of technicians, and is requested by a contact (client).
- A **Visit** is a scheduled occurrence of a job, assigned to specific technicians.
- A **Ticket** is a support/issue thread tied to a job, scoped by branch or by client contact.
- **Work Order assignment**: only admin/branch_admin/supervisor can open the "Assign Work Order" modal, and it only lists same-branch supervisors/technicians.

### 3.6 New mobile app (in progress, per `CLAUDE.md`)
Planned incremental flow (not yet fully implemented — currently just an RN scaffold):
```
Repo analysis → architecture proposal → user approval → /mobile scaffold
→ navigation → API client → auth → login screen → home screen
→ assigned jobs/tasks → job details → job status updates
→ location → camera/file upload → notifications → error/empty states → testing → release
```
The mobile app is required to consume the **existing** backend REST API only (no direct DB access, no duplicate auth system, no WebView wrapping of the web app).

---

## 4. Coverage Gaps Worth Flagging

1. **Backend has zero automated tests.** All authorization logic (branch scoping, contact scoping, team scoping) is only exercised indirectly, through a Playwright suite that mocks the API rather than hitting the real backend.
2. **Mobile app (`mobile/`) has only the default RN scaffold test** — no coverage of navigation, API client, or auth once those are built.
3. **Old Capacitor Android project** has only the default JUnit scaffold test.
4. **No tests found for:** file/image upload, notifications, payment tracking (`backend/src/data/migrations/20260918_create_payment_tracking_tables.sql` exists in the schema but has no associated frontend or backend test), or scheduled jobs (`node-cron`).
