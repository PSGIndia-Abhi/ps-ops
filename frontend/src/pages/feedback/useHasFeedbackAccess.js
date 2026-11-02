import { useEffect, useState } from "react";
import { apiFetch } from "../../api";

/**
 * True when the signed-in user's role holds any FEEDBACK_* permission (admin gives them in
 * Roles & Permissions), so other panels can show a link to the Feedback Desk.
 */
export default function useHasFeedbackAccess() {
  const [has, setHas] = useState(false);
  useEffect(() => {
    let live = true;
    apiFetch("/api/feedback/me")
      .then((res) => res?.ok && res.json())
      .then((me) => live && setHas(Boolean(me?.permissions?.length)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return has;
}
