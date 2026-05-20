import { useState, useRef, useEffect } from 'react'
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input'
import { COPY, US_STATES, MX_STATES_ES, resolveTimezone } from './i18n'

function HandDrawnArrow() {
  return (
    <svg width="48" height="32" viewBox="0 0 48 32" fill="none" className="hidden lg:block absolute -left-14 top-1/2 -translate-y-1/2">
      <path d="M2 28C8 24 18 12 44 6" stroke="#C8943E" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 3" opacity="0.5" />
      <path d="M38 2L45 6L40 12" stroke="#C8943E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
    </svg>
  )
}

// Pure SVG flags — render crisply at any size, no external assets needed.
function FlagUS({ size = 22 }) {
  const h = size
  const w = size * 1.4
  return (
    <svg width={w} height={h} viewBox="0 0 28 20" className="rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" aria-hidden="true">
      <rect width="28" height="20" fill="#B22234" />
      {[1, 3, 5, 7, 9, 11, 13].map(i => (
        <rect key={i} y={(i * 20) / 13} width="28" height={20 / 13} fill="#FFFFFF" />
      ))}
      <rect width="12" height={(20 * 7) / 13} fill="#3C3B6E" />
    </svg>
  )
}

function FlagMX({ size = 22 }) {
  const h = size
  const w = size * 1.4
  return (
    <svg width={w} height={h} viewBox="0 0 28 20" className="rounded-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" aria-hidden="true">
      <rect width="9.33" height="20" x="0" fill="#006847" />
      <rect width="9.34" height="20" x="9.33" fill="#FFFFFF" />
      <rect width="9.33" height="20" x="18.67" fill="#CE1126" />
      {/* Center eagle disc — simplified for legibility at small sizes */}
      <circle cx="14" cy="10" r="2.4" fill="none" stroke="#6B3F12" strokeWidth="0.5" />
      <ellipse cx="14" cy="10" rx="1.5" ry="0.8" fill="#6B3F12" />
      <path d="M12.5 10 Q14 8.5 15.5 10" stroke="#6B3F12" strokeWidth="0.4" fill="none" />
    </svg>
  )
}

function LanguageToggle({ lang, setLang, t }) {
  const isEn = lang === 'en'
  return (
    <button
      type="button"
      onClick={() => setLang(isEn ? 'es' : 'en')}
      aria-label={t.switchToFullLabel}
      title={t.switchToFullLabel}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-[#E5DFD6] bg-white/70 hover:bg-white hover:border-forest/30 transition-all duration-150 group"
    >
      <div className="flex items-center gap-1.5">
        <span className={`transition-opacity ${isEn ? 'opacity-100' : 'opacity-40'}`}>
          <FlagUS size={18} />
        </span>
        <span className="text-[11px] text-warm-gray">/</span>
        <span className={`transition-opacity ${isEn ? 'opacity-40' : 'opacity-100'}`}>
          <FlagMX size={18} />
        </span>
      </div>
      <span className="text-[12.5px] font-medium text-warm-dark tracking-[0.1px] hidden sm:inline">
        {isEn ? 'EN' : 'ES'}
      </span>
    </button>
  )
}

function SuccessState({ t }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="success-check mb-6">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <circle cx="36" cy="36" r="34" stroke="#1B3A2D" strokeWidth="2.5" fill="#1B3A2D" fillOpacity="0.05" />
          <path d="M22 36L32 46L50 26" stroke="#1B3A2D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 className="font-serif text-[28px] text-forest mb-3 leading-tight">{t.success.title}</h3>
      <p className="text-warm-gray text-[15px] leading-relaxed max-w-[280px]">{t.success.body}</p>
      <div className="mt-8 flex items-center gap-2 text-[13px] text-warm-gray">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 pulse-dot" />
        {t.success.connecting}
      </div>
    </div>
  )
}

