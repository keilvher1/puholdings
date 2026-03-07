import Image from "next/image"

export function Footer() {
  return (
    <footer className="bg-dark border-t border-dark-muted/20">
      <div className="mx-auto max-w-7xl px-8 lg:px-12">
        {/* Main footer */}
        <div className="grid gap-10 py-16 lg:grid-cols-12 lg:py-20">
          <div className="lg:col-span-4">
            <Image
              src="/images/logo-full.png"
              alt="(주)포항연합기술지주 로고"
              width={360}
              height={80}
              className="h-12 w-auto brightness-0 invert"
            />
          </div>

          <div className="lg:col-span-4">
            <p className="text-xs leading-[2.2] text-text-tertiary">
              {"경상북도 포항시 남구 청암로 77"}
              <br />
              {"POSTECH C5빌딩"}
            </p>
          </div>

          <div className="lg:col-span-4 lg:text-right">
            <p className="text-xs leading-[2.2] text-text-tertiary">
              {"TEL  054-279-0100"}
              <br />
              {"EMAIL  contact@puholdings.co.kr"}
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-dark-muted/20 py-8 lg:flex-row">
          <p className="text-[10px] tracking-wider text-text-tertiary/60">
            {"Copyright "}&copy;{" 2012\u20132026 PU Holdings Co., Ltd. All Rights Reserved."}
          </p>
          <div className="flex gap-8">
            {["Privacy Policy", "Terms of Use"].map((item) => (
              <span
                key={item}
                className="cursor-pointer text-[10px] tracking-wider text-text-tertiary/60 transition-colors hover:text-primary-foreground"
              >
                {item.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
