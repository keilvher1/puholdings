import { Footer, type ContactInfo } from "@/components/sections/footer"
import { getSiteContent } from "@/lib/site-content"

// 서버에서 연락처 싱글턴을 조회해 Footer에 주입하는 래퍼.
// 클라이언트 컴포넌트 내부에서는 사용할 수 없으므로, 그 경우 페이지가 contact를 조회해 직접 전달한다.
export async function SiteFooter() {
  const contact = await getSiteContent<ContactInfo>("contact")
  return <Footer contact={contact ?? undefined} />
}
