import type { MetadataRoute } from "next";
import { SITIO_URL } from "./lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITIO_URL}/sitemap.xml`,
  };
}
