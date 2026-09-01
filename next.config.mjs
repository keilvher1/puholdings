/** @type {import('next').NextConfig} */
const nextConfig = {
  // 청구서 PDF 렌더링(@react-pdf/renderer)이 서버리스에서 한글 폰트를 읽도록 번들에 포함
  outputFileTracingIncludes: {
    // renderInvoicePdf를 호출하는 라우트는 모두 등록해 둔다. 지금은 트레이서가 자동으로 잡지만
    // (빌드 산출물 route.js.nft.json에서 확인) process.cwd() 기반 동적 경로라 보장은 아니다.
    "/api/admin/billing/bills/issue": ["./public/fonts/**", "./public/seal.png"],
    "/api/admin/billing/bills/preview": ["./public/fonts/**", "./public/seal.png"],
    "/api/admin/billing/bills/download": ["./public/fonts/**", "./public/seal.png"],
  },
  // @react-pdf/renderer는 서버 외부 패키지로 처리
  serverExternalPackages: ["@react-pdf/renderer"],
}

export default nextConfig
