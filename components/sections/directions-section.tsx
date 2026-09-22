"use client"

import { useEffect, useState } from "react"
import { BlurFade } from "@/components/magicui/blur-fade"
import {
  MapPin,
  Phone,
  Copy,
  Check,
  SquareParking,
  TrainFront,
  Bus,
  Car,
  ArrowUpRight,
} from "lucide-react"
import {
  directionsLinks,
  mapEmbedUrl,
  resolveLocation,
} from "@/lib/directions"
import { DEFAULT_CONTACT } from "@/components/sections/footer"

interface DirectionsContact {
  address?: string
  phone?: string
  map_lat?: unknown
  map_lng?: unknown
  parking?: string
}

const DEFAULT_PARKING = "건물 앞 지상 주차장 이용"

// 교통편 안내는 한동대학교 공식 '오시는 길' 안내를 근거로 한 고정 콘텐츠다.
// 관리자 편집 필드로 노출하지 않는다 — 미시드 상태에서 관리자 화면이 빈 입력창으로 보이면서
// 사이트에는 기본값이 렌더되어 실제 화면과 어긋나기 때문(components/admin/content-field.tsx의 stringlist 렌더링).
const ROUTES = [
  {
    icon: TrainFront,
    title: "KTX 포항역에서",
    steps: [
      "택시 약 15~20분",
      "버스: 포항역 정류장에서 9000번 승차 → 청소년수련관에서 302번 환승 → 한동대학교 하차",
    ],
    note: "302번은 포항역을 경유하지 않아 환승이 필요합니다.",
  },
  {
    icon: Bus,
    title: "고속·시외버스터미널에서",
    steps: [
      "고속버스터미널: 터미널 좌측 100m 정류소에서 302번 승차 → 한동대학교(종점) 하차",
      "시외버스터미널: 길 건너 정류소에서 302번 승차 → 한동대학교 하차",
    ],
    note: "302번 첫차 05:20 · 막차 22:50 · 배차 약 15~20분",
  },
  {
    icon: Car,
    title: "자가용으로",
    steps: [
      "서울·대전·대구 방면: 경부고속도로 → 도동분기점 → 대구·포항고속도로 → 영일만항 배후도로 → 한동대학교",
      "부산 방면: 경부고속도로 → 경주 → 7번 국도 → 포항시 우회도로 → 한동대학교",
    ],
    note: "캠퍼스 진입 후 창업보육센터(사무동) 건물로 오시면 됩니다.",
  },
] as const

