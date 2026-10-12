/* eslint-disable @next/next/no-img-element -- 시안과 같은 렌더링을 위해 <img>를 그대로 쓴다(next/image의 크기 속성·srcset이 레이아웃을 바꾼다) */
import { HomeHeader } from "./home-header"
import "./home-fonts.css"
import "./home.css"

// 공개 홈(/). 리뉴얼 시안 https://pu-holdings-renewal.puholdings.chatgpt.site/ 의 마크업을 1:1로 옮겼다.
// 문구·구조를 바꿀 때는 시안 HTML과 나란히 비교할 수 있게 원본 순서와 태그를 유지한다.
// 스타일은 ./home.css(#puh 범위), 글꼴은 ./home-fonts.css(next/font를 쓰지 않는 이유도 거기 적었다).
export function HomePage() {
  return (
    <div id="puh">
      <a className="skip" href="#company">본문 바로가기</a>
      <HomeHeader />
      <main>
        <HeroSection />
        <CompanySection />
        <InvestmentSection />
        <PortfolioSection />
        <TeamSection />
        <SignatureSection />
        <ContactSection />
      </main>
      <HomeFooter />
    </div>
  )
}

function HeroSection() {
  return (
    <section className="hero" id="home">
      <div className="hero-art"></div>
      <div className="hero-copy">
        <p className="eyebrow">경북 포항 유일 공공형 액셀러레이터</p>
        <h1>지역의 가능성을 발굴하고,<br />투자로 성장을 연결합니다.</h1>
        <p>대학과 지역의 창업기업이 더 넓은 시장으로 나아가도록.<br />발굴부터 투자, 보육과 후속 성장까지 함께합니다.</p>
      </div>
      <div className="hero-bottom">
        <span>UNIVERSITY TECHNOLOGY HOLDINGS &amp; ACCELERATOR</span>
        <a href="#company">SCROLL ↓</a>
      </div>
    </section>
  )
}

