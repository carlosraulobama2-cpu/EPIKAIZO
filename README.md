# Epikaizo Services

Web pública y panel de gestión de Epikaizo: construcción y mantenimiento, gestión administrativa y envíos de paquetes y dinero en Guinea Ecuatorial.

## Qué hay

| Parte | Dónde | Qué hace |
|---|---|---|
| Web pública | `public/index.html`, `construccion.html`, `envios.html`, `vehiculos.html` + `css/site.css`, `js/site.js` | Inicio (presentación, organigrama), Construcción y mantenimiento, Envíos (Epikaizo Exprés, cotizador y rastreo) y Vehículos (catálogo de Autos Epikaizo con buscador y filtros, desde el inventario del panel); formulario «Pide tu cita», asistente y WhatsApp |
| Panel | `public/panel.html`, `public/js/panel/` | Resumen, envíos, servicios y obras, clientes, bandeja, facturas, caja, informes, equipo, proveedores, actividad y ajustes |
| Servidor | `server/src/` | API Express + Postgres. Solo publica la carpeta `public/` |
| Pruebas | `server/test/` | Seguridad y flujos completos contra una base de datos de pruebas |

## Arrancar en local

Necesitas Node 22 y Postgres 16.

```bash
cd server
cp .env.example .env    # rellena DATABASE_URL, JWT_SECRET, ADMIN_EMAIL y ADMIN_PASSWORD
npm install
npm run dev             # http://localhost:3001  ·  panel en /panel
```

En el primer arranque se crean las tablas y el administrador inicial (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). Al entrar por primera vez, el panel obliga a cambiar la contraseña. **No existe ninguna contraseña por defecto.**

Para crear o recuperar un administrador desde la terminal (también en la Shell de Render):

```bash
npm run create-admin -- correo@empresa.com "Nombre Apellido"
```

## Pruebas

```bash
createdb epikaizo_test
TEST_DATABASE_URL=postgresql://USUARIO:CLAVE@localhost:5432/epikaizo_test npm test
```

Las pruebas borran y recrean la base de datos de pruebas: no apuntes `TEST_DATABASE_URL` a producción. GitHub Actions las ejecuta en cada cambio (`.github/workflows/ci.yml`).

## Roles

| Rol | Puede |
|---|---|
| Operador | Envíos, servicios y obras, clientes y bandeja |
| Gestor | Lo anterior, más facturas, caja, informes, equipo y proveedores |
| Administrador | Todo, incluidos accesos al panel, ajustes, actividad y copia de seguridad |

La empresa y el rol salen siempre de la sesión del usuario, nunca de lo que envía el navegador.

## Catálogo de vehículos

`server/catalog/autos-epikaizo-2026/` trae el catálogo de autos usados de Autos Epikaizo: 44 vehículos con sus fotos (WebP) y su precio en FCFA. Al arrancar, el servidor lo carga **una sola vez** en el inventario (queda apuntado en Ajustes como `catalog_imports`). Desde ahí se gestiona en el panel como cualquier otro vehículo: editar, reservar, vender o **Quitar** (solo si no tiene facturas). Lo que se quita o se vende no vuelve a aparecer en el siguiente despliegue.

- Para añadir otro catálogo, crea otra carpeta con su `catalog.json` y sus fotos en `fotos/`. Si algún dato o foto no es válido, no se carga nada.
- `CATALOG_IMPORT=off` desactiva la carga.
- Cada vehículo tiene su moneda (FCFA, USD o EUR). Su factura de venta sale en esa moneda, y los totales del panel se muestran separados por moneda.

## Facturación

| Caso | Documento | Cómo se hace en el panel |
|---|---|---|
| Obra o construcción | Presupuesto (PRE) → facturas de anticipo, certificación y liquidación | Servicios y obras → **Presupuestar** → el cliente acepta → **Facturar** un % (nunca más del 100 %) |
| Servicio o reparación | Factura (FAC) con líneas e IVA | Servicios y obras → **Facturar**, o Facturación → **Nueva factura** |
| Venta de vehículo | Factura con bastidor, matrícula y km, y contrato de compraventa | Vehículos → **Vender** (admite una señal y el resto pendiente) |
| Envío | Factura automática al registrarlo; queda pagada si se cobra en el mostrador | Automático |
| Error en una factura | Factura rectificativa (REC) | **Anular**: nunca se borra ni se edita una factura emitida |

