# Configuración de WhatsApp Business API

## 1. Crear cuenta en Meta Developer Portal

1. Ve a https://developers.facebook.com
2. Crea una app de tipo "Business"
3. Agrega el producto "WhatsApp"
4. Conecta tu número de teléfono empresarial (+240 222 580 828)

## 2. Obtener credenciales

En el panel de Meta Developer, obtén:
- **Phone Number ID**: ID del número de teléfono
- **Access Token**: Token de acceso permanente (o de corta duración renovable)
- **WhatsApp Business Account ID**: ID de la cuenta

## 3. Configurar variables de entorno

Edita el archivo `server/.env`:

```env
WHATSAPP_TOKEN=tu_access_token_aqui
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id_aqui
WHATSAPP_VERIFY_TOKEN=epk_verify_2026
WHATSAPP_API_VERSION=v19.0
```

## 4. Configurar webhook

1. En Meta Developer, ve a WhatsApp > Configuration
2. En "Webhook", ingresa la URL de tu servidor:
   - Producción: `https://tu-dominio.com/api/whatsapp`
   - Desarrollo: usa ngrok o similar para exponer tu localhost
3. Verify token: `epk_verify_2026`
4. Suscríbete a los eventos: `messages`

## 5. Iniciar el servidor

```bash
cd server
npm install
npm start
```

El webhook estará disponible en `GET /api/whatsapp` (verificación) y `POST /api/whatsapp` (mensajes entrantes).

## 6. Probar

Envía un mensaje desde WhatsApp a +240 222 580 828. El servidor responderá automáticamente con un mensaje de bienvenida.

## Endpoints adicionales

- `POST /api/whatsapp/send` - Enviar mensaje de texto
  ```json
  {
    "to": "240222580828",
    "text": "Hola desde Epicaizo"
  }
  ```

- `POST /api/whatsapp/template` - Enviar plantilla aprobada
  ```json
  {
    "to": "240222580828",
    "templateName": "nombre_de_plantilla",
    "languageCode": "es"
  }
  ```

## Notas

- Requiere que Meta apruebe tu cuenta de WhatsApp Business
- Las plantillas deben ser aprobadas previamente en Meta Business Manager
- En desarrollo local, usa ngrok: `ngrok http 3001`
