import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site/config";

/** Public marketing pages only; private workspace routes are excluded. */
const PUBLIC_ROUTES = [
  "",
  "/platform",
  "/demo",
  "/research",
  "/methodology",
  "/responsible-ai",
  "/security",
  "/privacy",
  "/about",
  "/contact",
  "/solutions/hr",
  "/solutions/recruitment-managers",
  "/solutions/compliance",
  "/solutions/ai-governance",
  "/solutions/enterprise",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path) => ({
    url: `${SITE.url}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : path === "/demo" ? 0.9 : 0.7,
  }));
}
