// =============================================================
// EPICAIZO — script.ts
// Interacciones del sitio: menú móvil, cotizador, rastreo y contacto.
// =============================================================

document.addEventListener("DOMContentLoaded", () => {
  initYear();
  initMobileNav();
  initHeaderScroll();
  initScrollReveal();
  initRoutePath();
  initTabs();
  initQuotePaquete();
  initQuoteDinero();
  initTracking();
  initContactForm();
});

// -------------------------------------------------------------
// Año en el footer
// -------------------------------------------------------------
function initYear(): void {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
}

// -------------------------------------------------------------
// Menú móvil
// -------------------------------------------------------------
function initMobileNav(): void {
  const header = document.getElementById("header");
  const toggle = document.getElementById("navToggle") as HTMLButtonElement | null;
  const nav = document.getElementById("nav");
  if (!header || !toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const isOpen = header.classList.toggle("is-open");
    toggle.classList.toggle("is-open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      header.classList.remove("is-open");
      toggle.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

// -------------------------------------------------------------
// Sombra del header al hacer scroll
// -------------------------------------------------------------
function initHeaderScroll(): void {
  const header = document.getElementById("header");
  if (!header) return;

  const toggleShadow = (): void => {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  };
  toggleShadow();
  window.addEventListener("scroll", toggleShadow, { passive: true });
}

// -------------------------------------------------------------
// Revelado de elementos al entrar en pantalla
// -------------------------------------------------------------
function initScrollReveal(): void {
  const items = document.querySelectorAll<HTMLElement>(".reveal");
  if (!items.length) return;

  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement;
          window.setTimeout(() => el.classList.add("is-visible"), index * 60);
          observer.unobserve(el);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  items.forEach((el) => observer.observe(el));
}

// -------------------------------------------------------------
// Marcador animado sobre la ruta del hero (signature element)
// -------------------------------------------------------------
function initRoutePath(): void {
  const path = document.getElementById("routePath") as unknown as SVGPathElement | null;
  const marker = document.getElementById("routeMarker");
  if (!path || !marker || typeof path.getTotalLength !== "function") return;

  const length = path.getTotalLength();
  const durationMs = 5200;
  let start: number | null = null;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion) {
    const midpoint = path.getPointAtLength(length * 0.5);
    marker.setAttribute("transform", `translate(${midpoint.x}, ${midpoint.y})`);
    return;
  }

  function frame(timestamp: number): void {
    if (start === null) start = timestamp;
    const elapsed = (timestamp - start) % durationMs;
    const progress = elapsed / durationMs;
    const point = path!.getPointAtLength(length * progress);
    marker!.setAttribute("transform", `translate(${point.x}, ${point.y})`);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// -------------------------------------------------------------
// Tabs del cotizador (Paquete / Dinero)
// -------------------------------------------------------------
function initTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".tab");
  const panels = document.querySelectorAll<HTMLElement>(".tab-panel");

  function activate(tabName: string): void {
    tabs.forEach((t) => {
      const isActive = t.dataset.tab === tabName;
      t.classList.toggle("is-active", isActive);
      t.setAttribute("aria-selected", String(isActive));
    });
    panels.forEach((p) => {
      p.classList.toggle("is-active", p.dataset.panel === tabName);
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.dataset.tab) activate(tab.dataset.tab);
    });
  });

  // Enlaces "Cotizar paquete" / "Cotizar envío" desde las tarjetas de servicio
  document.querySelectorAll<HTMLAnchorElement>("[data-tab-target]").forEach((link) => {
    link.addEventListener("click", () => {
      const target = link.dataset.tabTarget;
      if (target) activate(target);
    });
  });
}

// -------------------------------------------------------------
// Cotizador de paquetes
// -------------------------------------------------------------
function initQuotePaquete(): void {
  const form = document.getElementById("formPaquete") as HTMLFormElement | null;
  if (!form) return;

  const pesoInput = document.getElementById("peso") as HTMLInputElement;
  const destinoSelect = document.getElementById("destinoPaquete") as HTMLSelectElement;
  const result = document.getElementById("resultPaquete") as HTMLElement;
  const rPeso = document.getElementById("rPeso") as HTMLElement;
  const rDestino = document.getElementById("rDestino") as HTMLElement;
  const rTotal = document.getElementById("rTotalPaquete") as HTMLElement;

  const BASE_FEE = 5;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const peso = parseFloat(pesoInput.value);
    const selectedOption = destinoSelect.options[destinoSelect.selectedIndex];
    const rate = parseFloat(selectedOption?.dataset.rate ?? "0");

    clearFieldError(pesoInput);
    clearFieldError(destinoSelect);

    let hasError = false;
    if (!peso || peso <= 0) {
      setFieldError(pesoInput, "Ingresa un peso válido, mayor a 0.");
      hasError = true;
    }
    if (!rate) {
      setFieldError(destinoSelect, "Selecciona un destino.");
      hasError = true;
    }
    if (hasError) return;

    const total = BASE_FEE + peso * rate;

    rPeso.textContent = `${peso} kg`;
    rDestino.textContent = selectedOption.textContent ?? "—";
    rTotal.textContent = formatCurrency(total);
    result.hidden = false;
  });
}

