import { useEffect, useState } from "react";
import { FiBriefcase, FiGitBranch, FiMail, FiMapPin, FiPhone, FiShield, FiUsers } from "react-icons/fi";
import OrgTree from "./OrgTree";
import { getMyHierarchy } from "./tasksApi";
import { useViewer } from "./viewerContext";
import { Avatar, Skeleton } from "./ui";

function Fact({ icon, label, children }) {
  const Icon = icon;
  return (
    <div className="tp-prof-fact">
      <span className="tp-prof-fact-icon">
        <Icon />
      </span>
      <span className="tp-prof-fact-text">
        <small>{label}</small>
        <strong>{children || <span className="tp-prof-none">Not set</span>}</strong>
      </span>
    </div>
  );
}

/**
 * The signed-in person's own profile: who they are, how to reach them, where
 * they sit in the organisation, who they report to and who reports to them.
 * Read-only, from GET /api/users/me/hierarchy (open to every signed-in user).
 */
export default function TaskProfile() {
  const viewer = useViewer();
  const [data, setData] = useState(undefined); // undefined = loading, null = unavailable

  useEffect(() => {
    let live = true;
    getMyHierarchy()
      .then((d) => live && setData(d))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, []);

  if (data === undefined) {
    return (
      <div className="tp-prof">
        <Skeleton height={170} radius={20} />
        <div className="tp-prof-grid">
          <Skeleton height={260} radius={16} />
          <Skeleton height={260} radius={16} />
        </div>
      </div>
    );
  }

  const user = data?.user || { name: viewer.name, role: viewer.role };
  const designation = data?.designation?.name;
  const unitPath = data?.unit?.path?.map((u) => u.name) || [];
  const dept = unitPath.length > 1 ? unitPath[unitPath.length - 1] : unitPath[0];
  const primary = data?.managers?.find((m) => m.is_primary) || data?.managers?.[0];
  const otherManagers = (data?.managers || []).filter((m) => m !== primary);
  // Top of the organisation first, down to this person: chain is
  // [direct manager, their manager, …], so reverse it and add "you".
  const chain = [
    ...[...(data?.chain || [])].reverse().map((m) => ({ key: m.id, name: m.name, sub: [m.designation, m.unit_name].filter(Boolean).join(" · ") })),
    { key: "me", name: user.name, sub: [designation, dept].filter(Boolean).join(" · "), me: true },
  ];
  const reports = data?.direct_reports || [];
  const teamCount = data?.team_count || 0;

  return (
    <div className="tp-prof">
      <section className="tp-prof-hero">
        <div className="tp-prof-who">
          <Avatar name={user.name} size={84} />
          <div className="tp-prof-id">
            <h1>{user.name}</h1>
            <p>{[designation, dept].filter(Boolean).join(" · ") || user.role}</p>
            <div className="tp-prof-tags">
              {data?.is_head ? <span className="tp-prof-tag strong">Head of {data.unit?.name}</span> : null}
              {teamCount > 0 && (
                <span className="tp-prof-tag">
                  <FiUsers /> Leads {teamCount} {teamCount === 1 ? "person" : "people"}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="tp-prof-contact">
          {user.email && (
            <a href={`mailto:${user.email}`}>
              <FiMail /> {user.email}
            </a>
          )}
          {user.phone && (
            <a href={`tel:${user.phone}`}>
              <FiPhone /> {user.phone}
            </a>
          )}
          {user.branch_name && (
            <span>
              <FiMapPin /> {user.branch_name}
            </span>
          )}
        </div>
      </section>

      {data === null && <p className="tp-desc muted">Some profile details couldn't be loaded right now.</p>}

      <div className="tp-prof-grid">
        <section className="tp-card">
          <div className="tp-card-head">
            <h3>About</h3>
          </div>
          <div className="tp-prof-facts">
            <Fact icon={FiBriefcase} label="Designation">
              {designation}
            </Fact>
            <Fact icon={FiGitBranch} label="Department">
              {dept}
            </Fact>
            <Fact icon={FiShield} label="Access role">
              {user.role}
            </Fact>
            <Fact icon={FiMapPin} label="Branch">
              {user.branch_name}
            </Fact>
            <Fact icon={FiMail} label="Email">
              {user.email}
            </Fact>
            <Fact icon={FiPhone} label="Phone">
              {user.phone}
            </Fact>
          </div>
          {unitPath.length > 1 && (
            <p className="tp-prof-path">
              {unitPath.map((name, i) => (
                <span key={`${name}-${i}`}>{name}</span>
              ))}
            </p>
          )}
        </section>

        <section className="tp-card">
          <div className="tp-card-head">
            <h3>Reporting line</h3>
          </div>
          {chain.length === 1 ? (
            <p className="tp-desc muted">You're at the top of the organisation. Nobody above you.</p>
          ) : (
            <ol className="tp-prof-chain">
              {chain.map((p, i) => (
                <li key={p.key} className={p.me ? "me" : ""} style={{ "--i": i }}>
                  <Avatar name={p.name} size={36} />
                  <span className="tp-prof-chain-text">
                    <strong>{p.me ? `${p.name} (you)` : p.name}</strong>
                    <small>{p.sub || "—"}</small>
                  </span>
                  {!p.me && i === chain.length - 2 && <em>Direct manager</em>}
                </li>
              ))}
            </ol>
          )}
          {otherManagers.length > 0 && (
            <p className="tp-prof-also">
              Also reports to <strong>{otherManagers.map((m) => m.name).join(", ")}</strong>
            </p>
          )}
        </section>
      </div>

      {/* The whole organisation below this person, as a tree (needs the org
          directory); falls back to the direct-report cards without it. */}
      {viewer.team.length > 0 && viewer.directory.size > 0 && (
        <OrgTree me={{ id: viewer.id, name: user.name, designation, dept }} team={viewer.team} directory={viewer.directory} />
      )}

      {reports.length > 0 && !(viewer.team.length > 0 && viewer.directory.size > 0) && (
        <section className="tp-card">
          <div className="tp-card-head">
            <h3>My team</h3>
            <small>
              {reports.length} direct {reports.length === 1 ? "report" : "reports"}
              {teamCount > reports.length ? ` · ${teamCount} people in total, including their teams` : ""}
            </small>
          </div>
          <div className="tp-prof-team">
            {reports.map((r) => (
              <div key={r.line_id} className="tp-prof-member">
                <Avatar name={r.name} size={40} />
                <span className="tp-prof-member-text">
                  <strong>{r.name}</strong>
                  <small>{[r.designation, r.unit_name].filter(Boolean).join(" · ") || "—"}</small>
                  {!r.is_primary && <em>Secondary line</em>}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
