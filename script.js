
/* ========================================
   nutricion IA - Lógica del chat
======================================== */

/* Elementos del DOM */

const formulario = document.getElementById("formulario-chat");
const entrada = document.getElementById("entrada-mensaje");
const botonEnviar = document.getElementById("boton-enviar");
const mensajes = document.getElementById("mensajes");

/* Configuración */

const TIEMPO_LIMITE = 30000;
const PAUSA_MINIMA = 1500;
const MAX_CARACTERES = 500;

/* Estado de la aplicación */

let enviando = false;
let ultimoEnvio = 0;
let sessionId = obtenerSessionId();

/* ========================================
   Identificador de sesión
======================================== */

function generarSessionId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return Date.now().toString(36) +
    Math.random().toString(36).substring(2);
}

function obtenerSessionId() {
  try {
    let id = localStorage.getItem("nutricionIA_sessionId");

    if (!id) {
      id = generarSessionId();
      localStorage.setItem("nutricionIA_sessionId", id);
    }

    return id;

  } catch (error) {
    return generarSessionId();
  }
}

/* ========================================
   Crear mensajes
======================================== */

function agregarMensaje(texto, tipo) {
  const mensaje = document.createElement("div");
  mensaje.className = `mensaje ${tipo}`;

  if (tipo === "agente") {
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "n";

    mensaje.appendChild(avatar);
  }

  const contenido = document.createElement("div");
  contenido.className = "contenido-mensaje";

  const nombre = document.createElement("span");
  nombre.className = "nombre";
  nombre.textContent =
    tipo === "usuario" ? "Vos" : "nutricion IA";

  const burbuja = document.createElement("div");
  burbuja.className = "burbuja";
  burbuja.textContent = texto;

  contenido.appendChild(nombre);
  contenido.appendChild(burbuja);

  mensaje.appendChild(contenido);
  mensajes.appendChild(mensaje);

  mensajes.scrollTop = mensajes.scrollHeight;

  return burbuja;
}

/* ========================================
   Estados visuales
======================================== */

function cambiarEstado(cargando) {
  enviando = cargando;

  botonEnviar.disabled = cargando;
  entrada.disabled = cargando;

  botonEnviar.setAttribute(
    "aria-label",
    cargando ? "Esperando respuesta" : "Enviar mensaje"
  );
}

/* ========================================
   Leer respuesta de Make
======================================== */

function interpretarRespuesta(texto) {

  if (!texto || !texto.trim()) {
    return "(respuesta vacía)";
  }

  try {
    const datos = JSON.parse(texto);

    if (
      datos !== null &&
      typeof datos === "object" &&
      !Array.isArray(datos)
    ) {
      const propiedades = [
        "response",
        "respuesta",
        "message",
        "mensaje"
      ];

      for (const propiedad of propiedades) {
        const valor = datos[propiedad];

        if (
          typeof valor === "string" &&
          valor.trim() !== ""
        ) {
          return valor;
        }
      }

      return "Make respondió, pero sin el campo response";
    }

    return texto;

  } catch (error) {
    return texto;
  }
}

/* ========================================
   Pausa entre envíos
======================================== */

async function esperarPausa() {
  const tiempoTranscurrido = Date.now() - ultimoEnvio;
  const tiempoRestante = PAUSA_MINIMA - tiempoTranscurrido;

  if (tiempoRestante > 0) {
    await new Promise(resolve =>
      setTimeout(resolve, tiempoRestante)
    );
  }
}

/* ========================================
   Enviar mensaje al webhook
======================================== */

async function enviarMensaje(texto) {

  let controlador;
  let temporizador;
  let timeoutActivo = false;

  const respuestaAgente = agregarMensaje(
    "Escribiendo...",
    "agente"
  );

  cambiarEstado(true);

  try {

    /* Verificar configuración */

    if (
      !WEBHOOK_URL ||
      WEBHOOK_URL.includes("ACA VA")
    ) {
      respuestaAgente.textContent =
        "Falta pegar la URL de tu webhook en config.js";
      return;
    }

    /* Respetar pausa mínima */

    await esperarPausa();

    ultimoEnvio = Date.now();

    /* Preparar petición */

    controlador = new AbortController();

    temporizador = setTimeout(() => {
      timeoutActivo = true;
      controlador.abort();
    }, TIEMPO_LIMITE);

    const datos = {
      sessionId: sessionId,
      mensaje: texto,
      fecha: new Date().toISOString()
    };

    /* Petición a Make */

    const respuesta = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(datos),
      signal: controlador.signal
    });

    /* Leer respuesta como texto */

    const textoRespuesta = await respuesta.text();

    /* Comprobar errores HTTP */

    if (!respuesta.ok) {
      throw new Error(`HTTP_${respuesta.status}`);
    }

    /* Interpretar respuesta */

    const resultado = interpretarRespuesta(textoRespuesta);

    respuestaAgente.textContent = resultado;

  } catch (error) {

    /* Timeout */

    if (timeoutActivo) {
      respuestaAgente.textContent =
        "La solicitud tardó demasiado. " +
        "Se agotó el tiempo de espera de 30 segundos. " +
        "Intentá nuevamente.";

    /* Error HTTP */

    } else if (
      error.message.startsWith("HTTP_")
    ) {
      const codigo = error.message.replace("HTTP_", "");

      respuestaAgente.textContent =
        `Make respondió con error (código ${codigo}). ` +
        "Revisá que tu escenario esté en Active " +
        "o que hayas apretado Run once.";

    /* Error de red */

    } else {
      respuestaAgente.textContent =
        "No se pudo conectar con el servidor. " +
        "Revisá tu conexión y la URL del webhook.";
    }

  } finally {

    clearTimeout(temporizador);

    cambiarEstado(false);

    entrada.focus();

    mensajes.scrollTop = mensajes.scrollHeight;
  }
}

/* ========================================
   Evento de envío
======================================== */

formulario.addEventListener("submit", async (evento) => {

  evento.preventDefault();

  if (enviando) return;

  const texto = entrada.value.trim();

  if (!texto) return;

  if (texto.length > MAX_CARACTERES) {
    agregarMensaje(
      "El mensaje no puede superar los 500 caracteres.",
      "agente"
    );
    return;
  }

  /* Mostrar mensaje del usuario */

  agregarMensaje(texto, "usuario");

  entrada.value = "";
  ajustarAltura();

  /* Enviar al agente */

  await enviarMensaje(texto);
});

/* ========================================
   Ajustar altura del campo
======================================== */

function ajustarAltura() {
  entrada.style.height = "auto";
  entrada.style.height =
    Math.min(entrada.scrollHeight, 130) + "px";
}

entrada.addEventListener("input", () => {

  if (entrada.value.length > MAX_CARACTERES) {
    entrada.value = entrada.value.substring(
      0,
      MAX_CARACTERES
    );
  }

  ajustarAltura();
});

/* ========================================
   Enviar con Enter
======================================== */

entrada.addEventListener("keydown", (evento) => {

  if (
    evento.key === "Enter" &&
    !evento.shiftKey &&
    !evento.isComposing
  ) {
    evento.preventDefault();
    formulario.requestSubmit();
  }

});
