import { useState, useMemo } from "react";
import { apiFetch } from "../../api";
import "../../styles/teams.css";

function ManageTechniciansModal({
  supervisor,
  allTechnicians = [],
  currentTechs = [],
  onClose,
  onSave,
  saving = false,
}) {
  const [selectedTechs, setSelectedTechs] = useState(
    currentTechs.map((t) => Number(t.id))
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBranch, setFilterBranch] = useState("");

  // Get all unique branches
  const branches = useMemo(() => {
    const branches = new Set(
      allTechnicians.map((t) => t.branch_name).filter(Boolean)
    );
    return Array.from(branches).sort();
  }, [allTechnicians]);

  // Filter technicians based on search and branch
  const filteredTechs = useMemo(() => {
    return allTechnicians.filter((tech) => {
      const matchesSearch =
        !searchQuery ||
        tech.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tech.email?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesBranch = !filterBranch || tech.branch_name === filterBranch;

      return matchesSearch && matchesBranch;
    });
  }, [allTechnicians, searchQuery, filterBranch]);

  // Separate assigned and unassigned
  const assigned = filteredTechs.filter((t) => selectedTechs.includes(Number(t.id)));
  const unassigned = filteredTechs.filter((t) => !selectedTechs.includes(Number(t.id)));

  function toggleTech(techId) {
    setSelectedTechs((prev) => {
      const id = Number(techId);
      if (prev.includes(id)) {
        return prev.filter((t) => t !== id);
      } else {
        return [...prev, id];
      }
    });
  }

  function selectAll() {
    setSelectedTechs(filteredTechs.map((t) => Number(t.id)));
  }

  function deselectAll() {
    setSelectedTechs([]);
  }

  async function handleSave() {
    await onSave(selectedTechs);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Manage Team</h2>
            <p className="modal-subtitle">
              {supervisor.name} • {supervisor.email}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Search & Filter */}
        <div className="modal-filters">
          <div className="filter-group">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="filter-search"
            />
          </div>

          <div className="filter-group">
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              className="filter-select"
            >
              <option value="">All Branches</option>
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-actions">
            <button className="filter-btn small" onClick={selectAll}>
              Select All
            </button>
            <button className="filter-btn small secondary" onClick={deselectAll}>
              Clear All
            </button>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="modal-body">
          {/* Assigned Technicians */}
          <div className="tech-column">
            <div className="tech-column-header">
              <h3>Assigned ({assigned.length})</h3>
            </div>

            <div className="tech-list">
              {assigned.length === 0 ? (
                <div className="tech-empty">No technicians assigned yet</div>
              ) : (
                assigned.map((tech) => (
                  <div key={tech.id} className="tech-item assigned">
                    <div className="tech-item-info">
                      <div className="tech-item-name">{tech.name}</div>
                      <div className="tech-item-email">{tech.email}</div>
                      <div className="tech-item-meta">
                        <span className="tech-badge">{tech.role || "Technician"}</span>
                        <span className="tech-branch">{tech.branch_name}</span>
                      </div>
                    </div>
                    <button
                      className="tech-remove-btn"
                      onClick={() => toggleTech(tech.id)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Available Technicians */}
          <div className="tech-column">
            <div className="tech-column-header">
              <h3>Available ({unassigned.length})</h3>
            </div>

            <div className="tech-list">
              {unassigned.length === 0 ? (
                <div className="tech-empty">No available technicians</div>
              ) : (
                unassigned.map((tech) => (
                  <label key={tech.id} className="tech-item">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => toggleTech(tech.id)}
                    />
                    <div className="tech-item-info">
                      <div className="tech-item-name">{tech.name}</div>
                      <div className="tech-item-email">{tech.email}</div>
                      <div className="tech-item-meta">
                        <span className="tech-badge">{tech.role || "Technician"}</span>
                        <span className="tech-branch">{tech.branch_name}</span>
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamsTab({
  supervisors = [],
  unassigned = [],
  loadOverview,
  setError,
}) {
  const [savingSupervisorId, setSavingSupervisorId] = useState(null);
  const [activeSupervisorId, setActiveSupervisorId] = useState(null);

  // All technicians (assigned + unassigned)
  const allTechnicians = useMemo(() => {
    const all = [...unassigned];
    supervisors.forEach((sup) => {
      (sup.technicians || []).forEach((tech) => {
        if (!all.find((t) => Number(t.id) === Number(tech.id))) {
          all.push(tech);
        }
      });
    });
    return all;
  }, [supervisors, unassigned]);

  const activeSupervisor = supervisors.find(
    (s) => Number(s.id) === Number(activeSupervisorId)
  );

  async function saveTeam(selectedTechs) {
    if (!activeSupervisor) return;
    try {
      setSavingSupervisorId(activeSupervisor.id);
      const res = await apiFetch("/api/teams", {
        method: "POST",
        body: JSON.stringify({
          supervisorId: activeSupervisor.id,
          technicianIds: selectedTechs,
        }),
      });
      if (!res?.ok) throw new Error("Failed to save team");
      await loadOverview();
      setActiveSupervisorId(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to save team");
    } finally {
      setSavingSupervisorId(null);
    }
  }

  return (
    <div className="team-page">
      {/* Supervisors Grid */}
      <div className="team-supervisor-grid">
        {supervisors.map((supervisor) => (
          <div key={supervisor.id} className="team-card">
            <div className="team-card-header">
              <div>
                <div className="team-card-title">
                  {supervisor.name || "Supervisor"}
                </div>
                <div className="team-card-subtitle">
                  {supervisor.email || `ID ${supervisor.id}`}
                </div>
              </div>
              <div className="team-card-count">
                {supervisor.technicians?.length || 0}
              </div>
            </div>

            <div className="team-card-body">
              {(supervisor.technicians || []).length === 0 && (
                <div className="team-empty">No technicians assigned yet.</div>
              )}

              {(supervisor.technicians || []).map((tech) => (
                <div key={tech.id} className="team-tech-row compact">
                  <div className="team-tech-info">
                    <div className="team-tech-name">
                      {tech.name || "Unnamed technician"}
                    </div>
                    <div className="team-tech-email">
                      {tech.email || `ID ${tech.id}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              className="team-manage-btn"
              onClick={() => setActiveSupervisorId(supervisor.id)}
            >
              Manage Technicians
            </button>
          </div>
        ))}
      </div>

      {/* Unassigned Technicians Card */}
      <div className="team-card">
        <div className="team-card-header">
          <div>
            <div className="team-card-title">Unassigned Technicians</div>
            <div className="team-card-subtitle">
              Technicians not attached to any supervisor.
            </div>
          </div>
          <div className="team-card-count">{unassigned.length}</div>
        </div>

        <div className="team-list">
          {unassigned.length === 0 && (
            <div className="team-empty">No unassigned technicians.</div>
          )}

          {unassigned.map((tech) => (
            <div key={tech.id} className="team-tech-row">
              <div className="team-tech-info">
                <div className="team-tech-name">
                  {tech.name || `Technician ${tech.id}`}
                </div>
                <div className="team-tech-email">{tech.email || `ID ${tech.id}`}</div>
              </div>
              <div className="team-list-meta">
                <span className="team-role-badge">{tech.role || "Technician"}</span>
                <span>{tech.branch_name || "No branch"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {activeSupervisor && (
        <ManageTechniciansModal
          supervisor={activeSupervisor}
          allTechnicians={allTechnicians}
          currentTechs={activeSupervisor.technicians || []}
          onClose={() => setActiveSupervisorId(null)}
          onSave={saveTeam}
          saving={savingSupervisorId === activeSupervisor.id}
        />
      )}
    </div>
  );
}
