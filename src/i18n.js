// Bilingual copy for Crestview callback page.
// Keep keys identical in `en` and `es` — every string the UI shows lives here.

import { MX_STATES_ES, MX_STATE_TIMEZONES } from './mx-locations'

export { MX_STATES_ES, MX_STATE_TIMEZONES }

// Resolve an IANA timezone for the lead so Cal.com books in their local time.
// MX leads: state → tz from authoritative map. EN leads: fall back to the
// browser's resolved timezone (more accurate than US-state→tz, which is
// multi-zone for ~12 states).
export function resolveTimezone(lang, state) {
  if (lang === 'es' && state && MX_STATE_TIMEZONES[state]) {
    return MX_STATE_TIMEZONES[state]
  }
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null
    } catch {
      return null
    }
  }
  return null
}

export const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire',
  'New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
  'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
  'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
  'Wisconsin','Wyoming'
]

export const COPY = {
  en: {
    locale: 'en-US',
    nav: { phone: '(800) 555-1234', langLabel: 'Language' },
    badge: 'Agents available now',
    h1Line1: "We'll call you back",
    h1Line2: 'in under 60 seconds',
    subhead: "Skip the hold music. Tell us where you're looking, and a local Crestview agent who knows the area will call you right back.",
    stats: {
      respLabel: 'avg. response',
      familiesLabel: 'families helped',
      statesLabel: 'states covered',
    },
    testimonial: {
      quote: "We listed on a Saturday and had an agent call us within a minute. Closed 18 days later, $12K over asking. Never had an experience like that before.",
      name: 'James Rivera',
      location: 'Sold in Austin, TX',
    },
    formHeader: 'Request your callback',
    formSubheader: '4 fields. Takes 30 seconds.',
    labels: {
      name: 'Full name',
      email: 'Email',
      state: 'State',
      stateHint: '— so we match your timezone',
      statePlaceholder: 'Choose your state',
      phone: 'Phone number',
    },
    placeholders: {
      name: 'Sarah Johnson',
      email: 'sarah@email.com',
      phone: '(555) 123-4567',
    },
    errors: {
      nameRequired: 'We need this one',
      nameShort: 'A bit short — full name?',
      emailRequired: 'We need this one',
      emailInvalid: "That doesn't look right",
      stateRequired: 'Pick your state',
      phoneRequired: 'We need this to call you',
      phoneInvalid: "Hmm, that doesn't look like a phone number",
      consentRequired: 'Required to proceed',
      submitFail: 'Could not start your callback right now.',
    },
    consent: 'By providing my phone number, I consent to receive a call from Crestview Properties, including via automated technology, regarding their services. Consent is not a condition of purchase.',
    privacyPolicy: 'Privacy Policy',
    submit: 'Request My Callback',
    submitting: 'Connecting you...',
    micro: { encrypted: 'Encrypted', noCard: 'No credit card', noObligation: 'No obligation' },
    success: {
      title: "We're calling you now",
      body: "Your phone should ring within 60 seconds. If you miss us, we'll try once more and send a text.",
      connecting: 'Connecting you with a local agent',
    },
    googleRating: '4.9 on Google · 312 reviews',
    footer: { rights: 'All rights reserved.', privacy: 'Privacy', terms: 'Terms', licenses: 'Licenses' },
    switchTo: 'Español',
    switchToFullLabel: 'Switch to Spanish',
  },
  es: {
    locale: 'es-MX',
    nav: { phone: '(800) 555-1234', langLabel: 'Idioma' },
    badge: 'Asesores disponibles ahora',
    h1Line1: 'Te devolvemos la llamada',
    h1Line2: 'en menos de 60 segundos',
    subhead: 'Olvídate de la música de espera. Cuéntanos dónde estás buscando, y un asesor local de Crestview que conoce la zona te marca de vuelta.',
    stats: {
      respLabel: 'respuesta promedio',
      familiesLabel: 'familias atendidas',
      statesLabel: 'estados cubiertos',
    },
    testimonial: {
      quote: 'Pusimos la casa un sábado y un asesor nos marcó en menos de un minuto. Cerramos 18 días después, 12 mil dólares arriba del precio de lista. Nunca habíamos tenido una experiencia así.',
      name: 'James Rivera',
      location: 'Vendió en Austin, TX',
    },
    formHeader: 'Solicita tu llamada',
    formSubheader: '4 campos. Te lleva 30 segundos.',
    labels: {
      name: 'Nombre completo',
      email: 'Correo electrónico',
      state: 'Estado',
      stateHint: '— para ajustar tu zona horaria',
      statePlaceholder: 'Elige tu estado',
      phone: 'Número de teléfono',
    },
    placeholders: {
      name: 'María González',
      email: 'maria@correo.com',
      phone: '(555) 123-4567',
    },
    errors: {
      nameRequired: 'Este campo es necesario',
      nameShort: 'Un poco corto — ¿nombre completo?',
      emailRequired: 'Este campo es necesario',
      emailInvalid: 'No parece correcto',
      stateRequired: 'Elige tu estado',
      phoneRequired: 'Necesitamos esto para marcarte',
      phoneInvalid: 'Mmm, eso no parece un número válido',
      consentRequired: 'Requerido para continuar',
      submitFail: 'No pudimos iniciar tu llamada en este momento.',
    },
    consent: 'Al proporcionar mi número de teléfono, doy mi consentimiento para recibir una llamada de Crestview Properties, incluyendo mediante tecnología automatizada, en relación con sus servicios. El consentimiento no es una condición de compra.',
    privacyPolicy: 'Aviso de Privacidad',
    submit: 'Quiero mi llamada',
    submitting: 'Conectándote...',
    micro: { encrypted: 'Cifrado', noCard: 'Sin tarjeta', noObligation: 'Sin compromiso' },
    success: {
      title: 'Te estamos marcando ahora',
      body: 'Tu teléfono debe sonar en menos de 60 segundos. Si no contestas, intentamos una vez más y te mandamos un mensaje.',
      connecting: 'Conectándote con un asesor local',
    },
    googleRating: '4.9 en Google · 312 reseñas',
    footer: { rights: 'Todos los derechos reservados.', privacy: 'Privacidad', terms: 'Términos', licenses: 'Licencias' },
    switchTo: 'English',
    switchToFullLabel: 'Cambiar a inglés',
  },
}
