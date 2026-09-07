# BestServe — New Android Application Development Rules

## 1. Project Objective

This repository contains an existing production web application, backend API, database, infrastructure configuration, and an older Capacitor Android application.

We are now developing a **NEW, SEPARATE Android mobile application**.

The new Android application must have its own mobile-specific UI and user experience.

It must NOT simply wrap, embed, or reuse the existing web application's UI.

The new Android application must communicate with the existing backend through APIs.

The intended architecture is:

```
Existing Web App ──────┐
                       │
                       ▼
                 Existing Backend API
                       │
                       ▼
                     Database
                       ▲
                       │
NEW Android App ───────┘
```

The Android application is another client of the existing backend.

---

# 2. Existing Systems — PROTECTED

The following folders contain existing systems.

They must be treated as **PROTECTED** during Android development.

## Protected folders

```
/backend
/frontend
/frontend/android
/infra
```

Do not modify these folders unless the user explicitly approves the change.

---

# 3. Backend — PROTECTED

The `/backend` directory contains the existing backend/API system.

Do NOT:

* Rewrite backend architecture
* Refactor backend code
* Rename backend files
* Move backend files
* Delete backend files
* Change database schema
* Change Prisma models
* Change authentication logic
* Change authorization logic
* Change existing API contracts
* Change production configuration
* Change existing business logic
* Change existing jobs/services

unless explicitly requested and approved by the user.

The Android application must use the existing backend APIs.

---

# 4. Frontend — PROTECTED

The `/frontend` directory contains the existing web application.

Do NOT modify the existing web application for the purpose of building the new Android application.

Do NOT:

* Redesign the web application
* Modify existing React components
* Rename frontend files
* Move frontend files
* Delete frontend files
* Change existing web routes
* Change existing web workflows
* Change existing business logic
* Change existing API integration
* Change existing frontend configuration
* Change existing production behavior

unless explicitly requested and approved.

The existing web application must continue working independently.

---

# 5. Existing Capacitor Android Project — PROTECTED

The repository contains:

```
/frontend/android
```

This is an existing/old Capacitor Android project.

It is NOT the new Android application.

Do NOT:

* Delete it
* Rename it
* Move it
* Replace it
* Repurpose it
* Modify its configuration
* Use it as the location for the new Android application

unless the user explicitly instructs you to do so.

Do not assume this project should be used for the new Android application.

The new Android application must be separate.

---

# 6. Infrastructure — PROTECTED

The `/infra` directory contains existing infrastructure and deployment configuration.

It may contain:

* Docker configuration
* Deployment configuration
* Infrastructure scripts
* Environment/deployment settings
* Production-related configuration
* Service configuration

Do NOT modify `/infra` merely to make the Android application work.

If an infrastructure change appears necessary:

STOP.

Explain:

1. Why the change is required
2. Which file needs to change
3. What exactly needs to change
4. Expected impact on the existing system
5. Whether there is a safer alternative

Wait for explicit user approval before modifying infrastructure.

---

# 7. New Android Application

The new Android application should be developed separately.

Preferred location:

```
/mobile
```

Expected high-level structure:

```
/mobile
    /src
    /...
```

The exact Android technology and project structure must be determined after repository analysis.

Do NOT create the `/mobile` project until the analysis phase is complete and the user approves the proposed architecture.

---

# 8. CRITICAL RULE — ANALYZE FIRST

Before creating or modifying files, inspect the existing project.

The first Android task must be:

```
ANALYZE ONLY — DO NOT MODIFY FILES.
```

During analysis, inspect:

* Existing frontend structure
* Existing frontend routes
* Existing authentication flow
* Existing user roles
* Existing API calls
* Backend routes
* Controllers
* Services
* Authentication middleware
* Authorization rules
* Relevant database models
* Existing job/task workflows
* Existing location functionality
* Existing file/image upload functionality
* Existing notifications if present
* Existing API request/response formats
* Existing environment configuration
* Existing documentation
* Existing Capacitor configuration
* Existing Android project

The purpose is to understand how the new Android application can safely consume the existing backend.

Do not make assumptions when the repository can provide the answer.

---

# 9. First Analysis Deliverable

After completing the analysis:

**STOP.**

Do not create the Android application yet.

Provide a report containing the following.

## A. Existing Architecture

Explain:

* Frontend technology
* Backend technology
* Database technology
* Authentication approach
* Authorization approach
* API architecture
* Existing mobile/Capacitor setup
* Relevant infrastructure

## B. Relevant APIs

Identify existing APIs that the Android application can consume.

For every relevant API provide:

* Endpoint
* HTTP method
* Authentication requirement
* Required role/permission
* Request format
* Response format
* Purpose

Do NOT invent endpoints.

Only report APIs that actually exist or can be verified from the repository.