Otras reglas:

- **Numeración:** cada serie (FAC, PRE, REC) tiene su numeración anual correlativa.
- **Cálculo:** los importes los calcula el servidor a partir de las líneas.
- **Cobros:** pueden ser parciales (la factura pasa a *parcial* y luego a *pagada*). Una factura con cobros solo se anula si se confirma la devolución al cliente.
- **Impresión:** `documento.html` imprime en A4 o guarda en PDF con el QR de verificación.
- **Ajustes:** en Ajustes → Facturación se configuran el NIF, la cuenta bancaria, el impuesto por defecto (15 %), los días de pago y la validez de los presupuestos. **Confirma el IVA y los textos legales con tu asesor.**
- **Informes:** las facturas cuentan por su base imponible (el IVA no es ingreso) y las rectificativas restan.

## Seguridad

- Sesión en cookie `HttpOnly`, `SameSite=Strict` y `Secure`. El JavaScript no puede leer el token.
- Contraseñas con bcrypt.
- Bloqueo de 15 minutos tras 5 intentos fallidos.
- Al cambiar la contraseña, el rol o bloquear a alguien, se cierran sus sesiones.
- Sin registro público: las cuentas las crea un administrador, con contraseña temporal.
- Consultas SQL siempre con parámetros. Toda entrada se valida en el servidor.
- El panel pinta los datos como texto, así que no hay XSS posible por `innerHTML`.
- Cabeceras CSP, `X-Frame-Options` y HSTS. Fuentes alojadas en el propio servidor: la web no hace peticiones a terceros.
- Límite de peticiones en login, contacto, rastreo, analítica y asistente.
- El webhook de WhatsApp comprueba la firma de Meta (`WHATSAPP_APP_SECRET`).
- El rastreo público muestra el nombre recortado de quien recibe y nunca teléfonos.
- La exportación CSV neutraliza fórmulas de Excel.
- Registro de actividad de solo lectura.

## Desplegar en Render

`render.yaml` ya está preparado (`rootDir: server`). En el panel de Render rellena:

- `DATABASE_URL`
- `ADMIN_EMAIL` y `ADMIN_PASSWORD` (mínimo 12 caracteres)
- Las claves de WhatsApp, Google AI y Gmail si las usas

`JWT_SECRET` se genera solo.

El webhook de WhatsApp es `https://TU-DOMINIO/api/whatsapp`. El verify token es el valor que pongas en `WHATSAPP_VERIFY_TOKEN`.

Las tablas de la versión anterior (con fechas en texto) no se borran: al migrar se renombran a `legacy_*` para conservar cualquier dato.

## Estructura

```
public/                 lo único que se publica
  index.html            inicio: presentación, misión, visión, valores, clientes
  construccion.html     construcción, mantenimiento, gestión de obras y metodología
  envios.html           cotizador, rastreo y empresas
  vehiculos.html        catálogo de Autos Epikaizo (fotos y precios desde el inventario del panel)
  panel.html            panel (módulos en js/panel/)
  login.html            acceso del equipo
  verificar.html        verificación del QR de las facturas
  privacidad.html       política de privacidad (borrador, revisar con un abogado)
  css/ js/ img/ fonts/
server/
  catalog/              catálogos de vehículos que se cargan una vez en el inventario
  src/app.js            rutas y permisos por rol, a la vista en un solo sitio
  src/migrations/       esquema SQL versionado
  src/routes/           una ruta por área
  src/services/         facturas, WhatsApp, ajustes, clientes, auditoría
  test/                 pruebas
assets-originales/      fotos y logo en alta resolución (no se publican)
```
