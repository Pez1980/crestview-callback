# Crestview Callback Agent — Versión Español Mexicano

Versión localizada del agente de voz para devoluciones de llamada de Crestview Propiedades, optimizada para sonar como una persona real hablando español mexicano neutro.

## Archivos

| Archivo | Propósito |
|---------|-----------|
| `assistant.es-MX.json` | Config completa del asistente Telnyx — prompt, herramientas, voz, interrupciones |
| `webhook-handler.js` | Webhook de variables dinámicas (compartido con la versión en inglés) |

## Decisión de voz: ElevenLabs, no Telnyx native

Las voces nativas `Telnyx.NaturalHD.*` son **solo en inglés**. Las opciones de español dentro de Telnyx pasan por Azure/Google y suenan robóticas en español mexicano — entonación plana, vocales mal ligadas, ese "tono de GPS" inconfundible.

**Elegido: ElevenLabs vía integración nativa de Telnyx Voice AI.**

### Configuración exacta

```json
{
  "provider": "elevenlabs",
  "voice_id": "9Godp7dNohUvXk6qp0gS",
  "model": "eleven_multilingual_v2",
  "stability": 0.45,
  "similarity_boost": 0.75,
  "style": 0.35,
  "use_speaker_boost": true,
  "language": "es-MX",
  "speed": 1.0
}
```

### Por qué Multilingual v2 (NO v3)

- **v3 queda descartada por latencia.** v3 corre 800-1500ms TTFB. Para voz AI conversacional el techo aceptable es ~400ms, ideal <300ms. v3 introduce silencios incómodos que matan la sensación de persona real, sin importar qué tan bueno suene el audio.
- **Turbo v2.5 es más rápido (~250ms)** pero pierde calidez y entonación en español. Para bienes raíces queremos calidez > velocidad máxima.
- **Multilingual v2** = ~400-600ms TTFB, mejor prosodia mexicana, calidez intacta. Es el punto óptimo para voz AI en español de venta.

### Voz: Regina - Contact Center (native MX female)

- `voice_id: 9Godp7dNohUvXk6qp0gS` (Regina-Contact-Center, ElevenLabs Voice Library)
- Acento mexicano neutro — sin marca regional fuerte (no chilanga, no norteña, no yucateca). Entendible para cualquier mercado hispanohablante.
- Tono cálido, joven-adulto profesional. 78% de los compradores en bienes raíces responden mejor a voces femeninas en cold callbacks.

**Alternativas si quieres A/B test:**
- `Mauro` — masculina MX neutral, buena para mercados donde la voz femenina genera rechazo
- Voz clonada custom: graba 3-5 min con una actriz de doblaje mexicana (CDMX o Guadalajara) y crea un voice clone profesional en ElevenLabs ($22/mes Creator+). Es el techo absoluto de naturalidad.

### Tuning de parámetros — qué hace cada uno

| Parámetro | Valor | Por qué |
|-----------|-------|---------|
| `stability` | 0.45 | Bajo = más variación prosódica = más humano. Subir a 0.6 si tiembla mucho la voz. |
| `similarity_boost` | 0.75 | Conserva el timbre de Regina. Bajar daña la identidad de la voz. |
| `style` | 0.35 | Expresividad media — calidez sin teatralidad. 0.5+ suena vendedora forzada. |
| `use_speaker_boost` | true | Compresión que ayuda en teléfono PSTN — siempre activado para voz por línea. |
| `speed` | 1.0 | Default. NO acelerar a 1.1+ en español — el cerebro lo procesa como ansiedad. |

### Plan B si ElevenLabs cae

Failover automático a `Azure es-MX-DaliaNeural` vía Telnyx TTS provider routing. Es robótica pero mutuamente inteligible. **JAMÁS** caer de vuelta a `Telnyx.NaturalHD.Estelle` — está en inglés y va a sonar a inglés-con-acento sobre texto español.

## Decisiones de lenguaje en el prompt

Lo que separa un prompt "español traducido" de un prompt **mexicano**:

### Lo que SÍ usa
- **Tú** (no usted) — moderno, cercano, alineado con bienes raíces consumer 2026
- Muletillas reales: `mira`, `fíjate`, `este...`, `pues`, `claro`, `sale`, `órale`, `va`, `ándale`, `oye`
- Diminutivos cercanos: `rapidito`, `tantito`, `ahorita`, `un momentito`
- Vocabulario MX: `celular`, `recámara`, `departamento`, `colonia`, `renta`, `platicar`, `agendar`
- Despedidas mexicanas: `que tengas excelente día`, `que te vaya bonito`, `hablamos pronto`

### Lo que NO usa (banlist explícita en el prompt)
- Voseo argentino: `vos`, `sabés`, `querés`
- España: `vale`, `tío`, `coger`, `móvil`, `piso`, `apartamento`, `gilipollas`
- Ceceo: el modelo TTS pronuncia c/z igual que s
- Traducciones literales del inglés (`tener un buen día` → suena gringo)