## C. Authentication

Explain exactly how the existing web application authenticates users.

Determine:

* Login mechanism
* Token/session mechanism
* Token storage
* Authorization mechanism
* Role handling
* Token expiration/refresh behavior if present

Determine whether the same backend authentication system can be used safely by the Android application.

Do NOT modify authentication during analysis.

## D. User Roles

List the existing relevant user roles.

For each role explain:

* What the role can access
* What actions the role can perform
* Which mobile workflows are relevant

## E. Mobile Screens

Based on the actual existing business workflows, propose the minimum required Android screens.

Do NOT simply copy the web application's screen structure.

Design the mobile application around the mobile user's workflow.

## F. API Gaps

Identify any mobile requirement for which an existing backend API does not appear to exist.

For every API gap explain:

* Required mobile functionality
* Existing APIs checked
* Why the existing API cannot satisfy the requirement
* Likely backend file(s) involved
* Smallest proposed backend change

DO NOT implement the backend change.

Wait for user approval.

## G. Recommended Android Architecture

Recommend the Android technology and project structure based on the actual repository.

Explain:

* Recommended technology
* Why it fits this project
* How it communicates with the backend
* How authentication will work
* How navigation will work
* How mobile state will be managed
* How location/camera/notifications would be handled if required

Do not create the project until the user approves the recommendation.

---

# 10. API-First Rule

The Android application must use the existing backend APIs.

Architecture:

```
Android UI
    ↓
Mobile API/service layer
    ↓
Existing Backend REST API
    ↓
Existing business logic
    ↓
Existing database
```

The Android application must NEVER connect directly to the database.

DO NOT:

* Add a second database
* Put database credentials in the mobile application
* Query PostgreSQL/MySQL/etc. directly from Android
* Duplicate backend business logic unnecessarily
* Bypass backend authorization
* Create a separate backend just for Android unless explicitly approved

---

# 11. No Web Wrapper

The new Android application must NOT be a WebView wrapper around the existing website.

Do NOT build the new application by loading:

```
https://bestserve.co.in
```

inside a WebView.

Do NOT use:

```
frontend/dist
```

as the mobile application's UI.

Do NOT make the new Android application dependent on the existing website being loaded.

The new application must have its own mobile UI.

It must consume the existing backend APIs.

---

# 12. Mobile UI Principles

The new Android application should be designed specifically for mobile devices.

Prioritize:

* Simple navigation
* Large touch targets
* Clear status information
* Fast loading
* Minimal data entry
* Mobile-friendly forms
* Loading states
* Error states
* Empty states
* Poor-network handling where necessary
* Android back-button behavior
* Appropriate permission handling
* Mobile-friendly confirmation dialogs

Do not attempt to reproduce the entire desktop web application.

Only implement functionality required for the Android user's workflow.

---

# 13. Minimum-Feature Principle

Keep the first version simple.

Do NOT introduce unnecessary:

* Microservices
* Complex state-management systems
* New databases
* New backend systems
* New authentication systems
* Complex caching
* Large abstraction layers
* Duplicate business logic
* Unnecessary libraries
* Unnecessary native modules

Prefer the smallest maintainable solution that satisfies the actual requirement.

---

# 14. Backend Change Protocol

If the Android application cannot complete a required feature using existing APIs:

**STOP before modifying backend code.**

Report:

```
Backend change required:
Reason:
Existing API:
Missing capability:
Proposed endpoint/change:
Backend files likely affected:
Risk to existing web application:
```

Wait for explicit user approval.

Never silently modify backend code to make the Android application work.

---

# 15. Frontend Change Protocol

The existing web frontend must not be modified to support the Android application.

If a frontend modification appears necessary:

**STOP.**

Explain:

* Why it appears necessary
* Which file would change
* What would change
* Whether an alternative exists that keeps the web frontend untouched

Wait for approval.

---

# 16. Infrastructure Change Protocol

If the Android application appears to require changes to `/infra`:

**STOP.**

Do not modify infrastructure automatically.

Report:

```
Infrastructure change required:
Reason:
File(s) affected:
Proposed change:
Expected impact:
Safer alternative, if any:
```

Wait for explicit approval.

---

# 17. Database Change Protocol

The existing database is shared by the web application and backend.

Do NOT:

* Create a second database
* Modify database schema
* Add migrations
* Rename tables
* Delete columns
* Change Prisma models
* Change relationships

for Android development without explicit approval.

If a database change is required:

STOP and explain the requirement and impact.

---

# 18. Authentication and Security

Do not create a second authentication system if the existing backend authentication can be reused.

Inspect the existing authentication system first.

Do NOT:

* Hard-code passwords
* Hard-code JWT secrets
* Hard-code private keys
* Store database credentials in the Android application
* Copy backend secrets into the mobile application
* Expose production secrets
* Commit sensitive credentials

