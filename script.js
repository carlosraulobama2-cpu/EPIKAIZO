"use strict";
// =============================================================
// EPICAIZO — script.ts
// Interacciones del sitio: menú móvil, cotizador, rastreo y contacto.
// =============================================================
document.addEventListener("DOMContentLoaded", () => {
    initPreloader();
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
    initBackToTop();
    initLazyImages();
    initAnimatedCounters();
});
// -------------------------------------------------------------
// Año en el footer
// -------------------------------------------------------------
function initYear() {
    const yearEl = document.getElementById("year");
    if (yearEl)
        yearEl.textContent = String(new Date().getFullYear());
}
// -------------------------------------------------------------
// Menú móvil
// -------------------------------------------------------------
function initMobileNav() {
    const header = document.getElementById("header");
    const toggle = document.getElementById("navToggle");
    const nav = document.getElementById("nav");
    const overlay = document.getElementById("navOverlay");
    if (!header || !toggle || !nav)
        return;
    const close = () => {
        header.classList.remove("is-open");
        toggle.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
    };
    toggle.addEventListener("click", () => {
        const isOpen = header.classList.toggle("is-open");
        toggle.classList.toggle("is-open", isOpen);
        toggle.setAttribute("aria-expanded", String(isOpen));
    });
    if (overlay) overlay.addEventListener("click", close);
    nav.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", close);
    });
}
// -------------------------------------------------------------
// Sombra del header al hacer scroll
// -------------------------------------------------------------
function initHeaderScroll() {
    const header = document.getElementById("header");
    if (!header)
        return;
    const toggleShadow = () => {
        header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    toggleShadow();
    window.addEventListener("scroll", toggleShadow, { passive: true });
}
// -------------------------------------------------------------
// Revelado de elementos al entrar en pantalla
// -------------------------------------------------------------
function initScrollReveal() {
    const items = document.querySelectorAll(".reveal");
    if (!items.length)
        return;
    if (!("IntersectionObserver" in window)) {
        items.forEach((el) => el.classList.add("is-visible"));
        return;
    }
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                const el = entry.target;
                window.setTimeout(() => el.classList.add("is-visible"), index * 60);
                observer.unobserve(el);
            }
        });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    items.forEach((el) => observer.observe(el));
}
// -------------------------------------------------------------
// Marcador animado sobre la ruta del hero (signature element)
// -------------------------------------------------------------
function initRoutePath() {
    const path = document.getElementById("routePath");
    const marker = document.getElementById("routeMarker");
    if (!path || !marker || typeof path.getTotalLength !== "function")
        return;
    const length = path.getTotalLength();
    const durationMs = 5200;
    let start = null;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
        const midpoint = path.getPointAtLength(length * 0.5);
        marker.setAttribute("transform", `translate(${midpoint.x}, ${midpoint.y})`);
        return;
    }
    function frame(timestamp) {
        if (start === null)
            start = timestamp;
        const elapsed = (timestamp - start) % durationMs;
        const progress = elapsed / durationMs;
        const point = path.getPointAtLength(length * progress);
        marker.setAttribute("transform", `translate(${point.x}, ${point.y})`);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}