### Ajustes de timing para español

Español hablado tiene más sílabas por palabra que inglés. Subí los timings de endpointing:

| Parámetro | EN original | ES-MX | Por qué |
|-----------|-------------|-------|---------|
| `wait_seconds` | 0.4 | 0.5 | Las pausas naturales en español son ligeramente más largas |
| `on_punctuation_seconds` | 0.1 | 0.15 | Las comas en español marcan más respiración |
| `on_no_punctuation_seconds` | 1.5 | 1.6 | Las frases sin puntuación final tardan más en cerrarse |
| `on_number_seconds` | 1.0 | 1.2 | Los números en español tienen más sílabas (ochocientos vs eight hundred) |

### Pronunciación de números

Regla explícita en el prompt: dilo agrupado y pausado. `800-555-1234` → `"ochocientos, cinco cinco cinco, doce treinta y cuatro"`. ElevenLabs pronuncia números arábigos en español por default, pero el modelo a veces los recita dígito por dígito de forma robótica — la instrucción en el system prompt fuerza el agrupamiento natural.

## Pasos para activar

### 1. Crear el asistente en Telnyx

```bash
curl -X POST https://api.telnyx.com/v2/ai/assistants \
  -H "Authorization: Bearer YOUR_TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d @assistant.es-MX.json
```

### 2. Conectar tu cuenta de ElevenLabs en Telnyx Portal

Telnyx Portal → Voice AI → TTS Providers → Add ElevenLabs → pegar API key. El `voice_id` Regina debe estar disponible en tu cuenta (está en el catálogo público — agrégalo a "My Voices" antes).

### 3. Reemplazar webhooks

Cambia todos los `YOUR_API_DOMAIN` por tu dominio real. Los endpoints son los mismos del agente en inglés — el handler solo necesita devolver `first_name`, `full_name`, `state`, `email` (no hay cambios de schema).

### 4. Plantilla SMS de confirmación

El tool `send_sms_confirmation` ahora pasa `language: "es-MX"`. Tu endpoint `/api/telnyx/sms-confirm` debe leer ese campo y elegir plantilla:

```js
// Pseudocódigo en sms-confirm handler
const template = language === 'es-MX'
  ? `Hola ${first_name}, confirmamos tu asesoría con ${agent_name} el ${formatDateES(appointment_datetime)}. Si necesitas reagendar, responde a este mensaje. — Crestview Propiedades`
  : enTemplate;
```

### 5. Mensaje de buzón de voz

Ya está localizado en el prompt (regla explícita en sección RULES). Si activas AMD agresivo, valida que cae al script español.

### 6. Línea de transferencia humana

Apunta `transfer_to_human` a tu línea con agente bilingüe o nativo en español. Si transfieres a una línea en inglés, vas a quemar el lead.

## Métricas objetivo (mismas que EN, ajustes esperados)

| Métrica | EN target | ES-MX target | Por qué la diferencia |
|---------|-----------|--------------|------------------------|
| Pickup rate | >40% | >45% | Hispanos en US contestan más a callbacks rápidos |
| Booking conversion (de los que contestan) | >25% | >28% | Mayor afinidad cuando los atiende voz en español |
| Duración promedio (booked) | <2 min | <2:15 min | Conversaciones en español son ~10% más largas |
| First response latency | <400ms | <500ms | Aceptable con Multilingual v2 |
| Transfer-to-human rate | <10% | <12% | Algunos prospectos van a pedir humano de plano |
| Voicemail rate | <30% | <30% | Sin diferencia esperada |

## Checklist de QA antes de producción

- [ ] Llamadas de prueba a 3 números MX y 3 números US-Hispanic (CA, TX, FL) — graba y revisa
- [ ] Pronunciación correcta de tu marca: `"Crestview"` — confirma que la voz no lo cecea ni lo deletrea
- [ ] Pronunciación de email: dictarle a la voz un correo con punto y guión bajo, validar que dice `"punto"` y `"guión bajo"` (no `"dot"` ni `"underscore"`)
- [ ] Pronunciación de teléfono: confirma agrupamiento natural, no dígito por dígito
- [ ] AMD con buzón en español MX (Telcel/AT&T MX y T-Mobile US Hispanic) — confirma que reconoce el buzón y deja el mensaje correcto
- [ ] Test de interrupción: prospecto interrumpe a media frase — confirma que la voz corta rápido (<500ms) y no se monta
- [ ] Test del 'no me interesa': confirma que después de UN redireccionamiento, si vuelve a decir no, cuelga con cortesía
- [ ] Test de '¿eres un robot?': confirma la respuesta honesta sin negar
- [ ] Latencia end-to-end medida con el `audio_after_connect` metric — apuntar a <700ms ideal, <1000ms tolerable
