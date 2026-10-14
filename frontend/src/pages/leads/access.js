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
    blurb: "Submit commercial leads",
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
 * Login roles that open a persona under another name. `commercial_sales` is the
 * commercial sales executive (the server's SALES_EXECUTIVE_ROLES; the Android app
 * maps it the same way); "sales" stays the sales persona as before.
 */
export const ROLE_ALIASES = { commercial_sales: "sales" };

/** Every login role that is a lead persona, by its own name or an alias. */
const LEAD_ROLE_NAMES = [...PERSONA_KEYS, ...Object.keys(ROLE_ALIASES)];

/**
 * Roles allowed through the route guard. `admin` is here so an administrator
 * can open the area from the admin panel; it is not a persona itself.
 */
export const LEADS_ROLES = [...LEAD_ROLE_NAMES, "admin"];

/** True when the signed-in role is one of the four personas (so it is fixed). */
export const roleIsPersona = (role) => LEAD_ROLE_NAMES.includes(role);

/**
 * The persona to render. A real lead role always gets its own dashboard; an
 * admin always gets the sales manager's, the one that oversees the pipeline.
 * (Each other dashboard is seen by signing in with that role.)
 */
export function resolvePersona(role) {
  if (ROLE_ALIASES[role]) return ROLE_ALIASES[role];
  return PERSONA_KEYS.includes(role) ? role : "sales_manager";
}
