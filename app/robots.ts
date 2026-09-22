import type { MetadataRoute } from "next"

const SITE_URL = process.env.APP_URL || "https://www.puholdings.co.kr"

// 관리자·입주기업 포털·API는 색인에서 제외한다.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/portal/", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
