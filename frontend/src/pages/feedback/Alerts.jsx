import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { FEEDBACK_HOME } from "./access";
import { getSchedules } from "./feedbackApi";
import { useFeedbackAccess } from "./feedbackContext";
import { EndedSchedules } from "./ScheduleMaster";
import { Empty, ErrorBox, Loading, PageHead } from "./ui";

// Alerts: what needs action on the desk. For now the call schedules that have ended (no more
// feedback calls are made for them): schedule the calls again, or close the schedule. The sidebar's
// Alerts item shows how many there are.
export default function Alerts() {
  const { reloadBadges } = useFeedbackAccess();
  // Opened from the Call schedule's "Ended" tile: a back arrow returns there.
  const fromSchedule = useLocation().state?.from === "schedule";
  const [schedules, setSchedules] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    getSchedules()
      .then((d) => {
        setSchedules(d.schedules || []);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  const changed = () => {
    load();
    reloadBadges?.();
  };
  const ended = (schedules || []).filter((x) => x.ended);

  return (
    <>
      <PageHead title="Alerts" sub="Call schedules that need action" back={fromSchedule ? `${FEEDBACK_HOME}/schedule` : undefined} />
      <ErrorBox error={error} onRetry={load} />
      {!schedules && !error ? (
        <Loading />
      ) : (
        <>
          <EndedSchedules schedules={schedules || []} onChanged={changed} />
          {!ended.length && !error && <Empty title="No alerts" text="Every call schedule is running. Ended schedules show here to schedule again or close." />}
        </>
      )}
    </>
  );
}