// -------------------------------------------------------------
// Cotizador de envío de dinero
// -------------------------------------------------------------
function initQuoteDinero(): void {
  const form = document.getElementById("formDinero") as HTMLFormElement | null;
  if (!form) return;

  const montoInput = document.getElementById("monto") as HTMLInputElement;
  const destinoSelect = document.getElementById("destinoDinero") as HTMLSelectElement;
  const result = document.getElementById("resultDinero") as HTMLElement;
  const rMonto = document.getElementById("rMonto") as HTMLElement;
  const rComision = document.getElementById("rComision") as HTMLElement;
  const rTotal = document.getElementById("rTotalDinero") as HTMLElement;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const monto = parseFloat(montoInput.value);
    const selectedOption = destinoSelect.options[destinoSelect.selectedIndex];
    const rate = parseFloat(selectedOption?.dataset.rate ?? "0");

    clearFieldError(montoInput);
    clearFieldError(destinoSelect);

    let hasError = false;
    if (!monto || monto <= 0) {
      setFieldError(montoInput, "Ingresa un monto válido, mayor a 0.");
      hasError = true;
    }
    if (!rate) {
      setFieldError(destinoSelect, "Selecciona un destino.");
      hasError = true;
    }
    if (hasError) return;

    const comision = Math.max(monto * rate, 2);
    const total = monto + comision;

    rMonto.textContent = formatCurrency(monto);
    rComision.textContent = formatCurrency(comision);
    rTotal.textContent = formatCurrency(total);
    result.hidden = false;
  });
}

// -------------------------------------------------------------
// Ayudas de validación de campos
// -------------------------------------------------------------
function setFieldError(input: HTMLElement, message: string): void {
  input.classList.add("has-error");
  input.setAttribute("aria-invalid", "true");

  const field = input.closest(".field");
  if (!field) return;
  let errorEl = field.querySelector<HTMLElement>(".field-error");
  if (!errorEl) {
    errorEl = document.createElement("small");
    errorEl.className = "field-error";
    errorEl.setAttribute("role", "alert");
    field.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

function clearFieldError(input: HTMLElement): void {
  input.classList.remove("has-error");
  input.removeAttribute("aria-invalid");
  const field = input.closest(".field");
  const errorEl = field?.querySelector<HTMLElement>(".field-error");
  if (errorEl) errorEl.remove();
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "USD" }).format(value);
}

// -------------------------------------------------------------
// Rastreo simulado
// -------------------------------------------------------------
function initTracking(): void {
  const form = document.getElementById("trackForm") as HTMLFormElement | null;
  const input = document.getElementById("trackInput") as HTMLInputElement | null;
  const result = document.getElementById("trackResult") as HTMLElement | null;
  const empty = document.getElementById("trackEmpty") as HTMLElement | null;
  const codeEl = document.getElementById("trackCode") as HTMLElement | null;
  const timeline = document.getElementById("trackTimeline");
  if (!form || !input || !result || !empty || !codeEl || !timeline) return;

  const pattern = /^EPZ-\d{4,8}$/i;
  const steps = Array.from(timeline.querySelectorAll<HTMLLIElement>("li"));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = input.value.trim().toUpperCase();

    if (!pattern.test(code)) {
      result.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    codeEl.textContent = code;

    // Estado determinado por el propio código, para que la demo sea consistente.
    const digits = code.replace(/\D/g, "");
    const numeric = parseInt(digits, 10) || 0;
    const currentStep = numeric % 4; // 0..3

    steps.forEach((li, i) => {
      li.classList.remove("is-done", "is-current");
      if (i < currentStep) li.classList.add("is-done");
      if (i === currentStep) li.classList.add("is-current");
    });

    result.hidden = false;
  });
}

// -------------------------------------------------------------
// Formulario de contacto
// -------------------------------------------------------------
function initContactForm(): void {
  const form = document.getElementById("contactForm") as HTMLFormElement | null;
  const note = document.getElementById("contactNote") as HTMLElement | null;
  if (!form || !note) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    note.hidden = false;
    form.reset();
  });
}