function CompanySection() {
  return (
    <section className="section company" id="company">
      <div className="section-label">COMPANY</div>
      <div>
        <div className="company-intro">
          <div>
            <h2>보육과 투자 사이,<br />성장의 공백을 연결합니다.</h2>
            <p className="lead">대학과 지역의 우수 창업기업을 가장 먼저 발굴하고,<br className="desktop" /> 투자 가능한 기업으로 성장시켜 자본과 연결합니다.</p>
            <p className="muted">포항연합기술지주는 한동대학교 산학협력단·포항테크노파크·선린대학교·포항대학교가 공동 출자한 연합형 기술지주회사입니다. 대학 기술사업화와 초기기업 투자를 함께 수행하며, 창업기획자이자 LIPS 운영사로서 지역 기업의 다음 성장을 지원합니다.</p>
            <div className="identity">
              <span>공공형 액셀러레이터</span>
              <span>창업기획자</span>
              <span>LIPS 운영사</span>
            </div>
          </div>
          <div className="institution-grid" aria-label="공동 출자 기관">
            <figure>
              <img src="/home/handong-campus.png" alt="한동대학교 건물 전경" loading="lazy" />
              <figcaption>한동대학교</figcaption>
            </figure>
            <figure>
              <img src="/home/pohang-tp.jpg" alt="포항TP 건물 전경" loading="lazy" />
              <figcaption>포항TP</figcaption>
            </figure>
            <figure>
              <img src="/home/sunlin-campus-user.png" alt="선린대학교 건물 전경" loading="lazy" />
              <figcaption>선린대학교</figcaption>
            </figure>
            <figure>
              <img src="/home/pohang-university-user.png" alt="포항대학교 건물 전경" loading="lazy" />
              <figcaption>포항대학교</figcaption>
            </figure>
          </div>
        </div>
        <div className="stats">
          <div>
            <strong>8<span>건</span></strong>
            <p>자기계정 직접투자</p>
          </div>
          <div>
            <strong>3<span>건</span></strong>
            <p>회수 완료</p>
          </div>
          <div>
            <strong><small>약</small>760<span>개사+</span></strong>
            <p>누적 보육·지원 기업</p>
          </div>
          <div>
            <strong><small>약</small>26.5<span>억원</span></strong>
            <p>펀드 조성 금액(예정)</p>
          </div>
        </div>
        <details className="more-content">
          <summary>회사 소개 · 연혁 · 비전 자세히 보기<span>+</span></summary>
          <div className="detail-body">
            <div className="company-facts">
              <p><b>설립</b>2018년 6월 12일</p>
              <p><b>주주</b>한동대학교 산학협력단 · 포항테크노파크 · 선린대학교 · 포항대학교</p>
              <p><b>기반</b>대학 기술사업화 · 초기투자 · 한동대학교 창업보육센터 위탁 운영</p>
            </div>
            <details className="history">
              <summary>주요 연혁 <span>+</span></summary>
              <p><b>2026</b> 모두의창업·특화역량 BI 주관기관, LIPS 운영사 선정 · 파이비스 투자</p>
              <p><b>2025</b> 다솜엑스 투자 · 지역 창업·기업 지원사업 확대</p>
              <p><b>2023</b> 창업기획자 등록 · 한동대학교 창업보육센터 위탁 운영</p>
              <p><b>2019–20</b> 바이오·로봇·환경·AI 분야 초기기업 투자</p>
              <p><b>2018</b> 포항연합기술지주 설립</p>
              <p><b>2017</b> 산학연협력기술지주회사 교육부 인가</p>
            </details>
            <div className="values">
              <h3>신뢰 · 현장 · 연결 · 책임 · 순환</h3>
              <p>독립적인 투자 판단과 현장 검증을 바탕으로, 회수 성과가 지역의 새로운 도전으로 이어지는 선순환을 만듭니다.</p>
            </div>
            <details className="history vision">
              <summary>Vision 2030 · 대학 기반 투자플랫폼 <span>+</span></summary>
              <p>대학·지역·가치기반 자본과 정책금융을 연결하는 투자플랫폼으로 성장하고자 합니다. 한동대학교와 동문, 국내외 크리스천 창업·투자 네트워크를 전략적 확장축으로 삼되, 투자 판단은 사업성·시장성·기술성 등 객관적 기준에 따릅니다.</p>
              <div className="roadmap">
                <p><b>2026</b>2~5억원</p>
                <p><b>2027</b>20~30억원</p>
                <p><b>2028</b>80~100억원</p>
                <p><b>2029</b>200~300억원</p>
                <p><b>2030</b>500억원</p>
              </div>
              <p className="note">누적 운용자산(AUM)의 도전목표이며 현재 실적이나 확정된 펀드 결성계획이 아닙니다. 개인투자조합은 결성 추진 단계, 벤처투자조합과 TIPS 운영사 진입은 중장기 추진 과제입니다. 종교적 소속은 투자 자격이나 선정 기준이 아닙니다.</p>
            </details>
          </div>
        </details>
      </div>
    </section>
  )
}

