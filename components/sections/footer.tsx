export function Footer() {
  return (
    <footer className="border-t border-navy-light/30 bg-navy-deep py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-accent">
              <span className="text-xs font-bold text-primary-foreground">PU</span>
            </div>
            <div>
              <p className="text-sm font-bold text-primary-foreground">
                {"(주)포항연합기술지주"}
              </p>
              <p className="text-[10px] tracking-widest text-slate-600">PU HOLDINGS CO., LTD.</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 text-center md:items-end md:text-right">
            <p className="text-xs text-slate-600">
              {"경상북도 포항시 남구 청암로 77 POSTECH C5빌딩"}
            </p>
            <p className="text-xs text-slate-600">
              {"TEL: 054-279-0100 | EMAIL: contact@puholdings.co.kr"}
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-navy-light/20 pt-6 text-center">
          <p className="text-xs text-slate-600">
            {"Copyright "}&copy;{" 2012-2026 (주)포항연합기술지주. All Rights Reserved."}
          </p>
        </div>
      </div>
    </footer>
  )
}
