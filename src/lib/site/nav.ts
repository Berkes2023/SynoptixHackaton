import type { IconName } from "@/components/Icon";

export interface NavItem {
  label: string;
  href: string;
  description: string;
  icon: IconName;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Public marketing navigation (mega menu). Every href is a real route or in-page anchor. */
export const MEGA_MENU: NavGroup[] = [
  {
    label: "Product",
    items: [
      { label: "Platform Overview", href: "/platform", description: "How the modules fit together", icon: "layers" },
      { label: "Fairness Audit Lab", href: "/platform#audit-lab", description: "Reproducible group-fairness statistics", icon: "chart" },
      { label: "Counterfactual Testing Studio", href: "/platform#counterfactual", description: "Matched synthetic CVs, one cue changed", icon: "flask" },
      { label: "Investigations", href: "/platform#investigations", description: "Human review with a full audit trail", icon: "scale" },
      { label: "Audit Reports", href: "/platform#reports", description: "Evidence packs with provenance", icon: "file" },
      { label: "ATS Data Hub", href: "/platform#data-hub", description: "Read-only CSV and JSON imports", icon: "database" },
    ],
  },
  {
    label: "Solutions",
    items: [
      { label: "For HR Teams", href: "/solutions/hr", description: "Make AI-assisted hiring accountable", icon: "users" },
      { label: "For Recruitment Managers", href: "/solutions/recruitment-managers", description: "See how each requisition screens", icon: "briefcase" },
      { label: "For Compliance Officers", href: "/solutions/compliance", description: "Documented, reproducible evidence", icon: "shield" },
      { label: "For AI Governance Teams", href: "/solutions/ai-governance", description: "Monitor screening behaviour over time", icon: "gauge" },
      { label: "For Enterprise Organisations", href: "/solutions/enterprise", description: "Consistent reviews across departments", icon: "building" },
    ],
  },
  {
    label: "Trust & Security",
    items: [
      { label: "Security Overview", href: "/security", description: "Controls and their honest status", icon: "lock" },
      { label: "Privacy & Data Protection", href: "/privacy", description: "Minimisation, roles and DPIAs", icon: "eye" },
      { label: "Fairness Methodology", href: "/methodology", description: "Exactly how every metric is computed", icon: "book" },
      { label: "Human Oversight", href: "/responsible-ai#human-oversight", description: "People decide; DeepTrace evidences", icon: "users" },
      { label: "Responsible AI", href: "/responsible-ai", description: "What metrics can and cannot prove", icon: "compass" },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "Why DeepTrace", href: "/#why", description: "The case for independent auditing", icon: "info" },
      { label: "Research & Evidence", href: "/research", description: "Sourced studies and guidance", icon: "book" },
      { label: "How It Works", href: "/#how-it-works", description: "From import to signed-off report", icon: "arrowRight" },
      { label: "Interactive Demo", href: "/demo", description: "Run a real audit on fictional data", icon: "play" },
      { label: "About DeepTrace", href: "/about", description: "Who builds it and why", icon: "building" },
      { label: "Related Projects", href: "/about#projects", description: "Our other hackathon work", icon: "folder" },
    ],
  },
];

export const FEATURED_CTA = {
  title: "Run a real audit in two minutes",
  body: "A guided walkthrough on fictional data: real statistics, a real investigation and a real report. No sign-up.",
  href: "/demo",
  cta: "Launch Interactive Demo",
};

/** Authenticated application navigation (sidebar). Kept separate from marketing navigation. */
export const APP_NAV: { label: string; href: string; icon: IconName; section: "Audit" | "Governance" | "Workspace" }[] = [
  { label: "Overview", href: "/dashboard", icon: "home", section: "Audit" },
  { label: "Data Hub", href: "/imports", icon: "database", section: "Audit" },
  { label: "Jobs", href: "/jobs", icon: "briefcase", section: "Audit" },
  { label: "Audit Lab", href: "/audits", icon: "chart", section: "Audit" },
  { label: "Counterfactual Studio", href: "/fairness-lab", icon: "flask", section: "Audit" },
  { label: "Investigations", href: "/investigations", icon: "scale", section: "Governance" },
  { label: "Reports", href: "/reports", icon: "file", section: "Governance" },
  { label: "Bias Drift", href: "/drift", icon: "trend", section: "Governance" },
  { label: "Settings", href: "/settings", icon: "settings", section: "Workspace" },
];