// -------------------------------------------------------------
// Tabs del cotizador (Paquete / Dinero)
// -------------------------------------------------------------
function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    const panels = document.querySelectorAll(".tab-panel");
    function activate(tabName) {
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
            if (tab.dataset.tab)
                activate(tab.dataset.tab);
        });
    });
    // Enlaces "Cotizar paquete" / "Cotizar envío" desde las tarjetas de servicio
    document.querySelectorAll("[data-tab-target]").forEach((link) => {
        link.addEventListener("click", () => {
            const target = link.dataset.tabTarget;
            if (target)
                activate(target);
        });
    });
}
// -------------------------------------------------------------
// Cotizador de paquetes
// -------------------------------------------------------------
function initQuotePaquete() {
    const form = document.getElementById("formPaquete");
    if (!form)
        return;
    const pesoInput = document.getElementById("peso");
    const destinoSelect = document.getElementById("destinoPaquete");
    const result = document.getElementById("resultPaquete");
    const rPeso = document.getElementById("rPeso");
    const rDestino = document.getElementById("rDestino");
    const rTotal = document.getElementById("rTotalPaquete");
    const BASE_FEE = 5;
    form.addEventListener("submit", (e) => {
        var _a, _b;
        e.preventDefault();
        const peso = parseFloat(pesoInput.value);
        const selectedOption = destinoSelect.options[destinoSelect.selectedIndex];
        const rate = parseFloat((_a = selectedOption === null || selectedOption === void 0 ? void 0 : selectedOption.dataset.rate) !== null && _a !== void 0 ? _a : "0");
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
        if (hasError)
            return;
        const total = BASE_FEE + peso * rate;
        rPeso.textContent = `${peso} kg`;
        rDestino.textContent = (_b = selectedOption.textContent) !== null && _b !== void 0 ? _b : "—";
        rTotal.textContent = formatCurrency(total);
        result.hidden = false;
        trackEvent("quote_package", { peso: peso, destino: (_b = selectedOption.textContent) !== null && _b !== void 0 ? _b : "—", total: total });
    });
}
// -------------------------------------------------------------
// Cotizador de envío de dinero
// -------------------------------------------------------------
function initQuoteDinero() {
    const form = document.getElementById("formDinero");
    if (!form)
        return;
    const montoInput = document.getElementById("monto");
    const destinoSelect = document.getElementById("destinoDinero");
    const result = document.getElementById("resultDinero");
    const rMonto = document.getElementById("rMonto");
    const rComision = document.getElementById("rComision");
    const rTotal = document.getElementById("rTotalDinero");
    form.addEventListener("submit", (e) => {
        var _a;
        e.preventDefault();
        const monto = parseFloat(montoInput.value);
        const selectedOption = destinoSelect.options[destinoSelect.selectedIndex];
        const rate = parseFloat((_a = selectedOption === null || selectedOption === void 0 ? void 0 : selectedOption.dataset.rate) !== null && _a !== void 0 ? _a : "0");
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
        if (hasError)
            return;
        const comision = Math.max(monto * rate, 2);
        const total = monto + comision;
        rMonto.textContent = formatCurrency(monto);
        rComision.textContent = formatCurrency(comision);
        rTotal.textContent = formatCurrency(total);
        result.hidden = false;
        trackEvent("quote_money", { monto: monto, destino: (_a = selectedOption.textContent) !== null && _a !== void 0 ? _a : "—", comision: comision, total: total });
    });
}
// -------------------------------------------------------------
// Ayudas de validación de campos
// -------------------------------------------------------------
function setFieldError(input, message) {
    input.classList.add("has-error");
    input.setAttribute("aria-invalid", "true");
    const field = input.closest(".field");
    if (!field)
        return;
    let errorEl = field.querySelector(".field-error");
    if (!errorEl) {
        errorEl = document.createElement("small");
        errorEl.className = "field-error";
        errorEl.setAttribute("role", "alert");
        field.appendChild(errorEl);
    }
    errorEl.textContent = message;
}
function clearFieldError(input) {
    input.classList.remove("has-error");
    input.removeAttribute("aria-invalid");
    const field = input.closest(".field");
    const errorEl = field === null || field === void 0 ? void 0 : field.querySelector(".field-error");
    if (errorEl)
        errorEl.remove();
}
function formatCurrency(value) {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "USD" }).format(value);
}
// -------------------------------------------------------------
// Rastreo simulado
// -------------------------------------------------------------
function initTracking() {
    const form = document.getElementById("trackForm");
    const input = document.getElementById("trackInput");
    const result = document.getElementById("trackResult");
    const empty = document.getElementById("trackEmpty");
    const codeEl = document.getElementById("trackCode");
    const timeline = document.getElementById("trackTimeline");
    const copyBtn = document.getElementById("copyTrackCode");
    if (!form || !input || !result || !empty || !codeEl || !timeline)
        return;
    const pattern = /^EPZ-\d{4,8}$/i;
    const steps = Array.from(timeline.querySelectorAll("li"));
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const code = input.value.trim().toUpperCase();
        if (!pattern.test(code)) {
            result.hidden = true;
            empty.hidden = false;
            return;
        }
        empty.hidden = true;
        result.hidden = true;
        // Fetch real tracking data from backend
        fetch(`/api/track/${encodeURIComponent(code)}`)
            .then(r => r.json())
            .then(data => {
                if (!data.found) {
                    result.hidden = true;
                    empty.hidden = false;
                    empty.textContent = "No encontramos un paquete con esa guía. Revisa el número e inténtalo otra vez.";
                    return;
                }
                codeEl.textContent = code;
                if (copyBtn) copyBtn.classList.remove("is-copied");
                const currentStep = data.step || 0;
                steps.forEach((li, i) => {
                    li.classList.remove("is-done", "is-current");
                    if (i < currentStep)
                        li.classList.add("is-done");
                    if (i === currentStep)
                        li.classList.add("is-current");
                });
                result.hidden = false;
                trackEvent("track_package", { code: code, status: data.status });
            })
            .catch(() => {
                result.hidden = true;
                empty.hidden = false;
                empty.textContent = "Error de conexión. Inténtalo de nuevo o escríbenos por WhatsApp.";
            });
    });
    if (copyBtn) {
        copyBtn.addEventListener("click", async () => {
            const code = codeEl.textContent.trim();
            if (!code || code === "—") return;
            try {
                await navigator.clipboard.writeText(code);
                copyBtn.classList.add("is-copied");
                copyBtn.querySelector("span").textContent = "Copiado";
                setTimeout(() => {
                    copyBtn.classList.remove("is-copied");
                    copyBtn.querySelector("span").textContent = "Copiar";
                }, 2000);
            } catch (err) {
                // Silently fail
            }
        });
    }
}
// -------------------------------------------------------------
// Formulario de contacto
// -------------------------------------------------------------
function initContactForm() {
    const form = document.getElementById("contactForm");
    const note = document.getElementById("contactNote");
    if (!form || !note)
        return;
    const inputs = form.querySelectorAll("input, textarea");
    inputs.forEach((input) => {
        input.addEventListener("input", () => {
            clearFieldError(input);
            if (!note.hidden) {
                note.hidden = true;
                note.removeAttribute("role");
            }
        });
        input.addEventListener("blur", () => {
            validateContactField(input);
        });
    });
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        let valid = true;
        inputs.forEach((input) => {
            if (!validateContactField(input))
                valid = false;
        });
        if (!valid) {
            note.hidden = false;
            note.setAttribute("role", "alert");
            note.textContent = "Por favor corrige los campos marcados.";
            return;
        }
        const nombre = sanitize(form.querySelector("#nombre").value.trim());
        const telefono = sanitize(form.querySelector("#telefono").value.trim());
        const email = sanitize(form.querySelector("#email").value.trim());
        const mensaje = sanitize(form.querySelector("#mensaje").value.trim());
        const payload = {
            name: nombre,
            phone: telefono,
            email: email,
            message: mensaje,
            tenantId: 'public'
        };
        fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(data => {
            note.hidden = false;
            note.setAttribute("role", "status");
            if (data.id) {
                note.textContent = "Gracias, recibimos tu mensaje. Te contactaremos pronto.";
                trackEvent("contact_submit", { email: email, has_phone: !!telefono });
            } else {
                note.textContent = data.error || "No pudimos guardar tu mensaje. Intenta por WhatsApp.";
            }
            form.reset();
            inputs.forEach(clearFieldError);
        })
        .catch(() => {
            note.hidden = false;
            note.setAttribute("role", "alert");
            note.textContent = "Error de conexión. Intenta por WhatsApp.";
        });
    });
}
function validateContactField(input) {
    clearFieldError(input);
    const val = input.value.trim();
    if (!val) {
        setFieldError(input, "Este campo es obligatorio.");
        return false;
    }
    if (input.type === "email" && val) {
        const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
        if (!ok) {
            setFieldError(input, "Ingresa un correo válido.");
            return false;
        }
    }
    return true;
}
function sanitize(text) {
    if (typeof text !== "string")
        return "";
    return text.replace(/[<>]/g, "");
}