function InvestmentSection() {
  return (
    <section className="section investment" id="investment">
      <div className="section-label">INVESTMENT AREAS</div>
      <div>
        <h2>지역에서 시작하되,<br />지역에 머무르지 않을 기업.</h2>
        <p className="lead">지역의 문제를 해결하는 사업과 대학의 기술에서<br className="desktop" /> 새로운 투자 기회를 발견합니다.</p>
        <div className="areas">
          <article>
            <span>01</span>
            <div>
              <h3>AI Technology &amp;<br />Commercialization</h3>
              <h4>AI · 딥테크 · 바이오 · 콘텐츠 · 헬스케어</h4>
              <p>대학 기술사업화와 교수·연구자 창업, 기술이전 기업 등 새로운 가능성을 가진 기업에 투자합니다.</p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>Local &amp;<br />Social Impact</h3>
              <h4>지역 · 임팩트 · 소셜벤처 · F&amp;B</h4>
              <p>농식품·해양수산 등 지역의 자원과 문제에서 기회를 발견하고, 사업의 성장과 사회적 가치를 함께 만들어갑니다.</p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>Early Stage &amp;<br />Global Growth</h3>
              <h4>예비 · 초기 · 글로벌 진출팀</h4>
              <p>창업의 시작부터 초기 성장, 글로벌 시장 진출을 준비하는 팀까지 함께합니다.</p>
            </div>
          </article>
        </div>
        <details className="more-content">
          <summary>성장 지원 과정과 투자 원칙<span>+</span></summary>
          <div className="detail-body">
            <div className="platform">
              <p className="eyebrow">CONNECTED GROWTH</p>
              <h3>발굴부터 회수까지,<br />하나로 이어지는 성장 지원.</h3>
              <ol className="process">
                <li>
                  <strong>발굴</strong>
                  <span>대학·지역 네트워크와 공개모집</span>
                </li>
                <li>
                  <strong>진단</strong>
                  <span>팀·사업모델·시장 가능성 검토</span>
                </li>
                <li>
                  <strong>선투자</strong>
                  <span>자기계정 및 조합 재원</span>
                </li>
                <li>
                  <strong>LIPS 추천</strong>
                  <span>적합기업 정책자금 연계</span>
                </li>
                <li>
                  <strong>보육·밸류업</strong>
                  <span>멘토링·사업화·실증·판로</span>
                </li>
                <li>
                  <strong>후속투자 연계</strong>
                  <span>외부 AC·VC와 성장자본 연결</span>
                </li>
                <li>
                  <strong>회수·재투자</strong>
                  <span>성과를 다음 투자로 순환</span>
                </li>
              </ol>
              <p className="note">LIPS 추천과 정책자금 지원은 별도 심사를 거치며, 선정 및 지원금액을 보장하지 않습니다.</p>
            </div>
            <div className="support-grid">
              <article>
                <h3>현장에서 검증합니다.</h3>
                <p>한동대학교 창업보육센터를 통해 기업의 성장 과정을 관찰하고, 경영진단·고객검증·실증의 결과를 투자 검토와 사후관리에 연결합니다.</p>
                <strong>26개사 <span>BI 입주기업</span></strong>
                <p className="note">2026년 6월 기준</p>
              </article>
              <article>
                <h3>실행력을 함께 만듭니다.</h3>
                <p>사업모델, 브랜드·마케팅, 재무관리, 시제품, 판로와 후속투자까지. 기업별 과제에 맞춰 내부 역량과 전문가 네트워크를 연결합니다.</p>
                <strong>26건 <span>대외 창업지원사업</span></strong>
                <p className="note">2023년 이후 수행 · 17.6억원 규모</p>
              </article>
            </div>
            <details className="history">
              <summary>투자 검토와 의사결정 원칙 <span>+</span></summary>
              <p>팀의 실행력, 고객 문제와 차별성, 시장검증, 정책자금 연계 가능성, 지역 임팩트, 확장성, 기업가치 성장 가능성, 재무건전성, 기술·브랜드 경쟁우위, 이해상충과 법적 리스크를 검토합니다.</p>
              <p>예비심사·실사·투자심의·계약·집행·사후관리·회수심의로 이어지는 절차에 따라 판단하며, 검토·심의·준법·집행의 역할을 구분합니다.</p>
            </details>
          </div>
        </details>
      </div>
    </section>
  )
}

function PortfolioSection() {
  return (
    <section className="section portfolio" id="portfolio">
      <div className="section-label">PORTFOLIO</div>
      <div>
        <h2>가능성에 투자하고,<br />성장의 여정을 함께합니다.</h2>
        <p className="lead">자기계정 직접투자 8건 · 회수 완료 3건</p>
        <p className="note">2026년 9월 기준 투자·회수 현황입니다.</p>
        <div className="portfolio-grid">
          <article>
            <span>BIO / HEALTHCARE</span>
            <h3>에이치디에스바이오</h3>
            <p>마이크로바이옴 기반 신약 개발</p>
            <small className="status exit-status">회수 완료</small>
          </article>
          <article>
            <span>ROBOTICS</span>
            <h3>아이언박스</h3>
            <p>지능형 산업 로봇·감시 솔루션</p>
            <small className="status exit-status">회수 완료</small>
          </article>
          <article>
            <span>AI / SAFETY</span>
            <h3>이롭로보틱스</h3>
            <p>AI 기반 화재 감시 솔루션</p>
            <small className="status exit-status">회수 완료</small>
          </article>
          <article>
            <span>AI / VISION</span>
            <h3>오픈인</h3>
            <p>머신러닝 기반 지능형 CCTV 솔루션</p>
          </article>
          <article>
            <span>ENVIRONMENT</span>
            <h3>에콤환경</h3>
            <p>열회수 환기 장치</p>
          </article>
          <article>
            <span>AI / SOFTWARE</span>
            <h3>다솜엑스</h3>
            <p>AI Agentic workflow 기반 플랫폼</p>
          </article>
          <article>
            <span>AI / INSPECTION</span>
            <h3>파이비스</h3>
            <p>표면결함검사시스템 제조·응용 소프트웨어 개발</p>
          </article>
          <article>
            <span>INVESTMENT</span>
            <h3>헤브론웍스</h3>
            <p>2026년 9월 투자 완료</p>
          </article>
        </div>
        <div className="programs">
          <h3>기업을 성장시키는 운영 경험</h3>
          <p className="muted">모두의창업, 특화역량 BI, RISE 기업밀착 보육, 글로컬 AI 임팩트 비즈니스, 지역 창업·이전 활성화 등 대학과 지역 현장에서 창업기업을 지원합니다.</p>
          <div className="operation-images">
            <figure>
              <img src="/home/modu-program.png" alt="모두의창업" loading="lazy" />
              <figcaption>
                <strong>모두의창업</strong>
                <span className="operation-subtitle">1기·2기 연속 운영</span>
                <span className="operation-count">누적 접수 <b>455개사</b></span>
              </figcaption>
            </figure>
            <figure>
              <img src="/home/handong-incubator.png" alt="한동대학교 창업보육센터 표지석과 건물 전경" loading="lazy" />
              <figcaption>
                <strong>한동대학교 창업보육센터</strong>
                <span className="operation-subtitle">2026년 기준</span>
                <span className="operation-count">입주기업 <b>26개사</b></span>
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  )
}

