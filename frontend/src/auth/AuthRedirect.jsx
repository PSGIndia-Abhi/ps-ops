import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { roleBasePath } from "./roleBasePath";

export default function AuthRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");

    // no token → login
    if (!token) {
      navigate("/login");
      return;
    }

    // no role → login
    if (!role) {
      console.warn("Missing role, redirecting to login");
      navigate("/login");
      return;
    }

    const path = roleBasePath(role);

    // invalid role mapping → login
    if (!path) {
      console.warn("Invalid role:", role);
      navigate("/login");
      return;
    }

    // slight delay to stabilize app state
    setTimeout(() => {
      navigate(path);
    }, 50);

  }, []);

  return null;
}