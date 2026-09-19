# Criptografía y Certificados Digitales — Laboratorio

Página estática (HTML/CSS/JS) con demos reales de cifrado simétrico (AES-256-GCM),
cifrado asimétrico (RSA-OAEP) y una mini-PKI (ECDSA), todo corriendo en el navegador
con la Web Crypto API. Incluye un servidor Node.js mínimo para servir la página por
HTTPS con un certificado que tú mismo generas y aplicas.

## Estructura

```
index.html          # contenido y las 4 secciones
css/styles.css
js/app.js            # las demos criptográficas
server/server.js     # servidor HTTP+HTTPS, sin dependencias externas
server/certs/        # aquí van tus certificados (no se incluyen en el repo)
```

## Uso rápido (sin certificado)

Puedes abrir `index.html` directo en el navegador o servirlo con Live Server:
las secciones de cifrado simétrico, asimétrico y mini-PKI funcionan igual.
Lo único que requiere el servidor Node + certificado es el **Inspector de
certificado real** de la sección "Certificados TLS".

## Laboratorio: aplicar el certificado tú mismo

La guía completa con los comandos está también dentro de la página
(sección "04 · Laboratorio"). Resumen:

```powershell
# 1. Instalar mkcert
choco install mkcert

# 2. Instalar la CA local de mkcert en tu sistema/navegador
mkcert -install

# 3. Generar el certificado para localhost
cd server
mkdir certs
mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem localhost 127.0.0.1 ::1

# 4. Levantar el servidor
cd ..
npm start
```

Luego abre `https://localhost:8443`.

## Solución de problemas

- **"No se encontró el certificado"**: el servidor busca exactamente
  `server/certs/localhost.pem` y `server/certs/localhost-key.pem`. Revisa que
  el comando `mkcert` se haya ejecutado dentro de `server/` y no en la raíz.
- **El navegador sigue mostrando advertencia** después de `mkcert -install`:
  cierra y vuelve a abrir el navegador (algunos navegadores cachean el estado
  de confianza de certificados).
- **Puerto en uso**: cambia `HTTPS_PORT` / `HTTP_PORT` en `server/server.js`.
- **Quieres ver el caso "sin confianza"**: genera un certificado con OpenSSL
  sin pasar por mkcert (ver paso opcional dentro de la sección de laboratorio
  en la página) y compara la experiencia del navegador.
