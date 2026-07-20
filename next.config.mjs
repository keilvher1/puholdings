/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // 청구서 PDF 렌더링(@react-pdf/renderer)이 서버리스에서 한글 폰트를 읽도록 번들에 포함
  outputFileTracingIncludes: {
    "/api/admin/billing/bills/issue": ["./public/fonts/**"],
    "/api/admin/billing/bills/preview": ["./public/fonts/**"],
  },
  // @react-pdf/renderer는 서버 외부 패키지로 처리
  serverExternalPackages: ["@react-pdf/renderer"],
}

export default nextConfig
