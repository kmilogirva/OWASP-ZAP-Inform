'use strict';

/* ---------- helpers ---------- */

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function strToBuf(str) {
  return new TextEncoder().encode(str);
}

function bufToStr(buf) {
  return new TextDecoder().decode(buf);
}

function arrayBufferToPem(buf, label) {
  const b64 = bufToBase64(buf);
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

/* ---------- conexión / badge ---------- */

(function connBadge() {
  const el = document.getElementById('connBadge');
  const isSecure = location.protocol === 'https:';
  el.classList.add(isSecure ? 'conn-badge--secure' : 'conn-badge--insecure');
  el.querySelector('.conn-badge__text').textContent = isSecure
    ? `https · ${location.host}`
    : 'http (sin cifrar)';
})();

/* ============================================================
   1. CIFRADO SIMÉTRICO — AES-256-GCM con PBKDF2
   ============================================================ */

(function symmetricDemo() {
  const passInput = document.getElementById('symPass');
  const plainInput = document.getElementById('symPlain');
  const encryptBtn = document.getElementById('symEncryptBtn');
  const decryptBtn = document.getElementById('symDecryptBtn');
  const tamperBtn = document.getElementById('symTamperBtn');
  const output = document.getElementById('symOutput');
  const saltEl = document.getElementById('symSalt');
  const ivEl = document.getElementById('symIv');
  const cipherEl = document.getElementById('symCipher');
  const resultEl = document.getElementById('symResult');

  let state = null; // { salt, iv, cipherBytes }

  async function deriveKey(password, salt) {
    const baseKey = await crypto.subtle.importKey('raw', strToBuf(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encrypt() {
    const password = passInput.value;
    const plaintext = plainInput.value;
    if (!password || !plaintext) return;

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, strToBuf(plaintext));

    state = { salt, iv, cipherBytes: new Uint8Array(cipherBuf) };

    saltEl.textContent = bufToHex(salt);
    ivEl.textContent = bufToHex(iv);
    cipherEl.textContent = bufToBase64(cipherBuf);
    resultEl.textContent = 'Cifrado generado. Ahora descífralo con la misma contraseña.';
    resultEl.className = 'result';
    output.hidden = false;
    decryptBtn.disabled = false;
    tamperBtn.disabled = false;
  }

  async function decrypt() {
    if (!state) return;
    const password = passInput.value;
    try {
      const key = await deriveKey(password, state.salt);
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: state.iv }, key, state.cipherBytes);
      resultEl.textContent = `✔ Descifrado correcto: "${bufToStr(plainBuf)}"`;
      resultEl.className = 'result ok';
    } catch (e) {
      resultEl.textContent = '✘ Falló la verificación de integridad/autenticación (contraseña incorrecta o dato alterado).';
      resultEl.className = 'result fail';
    }
  }

  function tamper() {
    if (!state) return;
    const bytes = state.cipherBytes;
    bytes[0] = bytes[0] ^ 0xff; // voltea un byte
    cipherEl.textContent = bufToBase64(bytes.buffer);
    resultEl.textContent = 'Se alteró 1 byte del cifrado. Presiona "Descifrar" para ver qué pasa.';
    resultEl.className = 'result';
  }

  encryptBtn.addEventListener('click', () => encrypt().catch(console.error));
  decryptBtn.addEventListener('click', () => decrypt().catch(console.error));
  tamperBtn.addEventListener('click', tamper);
})();

/* ============================================================
   2. CIFRADO ASIMÉTRICO — RSA-OAEP 2048
   ============================================================ */

(function asymmetricDemo() {
  const genBtn = document.getElementById('asymGenBtn');
  const keysBox = document.getElementById('asymKeys');
  const pubEl = document.getElementById('asymPub');
  const privEl = document.getElementById('asymPriv');
  const plainInput = document.getElementById('asymPlain');
  const encryptBtn = document.getElementById('asymEncryptBtn');
  const decryptBtn = document.getElementById('asymDecryptBtn');
  const output = document.getElementById('asymOutput');
  const cipherEl = document.getElementById('asymCipher');
  const resultEl = document.getElementById('asymResult');

  let keyPair = null;
  let lastCipherBuf = null;

  async function generate() {
    genBtn.disabled = true;
    genBtn.textContent = 'Generando (puede tardar unos segundos)…';

    keyPair = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['encrypt', 'decrypt']
    );

    const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

    pubEl.value = arrayBufferToPem(spki, 'PUBLIC KEY');
    privEl.value = arrayBufferToPem(pkcs8, 'PRIVATE KEY');

    keysBox.hidden = false;
    encryptBtn.disabled = false;
    genBtn.textContent = 'Regenerar par de llaves';
    genBtn.disabled = false;
  }

  async function encrypt() {
    if (!keyPair) return;
    const message = plainInput.value;
    const messageBytes = strToBuf(message);
    if (messageBytes.length > 190) {
      resultEl.textContent = `✘ El mensaje pesa ${messageBytes.length} bytes; RSA-2048/OAEP-SHA256 solo cifra hasta ~190 bytes. Por eso TLS usa cifrado híbrido.`;
      resultEl.className = 'result fail';
      output.hidden = false;
      return;
    }
    lastCipherBuf = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, keyPair.publicKey, messageBytes);
    cipherEl.textContent = bufToBase64(lastCipherBuf);
    resultEl.textContent = 'Cifrado con la llave pública. Descífralo con la llave privada.';
    resultEl.className = 'result';
    output.hidden = false;
    decryptBtn.disabled = false;
  }

  async function decrypt() {
    if (!keyPair || !lastCipherBuf) return;
    try {
      const plainBuf = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, keyPair.privateKey, lastCipherBuf);
      resultEl.textContent = `✔ Descifrado correcto: "${bufToStr(plainBuf)}"`;
      resultEl.className = 'result ok';
    } catch (e) {
      resultEl.textContent = '✘ No se pudo descifrar.';
      resultEl.className = 'result fail';
    }
  }

  genBtn.addEventListener('click', () => generate().catch(console.error));
  encryptBtn.addEventListener('click', () => encrypt().catch(console.error));
  decryptBtn.addEventListener('click', () => decrypt().catch(console.error));
})();

