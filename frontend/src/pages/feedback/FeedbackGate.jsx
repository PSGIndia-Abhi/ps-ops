import { Navigate } from "react-router-dom";

// The Feedback Desk is opened by permission, not by role: anyone logged in may reach it, and
// FeedbackLayout asks GET /api/feedback/me which FEEDBACK_* permissions the user holds (admin can
// give them to any role in Roles & Permissions). Without one, the layout says so.
export default function FeedbackGate({ children }) {
  if (!localStorage.getItem("token")) return <Navigate to="/login" replace />;
  return children;
}
