// 오시는 길 — 위치 좌표와 지도/길찾기 URL 생성의 단일 소스.
// 좌표를 여러 파일에 흩뿌리지 않는다. 사무실 이전 시 이 파일과 관리자 화면(설정·텍스트 > 연락처)만 고치면 된다.

// [좌표 근거 — 재검증용]
// - OSM way 396143707 (name=창업보육센터, building=yes) 폴리곤 중심: 36.1035067 / 129.3857248
// - Google 지오코딩('한동대학교 창업보육센터')과 약 13m 내 일치
// - 주의: '한동로 558' 주소점(36.1032 / 129.3889)은 캠퍼스 정문 부근으로 실제 건물에서 약 300m 동쪽이다.
//   캠퍼스가 넓어 300m 오차는 방문자가 건물을 못 찾는 거리이므로 주소점을 쓰지 않는다.
// - 지번 경북 포항시 북구 흥해읍 남송리 3 / 우편번호 37554 / 창업보육센터 사무동 3층
// - 정확한 호수는 관리자 화면의 주소 값이 유일한 출처다(코드에 하드코딩하지 않는다).
export const DEFAULT_LOCATION = {
  lat: 36.1035067,
  lng: 129.3857248,
} as const

// 길찾기 목적지 라벨(네이버·카카오 지도에 표시되는 이름)
export const DESTINATION_NAME = "포항연합기술지주"

// 좌표 검증. 지도 URL에 문자열을 그대로 보간하므로 반드시 통과시킨 값만 쓴다.
// 한국어 도로명주소를 Google q= 파라미터에 넘기면 괄호 이후가 잘려나가 지오코딩이 깨지므로,
// 좌표가 유효하지 않으면 주소 문자열로 폴백하지 않고 항상 알려진 좋은 좌표를 쓴다.
//
// 위도·경도는 **쌍으로** 검증한다. 한쪽만 되돌리면 '실제값 + 기본값'이 섞인 엉뚱한 지점이
// 지도와 길찾기 링크 3개에 그대로 나가는데, 화면에는 아무 경고도 뜨지 않는다.
function parseCoord(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim())
  return Number.isFinite(n) ? n : null
}

// 국내 사업장이므로 대한민국 범위를 벗어나면 오타로 본다.
// 위도·경도를 바꿔 입력한 경우와, 1e-7 같은 극소값이 `${lat}` 보간에서 "1e-7" 지수표기
// 문자열이 되어 pb URL을 깨뜨리는 경우가 여기서 함께 걸러진다.
const KOREA_BOUNDS = { minLat: 33, maxLat: 39, minLng: 124, maxLng: 132 }

export interface MapLocation {
  lat: number
  lng: number
}

export function resolveLocation(contact?: { map_lat?: unknown; map_lng?: unknown }): MapLocation {
  const lat = parseCoord(contact?.map_lat)
  const lng = parseCoord(contact?.map_lng)
  if (
    lat === null ||
    lng === null ||
    lat < KOREA_BOUNDS.minLat ||
    lat > KOREA_BOUNDS.maxLat ||
    lng < KOREA_BOUNDS.minLng ||
    lng > KOREA_BOUNDS.maxLng
  ) {
    return { ...DEFAULT_LOCATION }
  }
  return { lat, lng }
}

// API 키 없이 동작하는 구글 지도 임베드.
// maps.google.com/maps?...&output=embed 가 301로 변환해 주는 최종 형태를 그대로 쓴다(리다이렉트 1회 절약).
// pb 문법: !1m4!2m1!1s<lat,lng> = 위치, !5e0 = 일반지도, !6i<zoom>, !3m1!1sko!5m1!1sko = 한국어
// NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY가 설정되면 공식 Maps Embed API로 자동 전환된다.
export function mapEmbedUrl(loc: MapLocation, zoom = 17): string {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY
  const q = `${loc.lat},${loc.lng}`
  if (key) {
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&zoom=${zoom}&language=ko&region=KR`
  }
  return `https://www.google.com/maps/embed?origin=mfe&pb=!1m4!2m1!1s${q}!5e0!6i${zoom}!3m1!1sko!5m1!1sko`
}

// 길찾기 딥링크. 세 서비스 모두 자동차 경로로 통일한다
// (카카오 link/to는 자동차 고정이라, 앱마다 기본 이동수단이 갈리지 않게 맞춘 것).
export function directionsLinks(loc: MapLocation) {
  const coord = `${loc.lat},${loc.lng}`
  const name = encodeURIComponent(DESTINATION_NAME)
  return [
    {
      key: "google",
      label: "구글 지도",
      href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coord)}&travelmode=driving`,
    },
    {
      key: "naver",
      label: "네이버 지도",
      // 레거시 index.nhn이 좌표를 내부 좌표계로 변환해 현행 /p/directions URL로 301 리다이렉트해 준다.
      href: `https://map.naver.com/index.nhn?elng=${loc.lng}&elat=${loc.lat}&etext=${name}&menu=route&pathType=0`,
    },
    {
      key: "kakao",
      label: "카카오맵",
      // link/to 는 <이름>,<위도>,<경도> 순서. 카카오가 WGS84를 서버에서 변환한다.
      href: `https://map.kakao.com/link/to/${name},${coord}`,
    },
  ] as const
}