function TeamSection() {
  return (
    <section className="section team" id="team">
      <div className="section-label">TEAM</div>
      <div>
        <h2>전문성을 모으고,<br />함께 성장하는 팀.</h2>
        <p className="lead">경영·투자·운영을 담당하는 핵심 인력과<br className="desktop" /> 전문성을 가진 임원급 인력이 함께합니다.</p>
        <div className="people-grid">
          <article className="person-card">
            <div className="portrait portrait-photo centered-portrait">
              <img src="/home/shim-kyujin.jpg" alt="심규진 프로필 사진" loading="lazy" />
            </div>
            <div className="person-heading">
              <h3>심규진</h3>
              <span>대표이사</span>
            </div>
            <details>
              <summary>프로필 보기 <span>+</span></summary>
              <div className="bio">
                <div>
                  <h4>경력 · 창업투자 분야 12년</h4>
                  <p>現 한동대학교 정년트랙 창업(Global Entrepreneurship) 전공 교수<br />現 포항시의회 윤리심사자문위원(2026.5.~2028.5.)<br />現 (주)포항연합기술지주(모두의 창업 운영기관) 부대표<br />現 환동해지역혁신원 부원장 · 소셜벤처 사업 총괄<br />現 서울소셜벤처허브 전문 멘토<br />現 한국관광공사 창업 멘토<br />前 경상남도 김해시 창업 및 투자 펀드 총괄<br />— 공공 분야 600억 창업 펀드 조성(지역창업·바이오·콘텐츠 등)<br />— 콘텐츠기업지원센터 펀드투자 TF팀장<br />前 경상남도 김해 문화도시 시민협의회 회장<br />前 문화체육관광부 취창업지원실 전문 멘토<br />前 와디즈(국내 크라우드펀딩 No.1) 인사 총괄<br />前 국내 최대 규모 문화콘텐츠 기획사 창업: 매출 100억<br />前 포스코 인재혁신실 인사제도 기획 담당</p>
                </div>
                <div>
                  <h4>학력 · 연구</h4>
                  <p>Swiss School of Management 인공지능 박사(AI 스타트업 연구)<br />국립호치민경제대학교 CEO AMP Degree<br />AHP를 활용한 투자결정요인 분석 연구 외 창업 분야 논문 다수<br />글로컬대학 실장 · RISE사업단 K-콘텐츠 분야 부위원장</p>
                  <h4>저서</h4>
                  <p>창업 · 인공지능 · 에듀테크 등 총 11권(『창업은 일상이다』 등)<br /><a href="https://shimqjin.imweb.me/" target="_blank" rel="noopener noreferrer">shimqjin.imweb.me</a></p>
                </div>
              </div>
            </details>
          </article>
          <article className="person-card">
            <div className="portrait portrait-3 centered-portrait">
              <img src="/home/jung-wonseok.png" alt="정원석 프로필 사진" loading="lazy" />
            </div>
            <div className="person-heading">
              <h3>정원석</h3>
              <span>사외이사</span>
            </div>
            <details>
              <summary>프로필 보기 <span>+</span></summary>
              <div className="bio">
                <div>
                  <h4>경력</h4>
                  <p>現 포항시 시의원<br />現 한동대학교 금융부동산학과 초빙교수<br />前 삼성물산 과장 — 구매·외주 관리</p>
                </div>
                <div>
                  <h4>학력 · 주요 활동</h4>
                  <p>영남대학교 마케팅 박사<br />고려대학교 KMBA<br />한국창업학회 창업생태계혁신상(2025.11)</p>
                </div>
              </div>
            </details>
          </article>
          <article className="person-card advisor-card">
            <div className="portrait portrait-advisor centered-portrait">
              <img src="/home/kim-hakju.png" alt="김학주 교수 프로필 사진" loading="lazy" />
            </div>
            <div className="person-heading">
              <h3>김학주 교수</h3>
              <span>투자자문</span>
            </div>
            <details>
              <summary>프로필 보기 <span>+</span></summary>
              <div className="bio">
                <div>
                  <h4>주요 경력</h4>
                  <p>現 한동대학교 교수<br />유튜브 ‘김학주리서치’ 채널 운영<br />현대증권(현 KB증권) 입사<br />前 삼성증권 리서치센터 센터장(상무)<br />前 우리자산운용 운용총괄 CIO(전무)<br />前 한가람투자자문 CIO(부사장)<br />前 한국거래소 상장심의위원<br />前 공무원연금 자산배분위원</p>
                </div>
                <div>
                  <h4>학력</h4>
                  <p>서강대학교 경영학과<br />영국 에든버러대학교 대학원 경영학 석사</p>
                  <h4>주요 수상 · 전문 분야</h4>
                  <p>2001~2007 자동차산업 베스트 애널리스트(7년 연속)<br />2006~2008 「아시아머니」 선정 한국 최우수 애널리스트(3년 연속)<br />Institutional Investor 애널리스트 평가 최상위권<br />2005 매경 증권인상 기업분석 부문<br />2008 매경 Best Strategist<br />금융투자업계 이후 6개 기업 설립 · 상장 추진<br />바이오 · 친환경 신소재 · 핀테크 분야 창업</p>
                </div>
              </div>
            </details>
          </article>
          <article className="person-card">
            <div className="portrait portrait-2 centered-portrait">
              <img src="/home/bae-junggu.png" alt="배중구 프로필 사진" loading="lazy" />
            </div>
            <div className="person-heading">
              <h3>배중구</h3>
              <span>실장 · 투자심사역</span>
            </div>
            <details>
              <summary>프로필 보기 <span>+</span></summary>
              <div className="bio">
                <div>
                  <h4>경력</h4>
                  <p>現 포항연합기술지주 실장·투자심사역<br />前 임팩트투자사·창업교육·하드웨어 액셀러레이터 등 팀장·심사역<br />스타트업 투자·육성 경력 10년<br />6개사 투자 집행 참여</p>
                </div>
                <div>
                  <h4>대외 활동 · 전문 분야</h4>
                  <p>한국관광공사 관광벤처사업 심사위원·전담멘토<br />서울시 소셜벤처허브 투자자문단 위촉위원<br />‘모두의창업’ 동남권 로컬트랙 책임멘토<br />한동대학교 환동해지역혁신원 소셜벤처 자문단<br />초기투자 · 소셜벤처 · 임팩트 투자 · 오픈이노베이션</p>
                </div>
              </div>
            </details>
          </article>
          <article className="person-card">
            <div className="portrait portrait-oh centered-portrait">
              <img src="/home/oh-shoulders.png" alt="오재준 프로필 사진" loading="lazy" />
            </div>
            <div className="person-heading">
              <h3>오재준</h3>
              <span>파트장 · 투자심사역</span>
            </div>
            <details>
              <summary>프로필 보기 <span>+</span></summary>
              <div className="bio">
                <div>
                  <h4>경력</h4>
                  <p>現 포항연합기술지주 파트장 · 투자심사역<br />前 한동대학교 연구원<br />글로컬대학사업·포항시 보조금 사업·울릉캠퍼스 행정 지원<br />前 포항공과대학교 행정원<br />기숙대학·비교과 프로그램 운영 지원</p>
                </div>
                <div>
                  <h4>주요 활동 · 역량</h4>
                  <p>FIX 2024 독일 Fraunhofer 부스 통역<br />HyIS 2021 세계철강협회 VIP 통역·의전 지원<br />대학·재정지원사업 행정<br />프로그램 운영 · 국제행사 통역·의전</p>
                </div>
              </div>
            </details>
          </article>
          <article className="person-card">
            <div className="portrait portrait-photo centered-portrait">
              <img src="/home/byun-jeongwoo.jpg" alt="변정우 프로필 사진" loading="lazy" />
            </div>
            <div className="person-heading">
              <h3>변정우</h3>
              <span>매니저</span>
            </div>
          </article>
        </div>
        <details className="more-content">
          <summary>조직 및 벤처파트너 운영 구상<span>+</span></summary>
          <div className="detail-body">
            <div className="org-section">
              <p className="eyebrow">PARTNER-LED ORGANIZATION / 추진 구상</p>
              <h3>핵심 조직은 단단하게,<br />전문성은 파트너와 넓게.</h3>
              <p className="org-intro">내부는 투자 판단과 실행을 책임지고, 외부 벤처파트너는 분야별 기업 발굴·전문 검토·성장지원에 참여하는 구조를 지향합니다.</p>
              <div className="org-chart" aria-label="파트너 중심 조직 개편 구상">
                <div className="org-board">
                  <span>GOVERNANCE</span>
                  <strong>이사회</strong>
                  <p>정원석 사외이사 참여 · 경영 자문 및 감독</p>
                </div>
                <div className="org-stem"></div>
                <div className="org-ceo">
                  <span>LEADERSHIP</span>
                  <strong>심규진 대표이사</strong>
                  <p>경영 총괄 · 투자전략 · 펀드 조성</p>
                </div>
                <div className="org-stem"></div>
                <div className="org-core">
                  <div>
                    <span>INVESTMENT</span>
                    <strong>배중구 실장 · 투자심사역</strong>
                    <p>딜 검토 · 투자 실무<br />포트폴리오 성장지원</p>
                  </div>
                  <div>
                    <span>OPERATIONS</span>
                    <strong>오재준 파트장 · 투자심사역</strong>
                    <p>사업 행정 · 프로그램 운영<br />계약·정산 실무 지원</p>
                  </div>
                </div>
                <div className="org-collab">기업별 담당자 연결 · 검토자료 및 성장과제 공유</div>
                <div className="org-network">
                  <h4>외부 벤처파트너 네트워크 <small>위촉 추진</small></h4>
                  <div>
                    <article>
                      <strong>발굴 파트너</strong>
                      <p>대학 · 지역 · 산업별<br />유망기업 발굴과 추천</p>
                    </article>
                    <article>
                      <strong>검토 파트너</strong>
                      <p>기술 · 시장 · 고객 검증<br />전문 검토의견 제공</p>
                    </article>
                    <article>
                      <strong>성장 파트너</strong>
                      <p>실증 · 판로 · 후속투자<br />기업별 성장과제 지원</p>
                    </article>
                  </div>
                </div>
              </div>
              <p className="team-note">이사회 구성원 전체를 표시한 법정 조직도가 아닌 역할 중심 구상도입니다. 외부 파트너는 자문·협력 역할이며, 투자심의·최종 승인·계약 및 집행은 회사의 권한과 절차에 따릅니다.</p>
              <details className="partner-model">
                <summary>벤처파트너 운영 방향 <span>+</span></summary>
                <div className="partner-steps">
                  <article>
                    <span>01</span>
                    <h4>분야와 과업을 합의합니다.</h4>
                    <p>전문성과 네트워크를 검토하고, 담당 분야·기여 과업·내부 협업 담당자를 정합니다.</p>
                  </article>
                  <article>
                    <span>02</span>
                    <h4>검증된 기여를 평가합니다.</h4>
                    <p>검토 채택 기업, 심층 검토보고서, 고객·실증 연결 등 확인 가능한 결과를 기준으로 합니다.</p>
                  </article>
                  <article>
                    <span>03</span>
                    <h4>기여에 맞춰 보상합니다.</h4>
                    <p>과업비·활동비와 성과보상을 설계하고, 장기 성과 참여는 별도 규정과 계약으로 구체화합니다.</p>
                  </article>
                </div>
                <p className="team-note">파트너 제도와 보상 체계는 추진안이며, 현재 위촉 또는 지급을 약정하는 내용은 아닙니다.</p>
              </details>
            </div>
          </div>
        </details>
      </div>
    </section>
  )
}

