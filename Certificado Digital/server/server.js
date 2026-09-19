'use strict';

const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT_DIR = path.join(__dirname, '..');
const CERTS_DIR = path.join(__dirname, 'certs');
const CERT_PATH = path.join(CERTS_DIR, 'localhost.pem');
const KEY_PATH = path.join(CERTS_DIR, 'localhost-key.pem');

const HTTPS_PORT = 8443;
const HTTP_PORT = 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
  console.error('No se encontró el certificado.');
  console.error(`Se esperaba: ${CERT_PATH}`);
  console.error(`y:          ${KEY_PATH}`);
  console.error('\nGenera el certificado con mkcert antes de arrancar el servidor:');
  console.error('  cd server');
  console.error('  mkdir certs');
  console.error('  mkcert -key-file certs/localhost-key.pem -cert-file certs/localhost.pem localhost 127.0.0.1 ::1');
  process.exit(1);
}

const certPem = fs.readFileSync(CERT_PATH);
const keyPem = fs.readFileSync(KEY_PATH);

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(ROOT_DIR, urlPath));
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 - No encontrado');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function serveCertInfo(req, res) {
  try {
    const x509 = new crypto.X509Certificate(certPem);

    const info = {
      subject: x509.subject,
      issuer: x509.issuer,
      validFrom: x509.validFrom,
      validTo: x509.validTo,
      serialNumber: x509.serialNumber,
      fingerprint256: x509.fingerprint256,
      subjectAltName: x509.subjectAltName || null,
      publicKey: {
        type: x509.publicKey.asymmetricKeyType,
        details: x509.publicKey.asymmetricKeyDetails || null,
      },
      isCA: x509.ca,
    };

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(info, null, 2));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'No se pudo leer el certificado', detail: String(err) }));
  }
}

const httpsServer = https.createServer({ cert: certPem, key: keyPem }, (req, res) => {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000');

  if (req.url.startsWith('/api/cert-info')) {
    serveCertInfo(req, res);
    return;
  }
  serveStatic(req, res);
});

const httpServer = http.createServer((req, res) => {
  const host = (req.headers.host || 'localhost').split(':')[0];
  res.writeHead(301, { Location: `https://${host}:${HTTPS_PORT}${req.url}` });
  res.end();
});

httpsServer.listen(HTTPS_PORT, () => {
  console.log(`HTTPS: https://localhost:${HTTPS_PORT}`);
});

httpServer.listen(HTTP_PORT, () => {
  console.log(`HTTP (redirige a HTTPS): http://localhost:${HTTP_PORT}`);
});