If a secret is discovered in the repository:

Do not copy it into the Android project.

Report it to the user.

---

# 19. Environment Configuration

Do not assume development, staging, and production use the same API URL.

Inspect the existing environment configuration.

Determine the appropriate API base URL strategy before implementing API configuration.

Do not blindly hard-code production URLs.

Do not copy backend `.env` files into the mobile application.

---

# 20. Git Safety

Before making significant changes:

```
git status
```

Never discard user changes.

Never run destructive commands such as:

```
git reset --hard
git clean -fd
git checkout -- .
git restore .
```

unless the user explicitly requests the exact operation.

Do not overwrite existing files merely to simplify implementation.

Keep Android development isolated to the new mobile project whenever possible.

---

# 21. File Modification Rules

Before modifying any file:

1. Inspect the file.
2. Understand its purpose.
3. Determine whether it belongs to the new Android application.
4. Determine whether another solution avoids modifying it.
5. Check Git status when appropriate.

Preferred modification area:

```
/mobile
```

Protected areas:

```
/backend
/frontend
/frontend/android
/infra
```

Do not modify protected areas without explicit approval.

---

# 22. Documentation

The `/docs` directory contains existing project documentation.

Use existing documentation as a source of information during analysis.

Do not modify existing documentation merely to support Android development.

If new Android-specific documentation is required, create it only when explicitly requested or when the user approves it.

Do not overwrite existing documentation.

---

# 23. Development Process

Build the Android application incrementally.

Recommended order:

1. Repository analysis
2. Architecture proposal
3. User approval
4. Create `/mobile`
5. Basic Android application startup
6. Navigation
7. API client
8. Authentication
9. Login screen
10. Main/home screen
11. Assigned jobs/tasks
12. Job details
13. Job status updates
14. Required location functionality
15. Required camera/file functionality
16. Notifications if required
17. Loading/error/empty states
18. Testing
19. Debug Android build
20. Release APK/AAB

Do not implement all features at once.

---

# 24. Incremental Implementation

For each feature:

1. Understand the existing backend API.
2. Define the mobile screen.
3. Implement the smallest working version.
4. Test it.
5. Check Git status.
6. Verify protected folders were not modified.
7. Continue to the next feature.

Do not make large unrelated changes in a single step.

---

# 25. Verification After Changes

After significant changes:

* Run `git status`
* Review changed files
* Run relevant lint/type checks
* Run relevant tests
* Run the Android build
* Test the affected functionality
* Confirm protected folders were not modified

Report:

```
Files created:
Files modified:
Files deleted:
Tests/build performed:
Protected files changed:
Issues remaining:
```

If any protected file was changed unintentionally:

**STOP and report it.**

---

# 26. Dependency Rules

Do not install or upgrade dependencies unnecessarily.

Before adding a dependency:

1. Check whether an existing dependency can solve the problem.
2. Explain why a new dependency is needed.
3. Prefer stable and well-maintained libraries.
4. Avoid changing dependencies in the existing frontend/backend unless explicitly approved.

Mobile dependencies should be isolated to `/mobile` whenever possible.

---

# 27. Scope Discipline

Only implement what the user asks for.

Do not use Android development as an opportunity to:

* Refactor the backend
* Redesign the web application
* Upgrade unrelated dependencies
* Clean unrelated files
* Rename existing architecture
* Fix unrelated bugs
* Change database structure
* Modify infrastructure
* Replace the existing Capacitor project
* Introduce unrelated features

If an unrelated problem is discovered:

Report it separately.

Do not fix it automatically.

---

# 28. Communication Rules

When requirements are unclear:

Do not guess when the decision could affect the existing system.

Ask a concise question.

When a proposed change could affect:

* Backend
* Database
* Existing web application
* Existing Capacitor Android application
* Infrastructure
* Authentication

Explain the impact before making the change.

Prefer safe, incremental changes.

---

# 29. Current Mission

The current mission is:

```
Build a NEW Android mobile application
with its own mobile UI
that communicates with the EXISTING backend API,
while leaving the EXISTING web application,
backend, database, infrastructure,
and old Capacitor Android project intact.
```

The new Android application must NOT be a WebView wrapper of the existing website.

The existing web application and backend are valuable working systems.

Protect them.

---

# 30. CURRENT TASK — ANALYSIS ONLY

At the beginning of this project, do NOT create or modify application files.

Perform repository analysis only.

Inspect the existing:

```
/backend
/frontend
/frontend/android
/infra
/docs
```

Understand the existing application, APIs, authentication, roles, workflows, and relevant data models.

Then provide the complete Android architecture/API/screen analysis described above.

After presenting the analysis:

**STOP.**

Wait for the user's approval before creating `/mobile` or modifying any code.