/* ============================================================
   3a. HANDSHAKE TLS 1.3 — stepper
   ============================================================ */

(function handshakeStepper() {
  const steps = [
    {
      label: 'ClientHello',
      detail:
        '<strong>Cliente → Servidor.</strong> El navegador propone versión de TLS, una lista de cifrados soportados, un valor aleatorio (client_random) y ya envía sus parámetros ECDHE (key share) para intentar completar el handshake en 1 solo viaje de ida y vuelta.',
    },
    {
      label: 'ServerHello',
      detail:
        '<strong>Servidor → Cliente.</strong> El servidor elige la versión/cifrado final y responde con su propio key share ECDHE. Con esto, ambos lados ya pueden calcular el mismo secreto compartido de forma independiente (Diffie-Hellman).',
    },
    {
      label: 'Certificado',
      detail:
        '<strong>Servidor → Cliente.</strong> El servidor envía su certificado X.509 (y la cadena hasta la CA intermedia). El cliente valida: firma de la CA, fechas de validez, que el dominio esté en el <em>Subject Alternative Name</em>, y estado de revocación.',
    },
    {
      label: 'CertificateVerify',
      detail:
        '<strong>Servidor → Cliente.</strong> El servidor firma un hash del handshake con la llave privada asociada al certificado — esto prueba que realmente controla esa llave privada, no solo que tiene el certificado (que es público).',
    },
    {
      label: 'Finished',
      detail:
        '<strong>Ambos lados.</strong> Cada parte confirma con un MAC que su vista del handshake coincide (protege contra manipulación en tránsito). A partir de aquí ya existe una llave simétrica compartida y verificada.',
    },
    {
      label: 'Datos de aplicación',
      detail:
        '<strong>Cifrado simétrico entra en juego.</strong> Todo el tráfico HTTP real se cifra con AES-GCM (o ChaCha20-Poly1305) usando la llave derivada del secreto ECDHE — exactamente el algoritmo que probaste en la sección 1. Lo asimétrico solo autenticó y acordó la llave; lo simétrico carga el resto de la conexión.',
    },
  ];

  const stepsEl = document.getElementById('handshakeSteps');
  const detailEl = document.getElementById('handshakeDetail');
  const prevBtn = document.getElementById('hsPrevBtn');
  const nextBtn = document.getElementById('hsNextBtn');
  let current = 0;

  function render() {
    stepsEl.innerHTML = steps
      .map((s, i) => {
        const cls = i === current ? 'active' : i < current ? 'done' : '';
        return `<div class="hs-step ${cls}">${i + 1}. ${s.label}</div>`;
      })
      .join('');
    detailEl.innerHTML = steps[current].detail;
    prevBtn.disabled = current === 0;
    nextBtn.textContent = current === steps.length - 1 ? 'Reiniciar' : 'Siguiente →';
  }

  prevBtn.addEventListener('click', () => {
    if (current > 0) current--;
    render();
  });
  nextBtn.addEventListener('click', () => {
    if (current === steps.length - 1) current = 0;
    else current++;
    render();
  });

  render();
})();

/* ============================================================
   3b. MINI-PKI — firmar y verificar un "certificado" (ECDSA P-256)
   ============================================================ */

