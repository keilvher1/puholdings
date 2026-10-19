// 로그인 화면 왼쪽 그림 판(관리자·포털 공용, SaaS 테마 2026-10). 1024px 이상에서만 보인다.
// 리뉴얼 홈 첫 화면(components/home/home-page.tsx HeroSection)과 같은 포항 바다 사진·남색 덮개·문구를 쓴다.
//   사진: public/brand/login-hero.jpg(홈 public/home/hero.png를 1280px·JPEG로 줄인 것, 40KB). 배경 그림이라
//         판이 숨는 휴대폰에서는 받지 않는다.
//   글자 색 #d4ecfa·#d4e0eb·#c5d3de는 홈 첫 화면 문구 색 그대로다 — 사진 위 전용이라 토큰으로 빼지 않았다.
// 서버·클라이언트 공용(훅 없음).
//
// 사용 예:
//   <div className="flex min-h-screen bg-card">
//     <BrandPhotoPanel eyebrow="PU Holdings Admin" description="입주기업 관리비·증빙·프로그램·소통을 한곳에서 관리해요" />
//     <div className="flex flex-1 …">…폼…</div>
//   </div>

export function BrandPhotoPanel({ eyebrow, description }: { eyebrow: string; description: string }) {
  return (
    <div
      className="relative hidden w-[44%] max-w-[640px] shrink-0 flex-col justify-between overflow-hidden bg-dark bg-cover bg-[62%_center] p-10 text-white lg:flex xl:p-14"
      style={{ backgroundImage: "url(/brand/login-hero.jpg)" }}
      data-surface="dark"
    >
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,#041a2cb3,#041a2c40_45%,#041a2ce6)]" />
      <img src="/brand/pu-holdings-logo-white.png" alt="포항연합기술지주" width={473} height={93} className="relative h-9 w-auto self-start" />
      <div className="relative">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-[#d4ecfa]">{eyebrow}</p>
        <p className="mt-6 text-[34px] font-semibold leading-[1.4] tracking-[-0.03em] [word-break:keep-all] xl:text-[40px]">
          지역의 가능성을 발굴하고,
          <br />
          투자로 성장을 연결합니다.
        </p>
        <p className="mt-5 text-base leading-relaxed text-[#d4e0eb] [word-break:keep-all]">{description}</p>
      </div>
      <div className="relative flex items-end justify-between gap-6 border-t border-white/25 pt-5 text-[11px] tracking-[0.12em] text-[#c5d3de]">
        <span>UNIVERSITY TECHNOLOGY HOLDINGS &amp; ACCELERATOR</span>
        {/* 서버(UTC)와 브라우저(한국 시간)의 해가 1월 1일 0~9시에 다를 수 있다 — 글자만 다르니 경고를 끈다 */}
        <span className="shrink-0 tracking-normal" suppressHydrationWarning>
          © {new Date().getFullYear()} 포항연합기술지주
        </span>
      </div>
    </div>
  )
}
