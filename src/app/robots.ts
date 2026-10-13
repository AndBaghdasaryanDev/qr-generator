import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/r/", "/manage/", "/watch/", "/library"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
