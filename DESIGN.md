# Diseño de Epikaizo

Cómo se ve, se siente y habla Epikaizo en la web pública (`public/*.html`) y en el panel de gestión (`panel-de-control/`, servido en `/panel/`). Antes de crear o cambiar una página, léelo; si algo de aquí ya no es verdad en el código, corrige este documento en el mismo cambio.

La fuente de verdad de los valores es el código: `public/css/site.css` (web) y `panel-de-control/css/panel.css` (panel). Este documento dice **cuándo** y **para qué** se usa cada cosa.

---

## 1. Personalidad

Epikaizo Services S.L. es una empresa de Guinea Ecuatorial que construye, mantiene inmuebles, envía paquetes y vende vehículos. Quien entra en la web quiere saber si puede **confiar** en nosotros y **cómo pedir una cita**. Mucha gente llega desde el móvil y con mala red.

- **Sólida y seria.** Una constructora: líneas limpias, mucho blanco, nada de adornos que no sirvan. El azul del logo manda; el rojo solo subraya.
- **Cercana.** Hablamos de tú, con frases cortas y verbos claros: «Pide tu cita», «Calcula el precio», «Escribir por WhatsApp».
- **Honesta.** Nunca inventamos cifras, clientes ni testimonios. Si un dato no es real, no se publica.
- **Una acción por bloque.** Cada sección termina en una sola cosa que hacer (pedir cita, calcular, rastrear, ver el catálogo).
- **Rápida en cualquier red.** Fotos WebP, fuentes propias sin servicios externos y la página entera usable aunque falle el JavaScript.

## 2. Color

Los colores salen del logo: **azul real `#070594`** y **rojo `#DC1E28`**. Usa siempre los tokens (`var(--brand)`), nunca el código hexadecimal en una regla. La web solo tiene modo claro.

### Tokens de la web (`site.css`)

| Token | Valor | Para qué |
|---|---|---|
| `--brand` | `#2027B8` | Botón principal, enlaces, iconos, foco, estado activo |
| `--brand-dark` | `#070594` | Azul del logo: bandas de lema, tarjeta de visión, cabecera del chat, cifras grandes |
| `--brand-700` | `#161B8F` | Paso intermedio en degradados oscuros |
| `--brand-300` | `#AEB3FF` | Texto de acento **sobre fondo oscuro** (antetítulos, firmas) |
| `--brand-200` | `#C9CDF7` | Borde de chips |
| `--brand-100` | `#DCE0FF` | Anillo de foco de campos, paso actual |
| `--brand-50` | `#EEF0FF` | Fondo de iconos, chips, resplandor de la portada |
| `--red` | `#DC1E28` | **Solo acentos**: subrayado del título, barra de valores, cargos del organigrama, borde de «Bienvenidos» |
| `--ink` | `#0B1020` | Títulos, pie de página, botón oscuro |
| `--ink-soft` | `#1E2433` | Hover del botón oscuro |
| `--text` | `#283044` | Texto de lectura |
| `--muted` | `#5B6476` | Texto secundario, descripciones, notas |
| `--line` | `#E3E6EE` | Bordes de tarjetas y separadores |
| `--line-strong` | `#CDD2DE` | Borde de campos de formulario |
| `--tint` | `#F4F5FA` | Secciones alternas, chips de datos, fondo del chat |
| `--white` | `#FFFFFF` | Fondo de página y tarjetas |
| `--ok` / `--ok-50` | `#0E8A5F` / `#E6F6EF` | Formulario enviado, documento verificado |
| `--warn` / `--warn-50` | `#B45309` / `#FEF3E2` | Vehículo reservado |
| `--bad` / `--bad-50` | `#C81E1E` / `#FDECEC` | Errores de formulario, documento no válido |
| `--whatsapp` | `#1FAF58` | Solo botones de WhatsApp |

### Reglas

- **Fondos de sección:** blanco, `--tint` para alternar, y como mucho **una** sección oscura por página (`.section--dark`, degradado `--brand-dark` → `--brand-700` → `--ink`).
- **Rojo con cuentagotas.** Nunca en botones, textos largos ni fondos. Si dudas, no lo uses.
- **Estados con su color y su palabra.** Verde, ámbar y rojo siempre van con un texto («Reservado», «Documento válido»), nunca solo con el color.
- **Panel:** usa los mismos azules, rojo y estados; tiene además `--info` / `--info-50` y un texto algo más oscuro (`--text: #1E2433`) para tablas densas.

### Prohibido

- Hexadecimales sueltos en reglas CSS o en atributos `style=""`. Si falta un color, se crea un token aquí y en `:root`.
- Otros azules, morados o degradados de colores ajenos al logo.
- Texto `--muted` sobre `--brand-50` o sobre fotos.

## 3. Tipografía

Tres familias servidas desde `/fonts` (sin Google Fonts), declaradas en `css/fonts.css`:

