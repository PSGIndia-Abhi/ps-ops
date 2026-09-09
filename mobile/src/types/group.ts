/**
 * Mirrors GET/POST /api/groups exactly (backend/src/routes/groups.routes.js).
 *
 * A "Group" here is a company-organization concept - a parent umbrella a
 * Company can optionally belong to (e.g. a franchise/chain owner). It has no
 * members and nothing to do with a Supervisor's team of technicians - that
 * concept already exists separately as "Team" (see types/team.ts,
 * screens/admin/TeamOverviewScreen). Confirmed from both the backend schema
 * (`group_name` table, no membership table referencing it) and the web
 * app's own description ("Define groups, legal companies, and their
 * physical sites" - frontend/src/pages/AdminCompanies.jsx).
 */
export interface Group {
  id: string;
  name: string;
  created_at: string;
}
