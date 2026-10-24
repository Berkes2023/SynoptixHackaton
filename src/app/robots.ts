import type { MetadataRoute } from "next";
import { APP_ROUTES, SITE } from "@/lib/site/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...APP_ROUTES, "/api/"] }],
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