| Familia | Token | Pesos | Para qué |
|---|---|---|---|
| **Space Grotesk** | `--display` | 500, 600, 700 | Títulos `h1`–`h3`, cifras grandes (precios, totales, 404), lemas |
| **Work Sans** | `--font` | 400, 500, 600, 700 | Todo el texto, botones y formularios |
| **JetBrains Mono** | `--mono` | 500, 600 | Antetítulos (`.eyebrow`), guías de envío `EPZ-000000`, referencias `VEH-0000` |

| Uso | Tamaño |
|---|---|
| `h1` portada | `clamp(38px, 5.4vw, 64px)` |
| `h1` de página | `clamp(34px, 4.4vw, 54px)` |
| `h2` | `clamp(28px, 3.6vw, 42px)` |
| `h3` | 19px |
| Texto | 16px (15,5px en móvil), interlineado 1,6 |
| Entradilla (`.lead`) | 18px, `--muted`, máx. 56 caracteres por línea |
| Antetítulo (`.eyebrow`) | 13px mono, mayúsculas, espaciado .08em, `--brand` |

- Títulos con `letter-spacing: -.02em` e interlineado 1,12.
- Los títulos terminan en punto: «Elige lo que necesitas.»
- Una sola palabra destacada por portada con `.hl` (azul con subrayado rojo).

## 4. Espacio, forma y profundidad

### Radios

| Token | Valor | Para qué |
|---|---|---|
| `--r-xs` | 8px | Etiquetas pequeñas, chips de datos, tareas del organigrama |
| `--r-sm` | 10px | Botones, campos, avisos |
| `--r-md` | 12px | Iconos de pasos, tipos de cliente, control segmentado |
| `--r` | 14px | Iconos de servicio, insignias flotantes, burbujas del chat, fotos pequeñas |
| `--r-lg` | 22px | Tarjetas, paneles, fotos grandes, bloques de sección |
| `--r-pill` | 999px | Chips de valores, insignias de estado, botón del asistente |

No uses otros radios. Detalles de 2–4px (barras del menú, subrayados) son la única excepción.

### Espacio

- Ancho máximo de contenido: `--wrap` = 1180px, con 20px de margen lateral (`.container`).
- Secciones: 96px arriba y abajo (64px en móvil); `.section--tight` = 56px.
- Huecos de rejilla: 24px entre tarjetas, 16–20px en listas densas, 12–14px dentro de formularios.

### Profundidad

- Una sola sombra suave (`--shadow`) para tarjetas al pasar el ratón, paneles de formulario e insignias.
- Las tarjetas en reposo **no** llevan sombra: solo borde `--line`.
- Las fotos de portada llevan una sombra azulada larga; ninguna otra imagen.

## 5. Movimiento

- Transiciones de 150–250 ms en color, borde, sombra y posición. Nada más largo.
- Tarjetas enlazables suben 3–4px al pasar el ratón; botones bajan 1px al pulsar.
- Nada se mueve solo: sin carruseles automáticos, sin animaciones en bucle.
- Con `prefers-reduced-motion` se apagan todas las transiciones (ya está en `site.css`).

## 6. Textos y tono

- **Tú**, nunca usted. Frases cortas. Verbo al principio en botones: «Pide tu cita», «Calcular», «Rastrear», «Me interesa».
- El nombre legal se escribe **EPIKAIZO SERVICES S.L.** en textos formales y **Epikaizo** en el resto.
- **Dinero:** francos CFA sin decimales y con el símbolo detrás: `1.250.000 FCFA` (función `money()` de `site.js`). Nunca «XAF» de cara al cliente.
- **Fechas:** formato español (`3 nov, 14:30`). **Teléfonos:** `+240 222 580 828`.
- **Guías y referencias** en mono y mayúsculas: `EPZ-123456`, `VEH-0012`.
- **Prohibido inventar** cifras («+32.000 envíos»), testimonios, logos de clientes o premios. Solo hechos de la empresa.
- Los errores dicen qué hacer: «Revisa el teléfono: debe empezar por +240», no «Error de validación».

## 7. Componentes

### Estructura de página

Cabecera fija (72px, logo + menú + botón «Pide tu cita») → portada (`.hero`) → secciones alternas → banda del lema (`.slogan`) → pie oscuro. Botón flotante de WhatsApp y asistente en todas las páginas públicas.

### Botones

| Clase | Cuándo |
|---|---|
| `.btn--primary` | La acción principal del bloque. **Una por bloque.** |
| `.btn--ghost` | Acción secundaria junto a la principal |
| `.btn--dark` | Acción sobre fondo `--tint` cuando el azul ya se usa cerca |
| `.btn--light` | Acción principal sobre fondo oscuro |
| `.btn--whatsapp` / `.btn--wa` | Solo para abrir WhatsApp |

