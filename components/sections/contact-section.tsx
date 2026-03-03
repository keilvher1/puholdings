"use client"

import { useState } from "react"
import { BlurFade } from "@/components/magicui/blur-fade"
import { ShimmerButton } from "@/components/magicui/shimmer-button"
import { MapPin, Phone, Mail, Send, CheckCircle } from "lucide-react"

export function ContactSection() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    message: "",
  })
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("loading")

    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      if (res.ok) {
        setStatus("success")
        setForm({ name: "", email: "", phone: "", company: "", message: "" })
      } else {
        setStatus("error")
      }
    } catch {
      setStatus("error")
    }
  }

  return (
    <section id="contact" className="relative overflow-hidden bg-navy-deep py-24 md:py-32">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(30,136,229,0.08)_0%,_transparent_60%)]" />

      <div className="relative mx-auto max-w-7xl px-6">
        <BlurFade delay={0.1}>
          <div className="mb-4 text-center">
            <span className="text-xs font-semibold tracking-widest text-blue-accent">
              CONTACT US
            </span>
          </div>
          <h2 className="mb-4 text-center text-3xl font-bold text-primary-foreground md:text-4xl text-balance">
            문의하기
          </h2>
          <p className="mx-auto mb-16 max-w-xl text-center leading-relaxed text-slate-400">
            투자 문의, 제휴 제안 등 궁금하신 사항이 있으시면 연락해 주세요.
          </p>
        </BlurFade>

        <div className="grid gap-12 lg:grid-cols-5">
          {/* Contact info */}
          <BlurFade delay={0.2} className="lg:col-span-2">
            <div className="flex flex-col gap-8">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-accent/10 text-blue-accent">
                  <MapPin size={20} />
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-bold text-primary-foreground">주소</h4>
                  <p className="text-sm leading-relaxed text-slate-400">
                    경상북도 포항시 남구 청암로 77
                    <br />
                    POSTECH C5빌딩
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-accent/10 text-blue-accent">
                  <Phone size={20} />
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-bold text-primary-foreground">전화</h4>
                  <p className="text-sm text-slate-400">054-279-0100</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-accent/10 text-blue-accent">
                  <Mail size={20} />
                </div>
                <div>
                  <h4 className="mb-1 text-sm font-bold text-primary-foreground">이메일</h4>
                  <p className="text-sm text-slate-400">contact@puholdings.co.kr</p>
                </div>
              </div>
            </div>
          </BlurFade>

          {/* Contact form */}
          <BlurFade delay={0.3} className="lg:col-span-3">
            {status === "success" ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-navy-light bg-navy/50 p-12 text-center">
                <CheckCircle size={48} className="mb-4 text-cyan-accent" />
                <h3 className="mb-2 text-xl font-bold text-primary-foreground">
                  {"문의가 접수되었습니다"}
                </h3>
                <p className="text-sm text-slate-400">
                  {"빠른 시일 내에 담당자가 연락드리겠습니다."}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <input
                    type="text"
                    placeholder="이름 *"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="rounded-xl border border-navy-light bg-navy/50 px-4 py-3 text-sm text-primary-foreground placeholder-slate-600 outline-none transition-colors focus:border-blue-accent"
                  />
                  <input
                    type="email"
                    placeholder="이메일 *"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="rounded-xl border border-navy-light bg-navy/50 px-4 py-3 text-sm text-primary-foreground placeholder-slate-600 outline-none transition-colors focus:border-blue-accent"
                  />
                  <input
                    type="tel"
                    placeholder="연락처"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="rounded-xl border border-navy-light bg-navy/50 px-4 py-3 text-sm text-primary-foreground placeholder-slate-600 outline-none transition-colors focus:border-blue-accent"
                  />
                  <input
                    type="text"
                    placeholder="회사명"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    className="rounded-xl border border-navy-light bg-navy/50 px-4 py-3 text-sm text-primary-foreground placeholder-slate-600 outline-none transition-colors focus:border-blue-accent"
                  />
                </div>
                <textarea
                  placeholder="문의 내용 *"
                  required
                  rows={5}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="resize-none rounded-xl border border-navy-light bg-navy/50 px-4 py-3 text-sm text-primary-foreground placeholder-slate-600 outline-none transition-colors focus:border-blue-accent"
                />
                <ShimmerButton
                  type="submit"
                  className="self-start"
                  disabled={status === "loading"}
                >
                  {status === "loading" ? "전송 중..." : "문의 보내기"}
                  <Send size={14} />
                </ShimmerButton>
                {status === "error" && (
                  <p className="text-sm text-red-400">{"전송에 실패했습니다. 다시 시도해 주세요."}</p>
                )}
              </form>
            )}
          </BlurFade>
        </div>
      </div>
    </section>
  )
}
