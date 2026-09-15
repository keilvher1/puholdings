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
  // next/image는 여기 등록된 호스트만 최적화한다. 비어 있으면 외부 이미지가
  // 400(INVALID_IMAGE_OPTIMIZE_REQUEST)으로 깨진다 — Blob에 올린 로고·사진용.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
}

export default nextConfig
