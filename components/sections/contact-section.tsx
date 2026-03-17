"use client"

import { useState } from "react"
import { BlurFade } from "@/components/magicui/blur-fade"
import { Particles } from "@/components/magicui/particles"
import { MapPin, Phone, Mail, CheckCircle, ArrowRight } from "lucide-react"

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

  const inputClass =
    "w-full border-b border-dark-muted/30 bg-transparent px-0 py-4 text-sm text-primary-foreground placeholder:text-text-tertiary/60 outline-none transition-colors focus:border-gold"

  return (
    <section id="contact" className="relative overflow-hidden bg-dark py-28 lg:py-40">
      {/* Subtle particles */}
      <Particles
        className="absolute inset-0"
        quantity={20}
        color="#c9a84c"
        size={0.8}
        speed={0.1}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-8 lg:px-12">
        <div className="grid gap-20 lg:grid-cols-12">
          {/* Left - info */}
          <div className="lg:col-span-4">
            <BlurFade delay={0.1}>
              <div className="mb-6 flex items-center gap-4">
                <div className="editorial-rule" />
                <span className="text-[11px] font-medium tracking-[0.3em] text-gold">
                  CONTACT
                </span>
              </div>
              <h2 className="text-3xl font-bold leading-tight tracking-tight text-primary-foreground lg:text-4xl text-balance">
                {"함께할 기업을"}
                <br />
                {"찾습니다."}
              </h2>
              <p className="mt-6 text-sm leading-[1.9] text-text-tertiary">
                {"투자 문의, 제휴 제안 등 궁금하신 사항이 있으시면 연락해 주세요."}
              </p>
            </BlurFade>

            <BlurFade delay={0.25}>
              <div className="mt-14 space-y-6">
                <div className="flex items-start gap-4">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-gold/70" />
                  <div>
                    <p className="text-sm text-primary-foreground/90 [word-break:keep-all]">
                      경상북도 포항시 남구 청암로 77
                    </p>
                    <p className="mt-0.5 text-xs text-text-tertiary">POSTECH 창업보육센터</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Phone size={15} className="shrink-0 text-gold/70" />
                  <p className="text-sm text-primary-foreground/90">054-279-8710</p>
                </div>
              </div>
            </BlurFade>
          </div>

          {/* Right - form */}
          <div className="lg:col-span-7 lg:col-start-6">
            <BlurFade delay={0.3}>
              {status === "success" ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <CheckCircle size={36} className="mb-6 text-gold" />
                  <h3 className="text-xl font-bold text-primary-foreground">
                    {"문의가 접수되었습니다"}
                  </h3>
                  <p className="mt-3 text-sm text-text-tertiary">
                    {"빠른 시일 내에 담당자가 연락드리겠습니다."}
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-0">
                  <div className="grid gap-x-10 sm:grid-cols-2">
                    <input
                      type="text"
                      placeholder="이름 *"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className={inputClass}
                    />
                    <input
                      type="email"
                      placeholder="이메일 *"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className={inputClass}
                    />
                    <input
                      type="tel"
                      placeholder="연락처"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className={inputClass}
                    />
                    <input
                      type="text"
                      placeholder="회사명"
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <textarea
                    placeholder="문의 내용 *"
                    required
                    rows={4}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="mt-2 w-full resize-none border-b border-dark-muted/30 bg-transparent px-0 py-4 text-sm text-primary-foreground placeholder:text-text-tertiary/60 outline-none transition-colors focus:border-gold"
                  />
                  <div className="mt-10">
                    <button
                      type="submit"
                      disabled={status === "loading"}
                      className="group relative flex items-center gap-3 overflow-hidden border border-gold/60 px-10 py-4 text-[11px] font-semibold tracking-[0.2em] text-gold transition-all duration-500 hover:border-gold hover:text-dark disabled:opacity-50"
                    >
                      <span className="absolute inset-0 -translate-x-full bg-gold transition-transform duration-500 group-hover:translate-x-0" />
                      <span className="relative flex items-center gap-3">
                        {status === "loading" ? "SENDING..." : "SEND MESSAGE"}
                        <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                      </span>
                    </button>
                  </div>
                  {status === "error" && (
                    <p className="mt-4 text-sm text-destructive">
                      {"전송에 실패했습니다. 다시 시도해 주세요."}
                    </p>
                  )}
                </form>
              )}
            </BlurFade>
          </div>
        </div>
      </div>
    </section>
  )
}
