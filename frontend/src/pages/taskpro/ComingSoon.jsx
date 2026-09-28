import { FiBarChart2, FiLayers, FiSettings } from "react-icons/fi";
import { EmptyState } from "./ui";

const PAGES = {
  templates: {
    icon: FiLayers,
    title: "Task Templates",
    text: "Reusable task checklists — like a monthly collection follow-up — will live here.",
  },
  reports: {
    icon: FiBarChart2,
    title: "Reports",
    text: "Completion rates, overdue trends and time spent per person will show up here.",
  },
  settings: {
    icon: FiSettings,
    title: "Settings",
    text: "Notification rules, default priorities and task types will be configured here.",
  },
};

export default function ComingSoon({ page }) {
  const p = PAGES[page];
  return (
    <>
      <div className="tp-page-head">
        <div>
          <h1>{p.title}</h1>
          <p>Planned for a later phase</p>
        </div>
      </div>
      <EmptyState icon={p.icon} title={`${p.title} is coming soon`} text={p.text} />
    </>
  );
}
