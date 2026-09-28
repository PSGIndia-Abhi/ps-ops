import { useMemo } from "react";
import { canSeeTask } from "./hierarchy";
import { useTaskStore } from "./tasksApi";
import { useViewer } from "./viewerContext";

/** Only the tasks the current viewer is allowed to see. */
export default function useVisibleTasks() {
  const { tasks, ready } = useTaskStore();
  const viewer = useViewer();
  const visible = useMemo(() => tasks.filter((t) => canSeeTask(viewer.id, t)), [tasks, viewer.id]);
  return { tasks: visible, ready };
}
