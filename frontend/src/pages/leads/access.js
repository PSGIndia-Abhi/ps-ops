// Who may open the Lead Management area, and which dashboard each role gets.
//
// Like pages/taskpro/access.js this is only a client-side gate: it decides
// what the UI shows, never what the server allows. Mirrored by ROLE_HOME in
// auth/roleBasePath.js so these roles land here on login.

export const LEADS_HOME = "/leads";

/** The four people in the lead flow. `sales` is the existing sales role. */
export const PERSONAS = {
  lead_provider: {
    key: "lead_provider",
    label: "Lead Provider",
    area: "Lead Provider Portal",
    blurb: "Submit commercial leads and follow their progress",
  },
  telecaller: {
    key: "telecaller",
    label: "Telecaller",
    area: "Lead Management",
    blurb: "Call, verify and hand genuine leads to sales",
  },
  sales: {
    key: "sales",
    label: "Sales Executive",
    area: "Lead Management",
    blurb: "Your leads, meetings and follow-ups",
  },
  sales_manager: {
    key: "sales_manager",
    label: "Sales Manager",
    area: "Lead Management",
    blurb: "Pipeline, team performance and providers",
  },
};

export const PERSONA_KEYS = Object.keys(PERSONAS);

/**
 * Roles allowed through the route guard. `admin` is here so an administrator
 * can open the area and look at every dashboard; it is not a persona itself.
 */
export const LEADS_ROLES = [...PERSONA_KEYS, "admin"];

const PREVIEW_KEY = "lm.previewPersona";

/** True when the signed-in role is one of the four personas (so it is fixed). */
export const roleIsPersona = (role) => PERSONA_KEYS.includes(role);

/**
 * The persona to render. A real lead role always gets its own dashboard.
 * Anyone else allowed in (admin) picks which dashboard to look at; that
 * choice is remembered for the browser tab only.
 */
export function resolvePersona(role) {
  if (roleIsPersona(role)) return role;
  const saved = sessionStorage.getItem(PREVIEW_KEY);
  return PERSONA_KEYS.includes(saved) ? saved : "sales_manager";
}

export function savePreviewPersona(persona) {
  sessionStorage.setItem(PREVIEW_KEY, persona);
}
