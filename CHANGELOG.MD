# Changelog

All notable changes to the PS Ops Platform will be documented in this file.

---

## [dev-v2] - 2026-03-05

### Technician Dashboard
- Technicians now only see jobs that have a **visit scheduled for today**.
- Job page now displays **only today's visit assigned to the technician**.
- If no visit exists for today, the job is **hidden from the technician view**.
- Technicians can **start and submit visits**, but cannot control the main job status.

### Visit Logic
- Visit filtering implemented based on:
  - `scheduled_date`
  - assigned technician
  - current date.
- Fixed timezone mismatch when comparing visit date with today's date.

### Role Permissions
- Technicians can no longer:
  - change main job status
  - schedule visits
  - modify team assignments
- Supervisors retain visit management capabilities.

### Booking Creation
- Fixed booking creation bug where:
  - `technician_id` column was missing.
- Fixed `visitId is not defined` error during visit creation.

### Login / Auth
- Technician user ID now derived directly from **JWT token payload**.
- Added **Signup link** on login screen.
git push origin dev-v2
### UI Improvements
- Contact selector in **Create Booking** merged into a single searchable dropdown.
- Fixed contact search dropdown closing behavior after selection.
- Technician job cards simplified to remove status controls.

### Internal
- Improved visit debug logging for development.
- Cleaned up role condition checks in job page.