(function miniPki() {
  const genBtn = document.getElementById('pkiGenBtn');
  const signBtn = document.getElementById('pkiSignBtn');
  const verifyBtn = document.getElementById('pkiVerifyBtn');
  const tamperBtn = document.getElementById('pkiTamperBtn');
  const out = document.getElementById('pkiOutput');

  let ca = null; // { publicKey, privateKey }
  let server = null; // { publicKey, privateKey }
  let cert = null; // { tbs, signature }

  function log(line) {
    out.hidden = false;
    out.textContent += line + '\n';
    out.scrollTop = out.scrollHeight;
  }

  function clearLog() {
    out.textContent = '';
  }

  async function generate() {
    clearLog();
    ca = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    server = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);

    const serverPubRaw = await crypto.subtle.exportKey('raw', server.publicKey);

    cert = {
      tbs: {
        subject: 'CN=localhost',
        issuer: 'CN=Mini-Lab Root CA',
        notBefore: new Date().toISOString(),
        notAfter: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
        subjectPublicKey: bufToHex(serverPubRaw),
      },
      signature: null,
    };

    log('CA generada (ECDSA P-256).');
    log('Servidor generado (ECDSA P-256).');
    log('\n--- Certificado sin firmar (TBS = "to be signed") ---');
    log(JSON.stringify(cert.tbs, null, 2));

    signBtn.disabled = false;
    verifyBtn.disabled = true;
    tamperBtn.disabled = true;
  }

  async function sign() {
    if (!ca || !cert) return;
    const tbsBytes = strToBuf(JSON.stringify(cert.tbs));
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ca.privateKey, tbsBytes);
    cert.signature = sig;
    log('\n--- La CA firmó el TBS con su llave privada ---');
    log(`Firma (hex, primeros 32 bytes): ${bufToHex(sig).slice(0, 64)}…`);
    log('\nEsto ES un certificado, en su idea mínima: datos + firma de la CA sobre esos datos.');
    verifyBtn.disabled = false;
    tamperBtn.disabled = false;
  }

  async function verify() {
    if (!ca || !cert || !cert.signature) return;
    const tbsBytes = strToBuf(JSON.stringify(cert.tbs));
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, ca.publicKey, cert.signature, tbsBytes);
    log(`\n--- Verificación con la llave pública de la CA ---`);
    log(valid ? '✔ Firma válida: el certificado es auténtico y no fue alterado.' : '✘ Firma inválida.');
  }

  function tamper() {
    if (!cert) return;
    cert.tbs.subject = 'CN=banco-falso.com';
    log('\n--- Se alteró el campo "subject" del certificado (sin volver a firmar) ---');
    log(JSON.stringify(cert.tbs, null, 2));
    log('Presiona "Verificar firma" otra vez: la firma ya no corresponde a estos datos.');
  }

  genBtn.addEventListener('click', () => generate().catch(console.error));
  signBtn.addEventListener('click', () => sign().catch(console.error));
  verifyBtn.addEventListener('click', () => verify().catch(console.error));
  tamperBtn.addEventListener('click', tamper);
})();

/* ============================================================
   3c. INSPECTOR DE CERTIFICADO REAL (vía servidor Node)
   ============================================================ */

(function certInspector() {
  const btn = document.getElementById('certInspectBtn');
  const box = document.getElementById('certInspectOutput');

  function renderNotice(text, kind) {
    box.innerHTML = `<div class="notice notice--${kind}">${text}</div>`;
  }

  function renderFields(info) {
    const nav = performance.getEntriesByType('navigation')[0];
    const rows = [
      ['Host', location.host],
      ['Protocolo', nav ? nav.nextHopProtocol || 'n/d' : 'n/d'],
      ['Subject', info.subject],
      ['Issuer', info.issuer],
      ['Válido desde', info.validFrom],
      ['Válido hasta', info.validTo],
      ['Número de serie', info.serialNumber],
      ['Huella SHA-256', info.fingerprint256],
      ['SAN', info.subjectAltName || 'n/d'],
      ['Llave pública', `${info.publicKey.type}${info.publicKey.details ? ' · ' + JSON.stringify(info.publicKey.details) : ''}`],
      ['¿Es CA?', info.isCA ? 'sí' : 'no'],
    ];
    box.innerHTML = `<div class="cert-fields">${rows
      .map(([k, v]) => `<div class="row"><span>${k}</span><span>${v}</span></div>`)
      .join('')}</div>`;
  }

  async function inspect() {
    if (location.protocol !== 'https:') {
      renderNotice(
        'Esta página se está sirviendo por HTTP. Levanta el servidor del laboratorio (sección "Laboratorio") y abre la página en <code>https://localhost:8443</code> para consultar el certificado real.',
        'warn'
      );
      return;
    }
    try {
      const res = await fetch('/api/cert-info');
      if (!res.ok) throw new Error('respuesta no OK');
      const info = await res.json();
      renderFields(info);
    } catch (e) {
      renderNotice('No se pudo consultar /api/cert-info. ¿Está corriendo el servidor Node del laboratorio?', 'warn');
    }
  }

  btn.addEventListener('click', () => inspect().catch(console.error));
})();