// -------------------------------------------------------------
// Analytics (eventos clave del sitio)
// -------------------------------------------------------------
function trackEvent(name, data) {
    try {
        fetch("/api/analytics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify(Object.assign({ event: name, ts: Date.now() }, data || {}))
        }).catch(() => {});
    }
    catch (_a) { }
}

// -------------------------------------------------------------
// Preloader
// -------------------------------------------------------------
function initPreloader() {
    const preloader = document.getElementById("preloader");
    if (!preloader) return;
    window.addEventListener("load", () => {
        setTimeout(() => preloader.classList.add("is-hidden"), 300);
    });
}

// -------------------------------------------------------------
// Back to top
// -------------------------------------------------------------
function initBackToTop() {
    const btn = document.getElementById("backToTop");
    if (!btn) return;
    const toggle = () => btn.classList.toggle("is-visible", window.scrollY > 500);
    toggle();
    window.addEventListener("scroll", toggle, { passive: true });
}

// -------------------------------------------------------------
// Lazy images
// -------------------------------------------------------------
function initLazyImages() {
    if (!("IntersectionObserver" in window)) {
        document.querySelectorAll(".featured-image").forEach(img => img.classList.add("is-loaded"));
        return;
    }
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.complete) img.classList.add("is-loaded");
                else img.addEventListener("load", () => img.classList.add("is-loaded"));
                observer.unobserve(img);
            }
        });
    }, { rootMargin: "100px" });
    document.querySelectorAll(".featured-image").forEach(img => observer.observe(img));
}

// -------------------------------------------------------------
// Animated counters
// -------------------------------------------------------------
function initAnimatedCounters() {
    const counters = document.querySelectorAll(".hero__stats dt, .highlight__num, .manifest dt");
    if (!counters.length) return;
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const text = el.textContent.trim();
                const numeric = parseFloat(text.replace(/[^0-9.]/g, ""));
                if (isNaN(numeric)) return;
                const suffix = text.replace(/[0-9.]/g, "").trim();
                const isDecimal = text.includes(".");
                const duration = 1200;
                const start = performance.now();

                function frame(timestamp) {
                    const elapsed = timestamp - start;
                    const progress = Math.min(elapsed / duration, 1);
                    const eased = 1 - Math.pow(1 - progress, 3);
                    const current = eased * numeric;
                    el.textContent = (isDecimal ? current.toFixed(0) : Math.floor(current)) + " " + suffix;
                    if (progress < 1) requestAnimationFrame(frame);
                }
                requestAnimationFrame(frame);
                observer.unobserve(el);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(c => observer.observe(c));
}