function SignatureSection() {
  return (
    <section className="section signature" id="signature">
      <div className="section-label">SIGNATURE PROGRAMS</div>
      <div>
        <h2>시작을 돕고,<br />성장으로 연결합니다.</h2>
        <p className="lead">포항연합기술지주의 시그니처 프로그램을 만나보세요.</p>
        <div className="signature-grid">
          <a className="signature-card" href="https://start-fit.co.kr/" target="_blank" rel="noopener noreferrer">
            <span className="program-no">01 / STARTUP FIT</span>
            <div className="program-art signature-logo spit-brand">
              <img src="/home/spit-logo.png" alt="spit 스핏 로고" loading="lazy" />
            </div>
            <h3>스핏 <small>스타트업 핏</small></h3>
            <p>스타트업의 다음 가능성을 만나는 시작.</p>
            <span className="program-link">바로가기 <b>↗</b><span className="sr-only"> (새 창)</span></span>
          </a>
          <a className="signature-card" href="https://modu-changup.vercel.app/" target="_blank" rel="noopener noreferrer">
            <span className="program-no">02 / FEEDBACK</span>
            <div className="program-art signature-logo">
              <img src="/home/feedback-logo.svg" alt="24시간 첨삭 로고" loading="lazy" />
            </div>
            <h3>24시간 첨삭 플랫폼</h3>
            <p>창업의 생각을 다듬는 첨삭 프로그램.</p>
            <span className="program-link">바로가기 <b>↗</b><span className="sr-only"> (새 창)</span></span>
          </a>
          <a className="signature-card" href="https://pohang-entrepreneur-platform.vercel.app/" target="_blank" rel="noopener noreferrer">
            <span className="program-no">03 / STARTUP DATABASE</span>
            <div className="program-art signature-logo">
              <img src="/home/post-logo.svg" alt="POST 로고" loading="lazy" />
            </div>
            <h3>POST <span className="development-badge">개발중</span><small>포항 스타트업 DB 플랫폼</small></h3>
            <p>지역의 창업기업과 생태계를 연결하는 플랫폼.</p>
            <span className="program-link">바로가기 <b>↗</b><span className="sr-only"> (새 창)</span></span>
          </a>
        </div>
      </div>
    </section>
  )
}