export default function App() {
  // Detect initial language: ?lang=es overrides, then localStorage, then browser, then EN.
  const initialLang = (() => {
    if (typeof window === 'undefined') return 'en'
    const urlLang = new URLSearchParams(window.location.search).get('lang')
    if (urlLang === 'es' || urlLang === 'en') return urlLang
    const saved = window.localStorage.getItem('crestview_lang')
    if (saved === 'es' || saved === 'en') return saved
    const nav = (window.navigator.language || '').toLowerCase()
    if (nav.startsWith('es')) return 'es'
    return 'en'
  })()

  const [lang, setLang] = useState(initialLang)
  const t = COPY[lang]
  const stateList = lang === 'es' ? MX_STATES_ES : US_STATES
  const phoneCountry = lang === 'es' ? 'MX' : 'US'

  // Persist + reflect in <html lang> for SEO/screen readers.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('crestview_lang', lang)
    document.documentElement.lang = t.locale
  }, [lang, t.locale])

  const [form, setForm] = useState({
    name: '',
    email: '',
    state: '',
    phone: undefined,
    consent: false,
  })
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [callbackError, setCallbackError] = useState('')
  const formRef = useRef(null)

  // On language flip: clear state + phone (different country list / dial code)
  // and re-validate touched fields so error copy stays in sync.
  useEffect(() => {
    setForm(prev => ({ ...prev, state: '', phone: undefined }))
    setTouched(prev => ({ ...prev, state: false, phone: false }))
    setErrors(prev => ({ ...prev, state: null, phone: null }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  const [clockSeconds, setClockSeconds] = useState(47)
  useEffect(() => {
    const interval = setInterval(() => {
      setClockSeconds(prev => {
        const next = prev + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 3 + 1)
        return Math.max(38, Math.min(56, next))
      })
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  function validate(fields = form) {
    const errs = {}
    if (!fields.name.trim()) errs.name = t.errors.nameRequired
    else if (fields.name.trim().length < 2) errs.name = t.errors.nameShort

    if (!fields.email.trim()) errs.email = t.errors.emailRequired
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) errs.email = t.errors.emailInvalid

    if (!fields.state) errs.state = t.errors.stateRequired

    if (!fields.phone) errs.phone = t.errors.phoneRequired
    else if (!isValidPhoneNumber(fields.phone)) errs.phone = t.errors.phoneInvalid

    if (!fields.consent) errs.consent = t.errors.consentRequired

    return errs
  }

  function handleBlur(field) {
    setTouched(prev => ({ ...prev, [field]: true }))
    const fieldErrors = validate(form)
    setErrors(prev => ({ ...prev, [field]: fieldErrors[field] || null }))
  }

  function handleChange(field, value) {
    const updated = { ...form, [field]: value }
    setForm(updated)
    if (callbackError) setCallbackError('')
    if (touched[field]) {
      const fieldErrors = validate(updated)
      setErrors(prev => ({ ...prev, [field]: fieldErrors[field] || null }))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const allTouched = { name: true, email: true, state: true, phone: true, consent: true }
    setTouched(allTouched)
    const errs = validate(form)
    setErrors(errs)

    if (Object.keys(errs).length > 0) return
    if (submitting || submitted) return

    setSubmitting(true)
    setCallbackError('')
    try {
      const response = await fetch('/api/request-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          state: form.state,
          phone: form.phone,
          language: t.locale, // 'en-US' or 'es-MX' — backend routes to matching Telnyx assistant
          timezone: resolveTimezone(lang, form.state), // IANA tz for Cal.com booking
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || t.errors.submitFail)
      }
      setSubmitting(false)
      setSubmitted(true)
    } catch (error) {
      setSubmitting(false)
      setCallbackError(error?.message || t.errors.submitFail)
    }
  }

  const inputClasses = (field) => {
    const base = 'w-full px-[14px] py-[14px] bg-white border rounded-[10px] text-[16px] text-warm-dark placeholder-[#B5AFA8] font-sans'
    if (touched[field] && errors[field]) return `${base} field-error`
    if (touched[field] && !errors[field] && form[field]) return `${base} field-valid`
    return `${base} border-[#E5DFD6]`
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Nav */}
      <nav className="px-6 lg:px-12 py-5 flex items-center justify-between max-w-[1280px] mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-forest rounded-md flex items-center justify-center">
            <span className="text-gold font-serif text-[18px] leading-none mt-0.5">C</span>
          </div>
          <span className="font-serif text-forest text-[20px] tracking-[-0.3px]">Crestview Properties</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <LanguageToggle lang={lang} setLang={setLang} t={t} />
          <a href="tel:+18005551234" className="hidden sm:flex items-center gap-2 text-[14px] text-warm-gray hover:text-forest transition-colors">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14.5 11.35v1.95a1.3 1.3 0 01-1.42 1.3 12.86 12.86 0 01-5.61-2 12.67 12.67 0 01-3.9-3.9A12.86 12.86 0 011.58 3.1 1.3 1.3 0 012.87 1.7h1.95a1.3 1.3 0 011.3 1.12 8.35 8.35 0 00.45 1.83 1.3 1.3 0 01-.29 1.37l-.83.83a10.4 10.4 0 003.9 3.9l.83-.83a1.3 1.3 0 011.37-.29 8.35 8.35 0 001.83.45 1.3 1.3 0 011.12 1.32z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t.nav.phone}
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-8 lg:pt-16 pb-16 lg:pb-24">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 items-start">
          <div className="flex-1 lg:max-w-[520px] pt-2">
            <div className="inline-flex items-center gap-2 bg-forest/[0.06] rounded-full px-4 py-1.5 mb-8">
              <span className="inline-block w-[7px] h-[7px] rounded-full bg-emerald-500 pulse-dot" />
              <span className="text-[13px] text-forest font-medium tracking-[0.2px]">{t.badge}</span>
            </div>

            <h1 className="font-serif text-forest text-[42px] lg:text-[56px] leading-[1.08] tracking-[-1.5px] mb-5">
              {t.h1Line1}<br />
              <span className="relative inline-block">
                {t.h1Line2}
                <svg className="absolute -bottom-1 left-0 w-full" height="8" viewBox="0 0 300 8" preserveAspectRatio="none">
                  <path d="M2 5.5C50 2 100 6.5 150 3.5C200 0.5 250 5 298 3" stroke="#C8943E" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.45"/>
                </svg>
              </span>
            </h1>

            <p className="text-warm-gray text-[17px] lg:text-[18px] leading-[1.6] mb-10 max-w-[440px]">
              {t.subhead}
            </p>

            <div className="flex gap-8 lg:gap-12 mb-12">
              <div>
                <div className="font-serif text-forest text-[28px] lg:text-[32px] tracking-[-0.5px]">{clockSeconds}s</div>
                <div className="text-warm-gray text-[13px] mt-0.5">{t.stats.respLabel}</div>
              </div>
              <div className="w-px bg-[#E5DFD6]" />
              <div>
                <div className="font-serif text-forest text-[28px] lg:text-[32px] tracking-[-0.5px]">2,437</div>
                <div className="text-warm-gray text-[13px] mt-0.5">{t.stats.familiesLabel}</div>
              </div>
              <div className="w-px bg-[#E5DFD6]" />
              <div>
                <div className="font-serif text-forest text-[28px] lg:text-[32px] tracking-[-0.5px]">48</div>
                <div className="text-warm-gray text-[13px] mt-0.5">{t.stats.statesLabel}</div>
              </div>
            </div>

            <div className="bg-white/60 border border-[#E5DFD6] rounded-2xl p-5 lg:p-6 max-w-[420px]">
              <div className="flex gap-1 mb-3">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} width="16" height="16" viewBox="0 0 16 16" fill="#C8943E">
                    <path d="M8 1.5l1.85 3.75L14 5.88l-3 2.92.71 4.13L8 10.88l-3.71 2.05.71-4.13-3-2.92 4.15-.63z"/>
                  </svg>
                ))}
              </div>
              <p className="text-[14.5px] text-warm-dark leading-[1.55] italic mb-4">"{t.testimonial.quote}"</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-forest/10 flex items-center justify-center text-forest text-[13px] font-medium">
                  JR
                </div>
                <div>
                  <div className="text-[13px] font-medium text-warm-dark">{t.testimonial.name}</div>
                  <div className="text-[12px] text-warm-gray">{t.testimonial.location}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[460px] lg:flex-shrink-0 relative">
            <HandDrawnArrow />
            <div className="bg-white border border-[#E5DFD6] rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="bg-forest px-6 py-5 lg:px-8 lg:py-6">
                <h2 className="font-serif text-white text-[22px] lg:text-[24px] tracking-[-0.3px] mb-1">{t.formHeader}</h2>
                <p className="text-white/60 text-[14px]">{t.formSubheader}</p>
              </div>

              <div className="px-6 py-6 lg:px-8 lg:py-8">
                {submitted ? (
                  <SuccessState t={t} />
                ) : (
                  <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
                    <div>
                      <label htmlFor="name" className="block text-[13px] font-medium text-warm-dark mb-1.5 tracking-[0.1px]">
                        {t.labels.name}
                      </label>
                      <input
                        id="name"
                        type="text"
                        autoComplete="name"
                        placeholder={t.placeholders.name}
                        value={form.name}
                        onChange={e => handleChange('name', e.target.value)}
                        onBlur={() => handleBlur('name')}
                        className={inputClasses('name')}
                      />
                      {touched.name && errors.name && (
                        <p className="text-[12px] text-[#C4553A] mt-1.5 ml-0.5">{errors.name}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-[13px] font-medium text-warm-dark mb-1.5 tracking-[0.1px]">
                        {t.labels.email}
                      </label>
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        placeholder={t.placeholders.email}
                        value={form.email}
                        onChange={e => handleChange('email', e.target.value)}
                        onBlur={() => handleBlur('email')}
                        className={inputClasses('email')}
                      />
                      {touched.email && errors.email && (
                        <p className="text-[12px] text-[#C4553A] mt-1.5 ml-0.5">{errors.email}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="state" className="block text-[13px] font-medium text-warm-dark mb-1.5 tracking-[0.1px]">
                        {t.labels.state}
                        <span className="font-normal text-warm-gray ml-1">{t.labels.stateHint}</span>
                      </label>
                      <select
                        id="state"
                        value={form.state}
                        onChange={e => handleChange('state', e.target.value)}
                        onBlur={() => handleBlur('state')}
                        className={`${inputClasses('state')} ${!form.state ? 'text-[#B5AFA8]' : ''}`}
                      >
                        <option value="" disabled>{t.labels.statePlaceholder}</option>
                        {stateList.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      {touched.state && errors.state && (
                        <p className="text-[12px] text-[#C4553A] mt-1.5 ml-0.5">{errors.state}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="phone" className="block text-[13px] font-medium text-warm-dark mb-1.5 tracking-[0.1px]">
                        {t.labels.phone}
                      </label>
                      <div className={`phone-wrapper border rounded-[10px] overflow-hidden ${
                        touched.phone && errors.phone ? 'border-[#C4553A]' :
                        touched.phone && !errors.phone && form.phone ? 'border-[#4A7C5C]' :
                        'border-[#E5DFD6]'
                      }`}>
                        <PhoneInput
                          key={lang}
                          international={false}
                          defaultCountry={phoneCountry}
                          countries={['US', 'MX']}
                          addInternationalOption={false}
                          countryCallingCodeEditable={false}
                          placeholder={t.placeholders.phone}
                          value={form.phone}
                          onChange={value => handleChange('phone', value)}
                          onBlur={() => handleBlur('phone')}
                          inputComponent={undefined}
                        />
                      </div>
                      {touched.phone && errors.phone && (
                        <p className="text-[12px] text-[#C4553A] mt-1.5 ml-0.5">{errors.phone}</p>
                      )}
                    </div>

                    <div className="pt-1">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={form.consent}
                          onChange={e => handleChange('consent', e.target.checked)}
                          onBlur={() => handleBlur('consent')}
                          className="consent-checkbox mt-0.5"
                        />
                        <span className={`text-[12.5px] leading-[1.5] ${
                          touched.consent && errors.consent ? 'text-[#C4553A]' : 'text-warm-gray'
                        }`}>
                          {t.consent}{' '}
                          <a href="#privacy" className="underline hover:text-forest transition-colors">{t.privacyPolicy}</a>
                        </span>
                      </label>
                    </div>

                    {callbackError && (
                      <p className="text-[12px] text-[#C4553A] -mt-1">{callbackError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-gold hover:bg-gold-hover active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait text-white font-medium text-[16px] py-[15px] rounded-[10px] transition-all duration-150 mt-2 tracking-[0.2px]"
                    >
                      {submitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.3" />
                            <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                          {t.submitting}
                        </span>
                      ) : (
                        t.submit
                      )}
                    </button>

                    <div className="flex items-center justify-center gap-3 pt-1">
                      <div className="flex items-center gap-1.5 text-[12px] text-warm-gray">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M9.5 5.5H2.5V4a3.5 3.5 0 017 0v1.5z" stroke="#8C8279" strokeWidth="1" strokeLinecap="round"/>
                          <rect x="1.5" y="5.5" width="9" height="5.5" rx="1" stroke="#8C8279" strokeWidth="1"/>
                        </svg>
                        {t.micro.encrypted}
                      </div>
                      <span className="text-[#D4CFC8]">·</span>
                      <div className="text-[12px] text-warm-gray">{t.micro.noCard}</div>
                      <span className="text-[#D4CFC8]">·</span>
                      <div className="text-[12px] text-warm-gray">{t.micro.noObligation}</div>
                    </div>
                  </form>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 mt-5">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14.537 6.547H8.006V9.64h3.726c-.367 1.867-1.96 2.907-3.726 2.907A4.254 4.254 0 013.753 8.2a4.253 4.253 0 014.253-4.347c1.04 0 1.96.373 2.693 1l2.347-2.347C11.646.96 9.959.2 8.006.2A8 8 0 00.006 8.2a8 8 0 008 8c4.627 0 7.067-3.253 7.067-7.04 0-.6-.08-1.027-.187-1.427l-.35-.187z" fill="#4285F4"/>
                <path d="M.006 8.2a8 8 0 012.44-5.747l2.56 2.094a4.4 4.4 0 00-.753 3.653H.006z" fill="#34A853"/>
                <path d="M3.753 12.547l-2.56-1.987A7.99 7.99 0 008.006 16.2c1.88 0 3.56-.613 4.84-1.707l-2.48-1.947c-.72.467-1.6.747-2.613.747a4.18 4.18 0 01-3.96-2.747l-.04.001z" fill="#FBBC05"/>
                <path d="M15.073 6.547H14.537c-.107-.4-.187-.827-.187-1.427 0 3.787-2.44 7.04-7.067 7.04 1.014 0 1.894-.28 2.614-.747l2.48 1.947c1.346-1.16 2.16-2.973 2.16-5.24 0-.6-.08-1.027-.187-1.427l-.277-.146z" fill="#EA4335"/>
              </svg>
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} width="12" height="12" viewBox="0 0 16 16" fill="#FBBC05">
                    <path d="M8 1.5l1.85 3.75L14 5.88l-3 2.92.71 4.13L8 10.88l-3.71 2.05.71-4.13-3-2.92 4.15-.63z"/>
                  </svg>
                ))}
              </div>
              <span className="text-[12px] text-warm-gray">{t.googleRating}</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-[#E5DFD6] py-8 px-6 lg:px-12">
        <div className="max-w-[1280px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-[13px] text-warm-gray">
            &copy; {new Date().getFullYear()} Crestview Properties. {t.footer.rights}
          </div>
          <div className="flex items-center gap-6 text-[13px] text-warm-gray">
            <a href="#privacy" className="hover:text-forest transition-colors">{t.footer.privacy}</a>
            <a href="#terms" className="hover:text-forest transition-colors">{t.footer.terms}</a>
            <a href="#licenses" className="hover:text-forest transition-colors">{t.footer.licenses}</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