Alto mínimo 44px (`.btn--lg` = 52px). Texto en una línea.

### Tarjetas

- **De área o servicio** (`.area`, `.service`): foto 4:3 arriba, icono + título + texto + enlace «… →». Toda la tarjeta es el enlace.
- **De información** (`.reasons`, `.method`, `.xsvc`, `.mv__card`): icono `.ico`, título `h3`, texto `--muted`.
- **Variante oscura** (`.mv__card--dark`, `.org__lead`): fondo `--brand-dark`; como mucho una por sección.

### Formularios

- Etiqueta encima del campo, en 14,5px y `--ink`. Lo opcional se marca con `(opcional)` en `.opt`.
- Campo de 48px, borde `--line-strong`, foco con borde `--brand` y anillo `--brand-100`.
- Error bajo el formulario en `.form-error` (con `role="alert"`); éxito en `.form-ok`.
- Todo formulario público lleva el campo trampa `.hp` y la casilla de privacidad.

### Envíos

- Cotizador en un `.panel` con control segmentado (Paquete / Dinero) y total grande en `--display`.
- Rastreo: campo mono en mayúsculas, pasos `.steps` numerados (hechos en azul con ✓, actual con anillo) y lista de eventos con fecha.

### Vehículos

- Tarjeta `.car`: foto 220px (abre la galería), insignia de estado, datos en chips `.car__specs`, precio en `--display` y dos acciones («Me interesa» + WhatsApp).
- Sin foto: icono de coche sobre degradado `--brand-50`.
- Reservado: insignia ámbar `.car__badge--res`. Vendido: no se muestra.

### Carga, vacío y error

- Vacío: bloque `--tint` centrado con una frase y una acción (`.cars__empty`).
- Si la API falla, se dice con calma y se ofrece WhatsApp o teléfono. Nunca datos de ejemplo.

## 8. Iconos

- SVG en línea, rejilla de 24, trazo 1,8, puntas y uniones redondeadas, sin relleno (`.ico svg`).
- Siempre dentro de `.ico` (48px, fondo `--brand-50`, icono `--brand`) o `.ico--sm` (34px).
- Decorativos con `aria-hidden="true"`; el significado lo da el texto de al lado.
- Sin librerías de iconos ni emojis como iconos.

## 9. Imágenes

- **WebP**, como máximo 900px de lado para fotos de sección; `og.jpg` para redes sociales.
- Siempre `width`, `height` y `alt` descriptivo («Furgoneta de reparto de Epikaizo», no «imagen1»).
- `loading="lazy"` en todo lo que no sea la portada; la foto de portada lleva `fetchpriority="high"`.
- Fotos reales de la empresa (sede, obras, furgoneta, catálogo). Nada de fotos de banco con personas que no son del equipo.
- Los originales grandes viven en `assets-originales/`; a `public/img` solo llega la versión optimizada.

## 10. Accesibilidad y redes lentas

- Contraste mínimo 4,5:1 en texto (los tokens de texto lo cumplen sobre blanco y `--tint`).
- Foco visible en todo: contorno de 3px `--brand` (`:focus-visible`).
- Enlace «Saltar al contenido», `lang="es"`, un solo `h1` por página, `aria-current="page"` en el menú.
- Objetivos táctiles de 44px como mínimo.
- Puntos de corte: **1000px** (rejillas a 2 columnas), **820px** (menú desplegable), **640px** (una columna).
- Sin dependencias externas en tiempo de carga: fuentes, iconos y scripts se sirven desde el propio servidor.

## 11. Web y panel

| | Web pública | Panel |
|---|---|---|
| Carpeta | `public/` | `panel-de-control/` |
| CSS | `public/css/site.css` | `panel-de-control/css/panel.css` |
| Densidad | Aireada, secciones de 96px | Compacta, tablas y cajones |
| Radios | `--r-lg` 22px en tarjetas | `--r-lg` 16px en tarjetas |
| Texto | `--text: #283044` | `--text: #1E2433` |
| Colores de marca y estado | Los mismos tokens | Los mismos tokens + `--info` |

Si cambias un color de marca o de estado, cámbialo en **los dos** archivos.

## 12. Antes de dar por terminada una página

- [ ] Ningún hexadecimal nuevo fuera de `:root`; ningún `style=""`.
- [ ] Solo radios de la tabla del punto 4.
- [ ] Una acción principal por bloque y una sección oscura como mucho.
- [ ] Precios en FCFA sin decimales; nada de cifras inventadas.
- [ ] Imágenes WebP con `width`, `height`, `alt` y `loading="lazy"`.
- [ ] Se ve bien a 375px, 820px y 1280px, sin scroll horizontal.
- [ ] Se puede recorrer con el teclado y el foco se ve.
- [ ] Título y descripción `<meta>` propios, y la página está en `sitemap.xml`.
