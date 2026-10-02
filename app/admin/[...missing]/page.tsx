import AdminNotFound from "../not-found"

// 관리자 영역의 없는 주소(/admin/없는-화면)를 관리자 셸(사이드바) 안의 "찾는 화면이 없어요"(app/admin/not-found.tsx)로 그린다.
// 이 잡이 경로가 없으면 Next는 루트 404(공개 사이트 모양)를 그린다. 로그인 안 된 경우는 미들웨어가 먼저 로그인 화면으로 보낸다.
// notFound()를 던지지 않고 같은 화면을 바로 그린다 — app/admin/loading.tsx 때문에 응답 코드는 어차피 200이고,
// 개발 서버에서 notFound()가 "Performance.measure … negative time stamp" 페이지 오류를 내기 때문이다.
export const metadata = { title: "찾는 화면이 없어요", robots: { index: false } }

export default function AdminMissingPage() {
  return <AdminNotFound />
}
