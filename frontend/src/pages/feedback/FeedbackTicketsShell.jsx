import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { getDepartments, getMyAccess } from "./feedbackApi";
import { FeedbackContext } from "./feedbackContext";
import { ErrorBox, Loading } from "./ui";
import "./feedback.css";

// Customer Feedback tickets inside another panel (Task Management's "Tickets"), for people who only
// work tickets: a department's team (e.g. Accounts - FEEDBACK_DEPT) and the supervisors /
// salespeople a ticket's next step is assigned to (FEEDBACK_ASSIGNED). It gives the ticket pages
// (TicketList, TicketPage) what FeedbackLayout gives them on the Feedback Desk; base = this route.
const DESK = ["FEEDBACK_VIEW", "FEEDBACK_MANAGE", "FEEDBACK_ADMIN"];
const WORKERS = ["FEEDBACK_COLLECT", ...DESK];

export default function FeedbackTicketsShell({ base }) {
  const [access, setAccess] = useState(null);
  const [departmentList, setDepartmentList] = useState([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    getMyAccess()
      .then((a) => {
        setAccess(a);
        setError("");
      })
      .catch((err) => setError(err.status === 403 ? "No feedback tickets for you yet." : err.message));
  }, []);
  useEffect(load, [load]);
  const loadDepartments = useCallback(() => {
    getDepartments()
      .then((d) => setDepartmentList(d.departments || []))
      .catch(() => {});
  }, []);
  useEffect(loadDepartments, [loadDepartments]);

  const context = useMemo(() => {
    const permissions = access?.permissions || [];
    return {
      permissions,
      userId: access?.user_id ?? null,
      role: access?.role ?? null,
      can: (p) => permissions.includes(p),
      isDesk: DESK.some((p) => permissions.includes(p)),
      departments: access?.departments || [],
      departmentList,
      reloadDepartments: loadDepartments,
      deptOnly: !WORKERS.some((p) => permissions.includes(p)),
      ticketsBase: base,
    };
  }, [access, departmentList, loadDepartments, base]);

  return (
    <div className="fb-embed">
      {access ? (
        <FeedbackContext.Provider value={context}>
          <Outlet />
        </FeedbackContext.Provider>
      ) : error ? (
        <ErrorBox error={error} onRetry={load} />
      ) : (
        <Loading />
      )}
    </div>
  );
}
