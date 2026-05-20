// 2026-accurate Mexican states + IANA timezone mapping.
// Mexico abolished nationwide DST Oct 30 2022 ("Ley de Husos Horarios").
// Northern border municipalities in Baja California, Chihuahua, Coahuila,
// Nuevo León, and Tamaulipas retain US-synced DST, but state-level mapping
// uses each state's dominant IANA zone.
//
// Notes on tricky cases:
// - Baja California (norte): America/Tijuana, UTC-8/-7, observes DST.
// - Baja California Sur: America/Mazatlan, UTC-7, no DST.
// - Sonora: America/Hermosillo, UTC-7, no DST (since 1998).
// - Chihuahua: America/Chihuahua. Post-2022 reform shifted most of the state
//   to UTC-6, but the IANA zone America/Chihuahua remains canonical and
//   tracks the correct offset (including border-municipality DST exceptions).
// - Quintana Roo: America/Cancun, UTC-5, no DST (since Feb 2015).
// - Sinaloa, Nayarit: America/Mazatlan, UTC-7, no DST.
//   (America/Bahia_Banderas exists but Nayarit at the state level maps to
//   Mazatlan; Bahia_Banderas is a sub-region alias rarely needed for forms.)
// - All other states: America/Mexico_City, UTC-6, no DST.

export const MX_STATES_ES = [
  'Aguascalientes',
  'Baja California',
  'Baja California Sur',
  'Campeche',
  'Chiapas',
  'Chihuahua',
  'Ciudad de México',
  'Coahuila',
  'Colima',
  'Durango',
  'Estado de México',
  'Guanajuato',
  'Guerrero',
  'Hidalgo',
  'Jalisco',
  'Michoacán',
  'Morelos',
  'Nayarit',
  'Nuevo León',
  'Oaxaca',
  'Puebla',
  'Querétaro',
  'Quintana Roo',
  'San Luis Potosí',
  'Sinaloa',
  'Sonora',
  'Tabasco',
  'Tamaulipas',
  'Tlaxcala',
  'Veracruz',
  'Yucatán',
  'Zacatecas',
]

export const MX_STATE_TIMEZONES = {
  'Aguascalientes': 'America/Mexico_City',
  'Baja California': 'America/Tijuana',
  'Baja California Sur': 'America/Mazatlan',
  'Campeche': 'America/Mexico_City',
  'Chiapas': 'America/Mexico_City',
  'Chihuahua': 'America/Chihuahua',
  'Ciudad de México': 'America/Mexico_City',
  'Coahuila': 'America/Mexico_City',
  'Colima': 'America/Mexico_City',
  'Durango': 'America/Mexico_City',
  'Estado de México': 'America/Mexico_City',
  'Guanajuato': 'America/Mexico_City',
  'Guerrero': 'America/Mexico_City',
  'Hidalgo': 'America/Mexico_City',
  'Jalisco': 'America/Mexico_City',
  'Michoacán': 'America/Mexico_City',
  'Morelos': 'America/Mexico_City',
  'Nayarit': 'America/Mazatlan',
  'Nuevo León': 'America/Mexico_City',
  'Oaxaca': 'America/Mexico_City',
  'Puebla': 'America/Mexico_City',
  'Querétaro': 'America/Mexico_City',
  'Quintana Roo': 'America/Cancun',
  'San Luis Potosí': 'America/Mexico_City',
  'Sinaloa': 'America/Mazatlan',
  'Sonora': 'America/Hermosillo',
  'Tabasco': 'America/Mexico_City',
  'Tamaulipas': 'America/Mexico_City',
  'Tlaxcala': 'America/Mexico_City',
  'Veracruz': 'America/Mexico_City',
  'Yucatán': 'America/Mexico_City',
  'Zacatecas': 'America/Mexico_City',
}
