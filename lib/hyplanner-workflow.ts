/** Single source of truth for the HyPlanner journey (landing + /planner). */

export type WorkflowStep = {
  slug: string;
  displayId: string;
  title: string;
  tool: string | null;
  shortDescription: string;
  accentTool?: boolean;
};

export const WORKFLOW_STEPS: readonly WorkflowStep[] = [
  {
    slug: "problem",
    displayId: "00",
    title: "Define the challenge",
    tool: "Problem definition",
    shortDescription: "Clarify the use case, scope, constraints, and success criteria.",
  },
  {
    slug: "location",
    displayId: "01",
    title: "Identify the right location",
    tool: "Opportunity Map",
    shortDescription: "Infrastructure, policy, and demand signals in one view.",
  },
  {
    slug: "stakeholders",
    displayId: "02",
    title: "Map key stakeholders",
    tool: "Hydrogen Connect",
    shortDescription: "Register actors and relationships before commitments.",
  },
  {
    slug: "demand",
    displayId: "03",
    title: "Estimate hydrogen demand",
    tool: "H2 Calculator",
    shortDescription: "First-pass quantities and sensitivity bounds.",
  },
  {
    slug: "assessment",
    displayId: "04",
    title: "Assess project potential",
    tool: "Early Project Assessment",
    shortDescription: "Structured gate before deeper engineering spend.",
  },
  {
    slug: "capacity",
    displayId: "05",
    title: "Capacity building",
    tool: "Learning Platform",
    shortDescription: "Onboard teams on safety, markets, and operations.",
  },
  {
    slug: "expert",
    displayId: "06",
    title: "Get expert guidance",
    tool: null,
    shortDescription: "Review pack and targeted recommendations (where offered).",
  },
  {
    slug: "feedback",
    displayId: "07",
    title: "Shape what comes next",
    tool: "Feedback & co-development",
    shortDescription: "Prioritize roadmap inputs from deployed pilots.",
    accentTool: true,
  },
] as const;

export const WORKFLOW_STEP_COUNT = WORKFLOW_STEPS.length;