export function DirectionsSection({ contact }: { contact?: DirectionsContact } = {}) {
  const address = contact?.address || DEFAULT_CONTACT.address
  const phone = contact?.phone || DEFAULT_CONTACT.phone
  const parking = contact?.parking === undefined ? DEFAULT_PARKING : contact.parking
  const location = resolveLocation(contact)
  const links = directionsLinks(location)

  // 지도 iframe은 클릭 전까지 비활성 — 모바일에서 스크롤을 가로채지 않게 한다.
  const [mounted, setMounted] = useState(false)
  const [mapActive, setMapActive] = useState(false)
  const [copied, setCopied] = useState(false)

  // JS가 실행되기 전에는 오버레이를 그리지 않는다. 그리면 해제할 방법이 없어 지도가 영구 잠긴다.
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
    } catch {
      // 클립보드 접근이 막힌 브라우저에서는 조용히 무시한다.
    }
  }

  return (
    <section
      id="directions"
      className="relative scroll-mt-28 border-t border-warm-tan bg-warm-ivory py-28 lg:py-40"
    >
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* 헤더 */}
        <BlurFade delay={0.1}>
          <div className="mb-6 flex items-center gap-4">
            <div className="editorial-rule" />
            <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
              DIRECTIONS
            </span>
          </div>
          <h2 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight text-foreground lg:text-5xl text-balance [word-break:keep-all]">
            {"한동대학교 캠퍼스 안, "}
            <span className="text-gold">{"창업보육센터"}</span>
            {"에 있습니다."}
          </h2>
        </BlurFade>

        {/* 주소 · 전화 · 주차 */}
        <BlurFade delay={0.2}>
          <div className="mt-12 grid gap-8 border-t border-warm-tan pt-10 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-start gap-3">
              <MapPin size={15} className="mt-1 shrink-0 text-gold/70" />
              <div>
                <p className="text-[10px] font-medium tracking-[0.2em] text-text-secondary">
                  ADDRESS
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground [word-break:keep-all]">
                  {address}
                </p>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-text-secondary transition-colors hover:text-gold"
                >
                  {copied ? <Check size={12} className="text-gold" /> : <Copy size={12} />}
                  {"주소 복사"}
                </button>
                <span aria-live="polite" className="sr-only">
                  {copied ? "주소가 복사되었습니다" : ""}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone size={15} className="mt-1 shrink-0 text-gold/70" />
              <div>
                <p className="text-[10px] font-medium tracking-[0.2em] text-text-secondary">
                  TEL
                </p>
                <a
                  href={`tel:${phone.replace(/[^0-9+]/g, "")}`}
                  className="mt-2 block text-sm text-foreground transition-colors hover:text-gold"
                >
                  {phone}
                </a>
              </div>
            </div>

            {parking && (
              <div className="flex items-start gap-3">
                <SquareParking size={15} className="mt-1 shrink-0 text-gold/70" />
                <div>
                  <p className="text-[10px] font-medium tracking-[0.2em] text-text-secondary">
                    PARKING
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground [word-break:keep-all]">
                    {parking}
                  </p>
                </div>
              </div>
            )}
          </div>
        </BlurFade>

        {/* 지도 + 길찾기 캡션 바 — 붙어 있어야 하므로 같은 BlurFade 안에 둔다 */}
        <BlurFade delay={0.3}>
          <div className="mt-14">
            <div
              className="group relative aspect-[4/3] w-full border border-warm-tan bg-warm-beige sm:aspect-[16/9] lg:aspect-[21/9]"
              onMouseLeave={() => setMapActive(false)}
            >
              <iframe
                src={mapEmbedUrl(location)}
                title="포항연합기술지주 위치 지도 (한동대학교 창업보육센터)"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                className={`h-full w-full ${mapActive ? "" : "pointer-events-none"}`}
              />
              {mounted && !mapActive && (
                <button
                  type="button"
                  onClick={() => setMapActive(true)}
                  aria-label="지도 활성화 — 확대·이동하려면 클릭하세요"
                  className="absolute inset-0 z-10 flex items-start justify-end bg-transparent p-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-dark"
                >
                  <span className="bg-dark/90 px-4 py-2 text-[11px] tracking-[0.15em] text-primary-foreground">
                    {"클릭하면 지도를 확대·이동할 수 있습니다"}
                  </span>
                </button>
              )}
            </div>

            {/* 길찾기 — 지도에 용접된 캡션 바 */}
            <div className="flex flex-col items-stretch border-x border-b border-dark bg-dark sm:flex-row sm:items-center sm:justify-between">
              <p className="px-6 py-4 text-[11px] tracking-[0.2em] text-text-tertiary">
                {"길찾기"}
              </p>
              <div className="flex flex-col sm:flex-row">
                {links.map((link) => (
                  <a
                    key={link.key}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/link flex items-center justify-between gap-3 border-t border-dark-muted/40 px-6 py-4 text-xs font-medium text-primary-foreground/80 transition-colors hover:bg-dark-muted hover:text-gold sm:justify-center sm:border-l sm:border-t-0"
                  >
                    {link.label}
                    <ArrowUpRight
                      size={13}
                      className="text-gold/70 transition-transform group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5"
                    />
                    <span className="sr-only">{"(새 창에서 열림)"}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </BlurFade>

        {/* 교통편 */}
        <BlurFade delay={0.4}>
          <div className="mt-20">
            <div className="mb-8 flex items-center gap-4">
              <div className="editorial-rule" />
              <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
                HOW TO GET HERE
              </span>
            </div>
            <div className="grid border-t border-warm-tan lg:grid-cols-3">
              {ROUTES.map((route) => {
                const Icon = route.icon
                return (
                  <div
                    key={route.title}
                    className="border-b border-warm-tan px-0 py-8 lg:border-b-0 lg:border-r lg:px-8 lg:py-10 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0"
                  >
                    <div className="flex items-center gap-3">
                      <Icon size={16} className="shrink-0 text-gold/70" />
                      <h3 className="text-sm font-bold text-foreground">{route.title}</h3>
                    </div>
                    <ul className="mt-5 space-y-3">
                      {route.steps.map((step) => (
                        <li
                          key={step}
                          className="text-xs leading-[1.9] text-text-secondary [word-break:keep-all]"
                        >
                          {step}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-5 border-t border-warm-tan/60 pt-4 text-[11px] leading-relaxed text-text-tertiary [word-break:keep-all]">
                      {route.note}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  )
}
