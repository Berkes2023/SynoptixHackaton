export const SITE = {
  name: "DeepTrace",
  tagline: "Independent AI recruitment fairness auditing",
  motto: "Trace the decision. Detect the bias. Strengthen accountability.",
  description:
    "DeepTrace helps organisations independently examine AI-assisted recruitment outcomes, identify potential fairness risks, investigate disparities and document decisions with evidence.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://deeptrace-vert.vercel.app",
  repo: "https://github.com/Berkes2023/SynoptixHackaton",
};

/** Authenticated-app routes: excluded from the sitemap and disallowed in robots.txt. */
export const APP_ROUTES = ["/dashboard", "/imports", "/jobs", "/audits", "/fairness-lab", "/investigations", "/reports", "/settings", "/drift"];