function ContactSection() {
  return (
    <section className="contact" id="contact">
      <p className="eyebrow">LET’S BUILD WHAT’S NEXT.</p>
      <h2>지역을 혁신할 파트너를<br />기다립니다.</h2>
      <a className="contact-button" href="mailto:bea0906@puholdings.co.kr">투자 · 협력 문의 <span>↗</span></a>
      <div className="contact-info">
        <p>경북 포항시 북구 흥해읍 한동로 558<br />창업보육센터 304호</p>
        <div>
          <a href="mailto:bea0906@puholdings.co.kr">bea0906@puholdings.co.kr</a>
          <br />
          <span>담당 · 배중구 실장</span>
          <br />
          <a href="tel:0542603019">대표전화 054-260-3019</a>
        </div>
      </div>
      <div className="social-links" aria-label="소셜 채널">
        <a href="https://www.instagram.com/puholdings" target="_blank" rel="noopener noreferrer">Instagram <span>↗</span><span className="sr-only"> (새 창)</span></a>
      </div>
      <a className="photo-credit" href="https://www.korea.kr/briefing/policyBriefingView.do?newsId=148817799" target="_blank" rel="noopener noreferrer">호미곶 사진 출처 · 대한민국 정책브리핑</a>
      <a className="photo-credit" href="https://big5chinese.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=113344" target="_blank" rel="noopener noreferrer">구룡포 사진 · 한국관광공사 / 네이버블로거 뚜벅(supersky007)</a>
    </section>
  )
}

function HomeFooter() {
  return (
    <footer>
      <a className="brand official-brand" href="#home" aria-label="포항연합기술지주 홈">
        <img src="/home/pu-holdings-logo.png" alt="포항연합기술지주" width="621" height="196" loading="lazy" />
      </a>
      <div className="footer-legal">
        <p>개인정보 보호책임자: 배중구</p>
        <p>© 2026 PU Holdings. All rights reserved.</p>
      </div>
      <a href="#home">맨 위로 ↑</a>
    </footer>
  )
}
