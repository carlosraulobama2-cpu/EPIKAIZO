# Configurar WhatsApp Business (Meta)

## 1. Crear la app en Meta

1. Entra en https://developers.facebook.com y crea una app de tipo **Business**.
2. Añade el producto **WhatsApp** y conecta el número de la empresa (+240 222 580 828).

## 2. Datos que necesitas

En el panel de Meta copia:

- **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID`
- **Token de acceso permanente** (usuario del sistema) → `WHATSAPP_TOKEN`
- **App Secret** (Configuración de la app > Básica) → `WHATSAPP_APP_SECRET`
- Un **verify token** inventado por ti, largo y aleatorio → `WHATSAPP_VERIFY_TOKEN`

Ponlos como variables de entorno en Render, o en `server/.env` en local. **Nunca en el código ni en `render.yaml`.**

## 3. Webhook

1. En Meta ve a **WhatsApp > Configuración > Webhook**.
2. URL: `https://epikaizo.com/api/whatsapp`
3. Verify token: el mismo valor que pusiste en `WHATSAPP_VERIFY_TOKEN`.
4. Suscríbete al evento `messages`.

El servidor solo acepta avisos firmados por Meta, es decir, con la cabecera `X-Hub-Signature-256` firmada con tu App Secret.

## 4. Qué hace

- **Mensajes entrantes.** Llegan a la **Bandeja** del panel, sin duplicados aunque Meta los reenvíe, y reciben una respuesta automática corta.
- **Respuestas desde el panel.** En la Bandeja, abre el mensaje y pulsa **Enviar por WhatsApp**.
- **Facturas.** Al marcar un envío como **Entregado**, el destinatario recibe la factura con su código QR de verificación. También se puede enviar desde **Facturas**.

## Notas

- Meta tiene que aprobar la cuenta de WhatsApp Business.
- Fuera de la ventana de 24 horas desde el último mensaje del cliente, Meta solo permite **plantillas** aprobadas.
- En local puedes exponer el servidor con `ngrok http 3001` para probar el webhook.
