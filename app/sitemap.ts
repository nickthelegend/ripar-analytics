import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://analytics.ripar.io", changeFrequency: "hourly", priority: 1 }];
}
