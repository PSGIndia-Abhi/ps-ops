import { useEffect, useState } from "react";
import { apiFetch, fetchJsonWithFallback } from "../api";
import "./AdminTeamManagement.css";
import UsersTab from "../components/admin/UsersTab";
import TeamsTab from "../components/admin/TeamsTab";
import RolesTab from "../components/admin/RolesTab";
import useMe from "../hooks/useMe";

const branchEndpoints = ["/api/branches", "/branches"];


//normalize branches for dropdowns, handling both new / old API formats
// Do we relly need this? Can we just make sure the backend is sending the right format and not have this extra code in the frontend?  This seems like a band-aid for a backend issue that should be fixed at the source.  If we have to keep it, we should add some comments explaining why and when it can be removed.  Also we should add some error handling in case the data is not in either format, instead of just returning an empty array which could lead to silent failures in the UI.  Maybe log a warning or set an error state that can be displayed to the user.
function normalizeBranches(data) {
  if (!Array.isArray(data)) return [];
  if (data.length === 0) return [];
  if (data[0]?.admins) {
    return data.map((branch) => ({
      id: branch.id,
      name: branch.name,
    }));
  }


  //handle old format with potential duplicates by ID, keeping the first occurrence
  const map = new Map();
  data.forEach((row) => {
    if (!row?.id) return;
    if (!map.has(row.id)) {
      map.set(row.id, { id: row.id, name: row.name });
    }
  });
  return Array.from(map.values());
}

export default function AdminTeamManagement() {
//shared states
  const [supervisors, setSupervisors] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [error, setError] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const { user } = useMe();
  
  // Tab States
  const [activeTab, setActiveTab] = useState("users");


  // the sared data for the tabs are create in this component and passed down as props to the respective tabs, this includes the list of supervisors, unassigned technicians, branches and loading states for branches. The tabs can also call the loadOverview function to refresh the data after making changes.  This way we avoid unnecessary API calls and keep the data in sync across tabs.
  const loadOverview = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/teams/overview");
      if (!res?.ok) throw new Error("Failed to load team overview");
      const data = await res.json();
      setSupervisors(Array.isArray(data.supervisors) ? data.supervisors : []);
      setUnassigned(Array.isArray(data.unassignedTechnicians) ? data.unassignedTechnicians : []);
      await Promise.all([loadUsersData(), loadRolesData()]);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load team overview");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadUsersData() {
    try {
      const res = await apiFetch("/api/users");
      if (!res?.ok) {
        throw new Error("Failed to load users");
      }

      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load users");
    }
  }

  async function loadRolesData() {
    try {
      setRolesLoading(true);

      const [rolesRes, permissionsRes] = await Promise.all([
        apiFetch("/api/roles"),
        apiFetch("/api/roles/permissions"),
      ]);

      if (!rolesRes?.ok) {
        throw new Error("Failed to load roles");
      }

      if (!permissionsRes?.ok) {
        throw new Error("Failed to load permissions");
      }

      const rolesData = await rolesRes.json();
      const permissionsData = await permissionsRes.json();

      setRoles(Array.isArray(rolesData) ? rolesData : []);
      setPermissions(Array.isArray(permissionsData) ? permissionsData : []);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load role data");
    } finally {
      setRolesLoading(false);
    }
  }

  useEffect(() => {
    async function loadBranches() {
      try {
        setLoadingBranches(true);
        const data = await fetchJsonWithFallback(branchEndpoints);
        setBranches(normalizeBranches(data));
      } catch (err) {
        console.error(err);
        setBranches([]);
        setError(err.message || "Failed to load branches");
      } finally {
        setLoadingBranches(false);
      }
    }

    loadBranches();
  }, []);

  useEffect(() => {
    loadRolesData();
  }, []);

  useEffect(() => {
    loadUsersData();
  }, []);




  if (loading) {
    return <div className="team-page">Loading team overview...</div>;
  }

  return (
    <div className="team-page">


      <div className="team-tabs">
        <button onClick={() => setActiveTab("users")}>
          Users
        </button>

        <button onClick={() => setActiveTab("roles")}>
          Roles
        </button>

        <button onClick={() => setActiveTab("teams")}>
          Teams
        </button>
      </div>

      {activeTab === "users" && <UsersTab
  supervisors={supervisors}
  unassigned={unassigned}
  loadOverview={loadOverview}
  setError={setError}
  branches={branches}
  loadingBranches={loadingBranches}
  role={user?.role}
  roles={roles}
  users={users}
/>}
      {activeTab === "roles" && (
        <RolesTab
          roles={roles}
          permissions={permissions}
          loading={rolesLoading}
          loadRolesData={loadRolesData}
          setError={setError}
        />
      )}
    {activeTab === "teams" && (
  <TeamsTab
    supervisors={supervisors}
    unassigned={unassigned}
    loadOverview={loadOverview}
    setError={setError}
  />
)}
      {error && (
  <div className="team-error">
    Error: {error}
  </div>
)}
    </div>
  );
}
