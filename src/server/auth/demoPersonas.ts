import "server-only";
import { capabilitiesFor, type Role } from "./policy";

export const DEMO_PERSONAS = {
  presenter: {
    id: "presenter", label: "Presenter", account_id: "ACC-PRESENTER", username: "presenter",
    roles: ["REVIEWER", "SIMULATION_CONTROLLER"] as Role[], staff_id: "STF-0007",
    description: "Explore prepared investigations and present the evidence trail.",
  },
  operator: {
    id: "operator", label: "Operator", account_id: "ACC-OP-TUNDE", username: "operator-tunde",
    roles: ["OPERATOR"] as Role[], staff_id: "STF-0101",
    description: "Explain your own mapped action with genuine ticket evidence.",
  },
  reviewer: {
    id: "reviewer", label: "Independent Reviewer", account_id: "ACC-REV-ADA", username: "reviewer-ada",
    roles: ["REVIEWER"] as Role[], staff_id: "STF-0007",
    description: "Inspect evidence and decide eligible simulated controls independently.",
  },
  auditor: {
    id: "auditor", label: "Auditor", account_id: "ACC-AUDITOR", username: "auditor",
    roles: ["AUDITOR"] as Role[], staff_id: null,
    description: "Read pseudonymised investigations and audit history without mutations.",
  },
} as const;

export type DemoPersonaId = keyof typeof DEMO_PERSONAS;
export const demoPersona = (value: string) => Object.prototype.hasOwnProperty.call(DEMO_PERSONAS, value)
  ? DEMO_PERSONAS[value as DemoPersonaId]
  : null;

export const publicDemoPersonas = () => Object.values(DEMO_PERSONAS).map(({ id, label, roles, description }) => ({ id, label, roles, capabilities: capabilitiesFor([...roles]), description }));
