// ===========================================
// EPikaizo Dashboard - SaaS Multi-tenant
// ===========================================

// --- AUTHENTICATION CHECK ---
(function() {
  var token = localStorage.getItem('epk_token');
  if (!token) {
    window.location.href = 'login.html';
  }
})();
// ----------------------------

var API_BASE = 'http://localhost:3001/api';
function getAuthHeaders() {
  var headers = { 'Content-Type': 'application/json' };
  var token = localStorage.getItem('epk_token');
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}
function getTenantHeaders() {
  var tenant = JSON.parse(localStorage.getItem('epk_tenant') || '{}');
  var headers = { 'x-tenant-id': tenant.id || '' };
  var token = localStorage.getItem('epk_token');
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}
var api = {
  get: async function(endpoint) {
    const res = await fetch(API_BASE + endpoint, {
      headers: getTenantHeaders()
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Error'); }
    return res.json();
  },
  post: async function(endpoint, body) {
    const res = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: getTenantHeaders(),
      body: JSON.stringify(body)
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Error'); }
    return res.json();
  },
  put: async function(endpoint, body) {
    const res = await fetch(API_BASE + endpoint, {
      method: 'PUT',
      headers: getTenantHeaders(),
      body: JSON.stringify(body)
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Error'); }
    return res.json();
  },
  del: async function(endpoint) {
    const res = await fetch(API_BASE + endpoint, {
      method: 'DELETE',
      headers: getTenantHeaders()
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Error'); }
    return res.json();
  }
};

// ===================== DATA STORE (API-backed) =====================
function loadPackages() {
  return [];
}
function savePackages(arr) {
  localStorage.setItem('epk_packages', JSON.stringify(arr));
}
var packages = loadPackages();

function loadInvoices() {
  return [];
}
function saveInvoices(arr) {
  localStorage.setItem('epk_invoices', JSON.stringify(arr));
}
var invoices = loadInvoices();

async function loadFromApi(table) {
  try { return await api.get('/' + table); } catch (e) { return []; }
}
async function createInApi(table, data) {
  return await api.post('/' + table, data);
}
async function updateInApi(table, id, data) {
  return await api.put('/' + table + '/' + id, data);
}
async function deleteInApi(table, id) {
  return await api.del('/' + table + '/' + id);
}

async function loadAllData() {
  packages = await loadFromApi('packages');

  expenses = await loadFromApi('expenses');
  incomes = await loadFromApi('incomes');
  employees = await loadFromApi('employees');
  providers = await loadFromApi('providers');
  notifications = await loadFromApi('notifications');
  invoices = await loadFromApi('invoices');
  serviceCatalog = await loadFromApi('services');
}

// ===================== SERVICE CATALOG =====================
function loadServiceCatalog() {
  try {
    var data = localStorage.getItem('epk_service_catalog');
    return data ? JSON.parse(data) : [];
  } catch(e) { return []; }
}
function saveServiceCatalog(arr) {
  localStorage.setItem('epk_service_catalog', JSON.stringify(arr));
}
var serviceCatalog = loadServiceCatalog();

function getActiveServices() {
  return serviceCatalog.filter(function(s) { return s.activo !== false; });
}

function addServiceToCatalog(data) {
  return createInApi('services', data).then(function(result) {
    if (result && result.service) {
      serviceCatalog.push(result.service);
      saveServiceCatalog(serviceCatalog);
    }
    return result;
  }).catch(function() {
    var newService = {
      id: 'SVC-' + Math.floor(100000 + Math.random() * 900000),
      nombre_servicio: data.nombre_servicio,
      descripcion: data.descripcion || '',
      precio_base: data.precio_base || 0,
      activo: data.activo !== false,
      date: new Date().toISOString()
    };
    serviceCatalog.push(newService);
    saveServiceCatalog(serviceCatalog);
    return { service: newService };
  });
}

function removeServiceFromCatalog(id) {
  return deleteInApi('services', id).then(function() {
    serviceCatalog = serviceCatalog.filter(function(s) { return s.id !== id; });
    saveServiceCatalog(serviceCatalog);
  }).catch(function() {
    serviceCatalog = serviceCatalog.filter(function(s) { return s.id !== id; });
    saveServiceCatalog(serviceCatalog);
  });
}

function getServiceNameById(id) {
  var svc = serviceCatalog.find(function(s) { return s.id === id; });
  return svc ? svc.nombre_servicio : id;
}

function loadSettingsFromServer() {
  const s = getSettings();
  applySettings(s);
}

function initDashboard() {
  showSkeletons();
  loadSettings();
  loadSettingsFromServer();
  loadAllData().then(function() {
    refreshAllData();
    renderCharts();
    setupTooltips();
    setupGlobalSearch();
    populateServiceCatalogSelect();
    renderCatalogTable();
    initClients();
    hideSkeletons();
  });
}

function showSkeletons() {
  var kpis = document.querySelector('.kpis');
  var tables = document.querySelectorAll('.table-section');
  if (kpis) kpis.classList.add('is-loading');
  tables.forEach(function(t) { t.classList.add('is-loading'); });
}

function hideSkeletons() {
  var kpis = document.querySelector('.kpis');
  var tables = document.querySelectorAll('.table-section');
  if (kpis) kpis.classList.remove('is-loading');
  tables.forEach(function(t) { t.classList.remove('is-loading'); });
}

// ===================== UTILITY =====================
function generateId() {
  return 'EPZ-' + Math.floor(100000 + Math.random() * 900000);
}
function formatDate(dateStr) {
  if (!dateStr) return '-';
  var d = new Date(dateStr);
  var day = String(d.getDate()).padStart(2, '0');
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var year = d.getFullYear();
  return day + '/' + month + '/' + year;
}
function formatMoney(num) {
  return Number(num).toLocaleString('es-ES') + ' XAF';
}
function showToast(message) {
  var toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  setTimeout(function() {
    toast.classList.remove('is-visible');
  }, 3000);
}
function getStatusText(status) {
  if (status === 'transito') return 'En Tránsito';
  if (status === 'entregado') return 'Entregado';
  if (status === 'recibido') return 'Recibido';
  return status;
}

// ===================== TAB NAVIGATION =====================
var sidebarLinks = document.querySelectorAll('.sidebar__nav a[data-tab]');
var tabPanes = document.querySelectorAll('.tab-pane');
var pageTitle = document.getElementById('pageTitle');
var pageSub = document.getElementById('pageSub');

var tabTitles = {
  'tab-overview': { title: 'Panel de Control', sub: 'Resumen de operaciones y envíos' },
  'tab-packages': { title: 'Paquetes', sub: 'Historial completo de paquetes registrados' },
  'tab-money': { title: 'Envíos de Dinero', sub: 'Registro de transferencias y envíos monetarios' },
  'tab-clients': { title: 'Clientes', sub: 'Directorio de remitentes y destinatarios' },
  'tab-deliveries': { title: 'Entregas', sub: 'Control de entregas realizadas y pendientes' },
  'tab-finance': { title: 'Finanzas', sub: 'Resumen financiero y movimientos de comisiones' },

  'tab-stats': { title: 'Estadísticas', sub: 'Métricas y análisis visual del negocio' },
  'tab-history': { title: 'Historial', sub: 'Historial global de actividad' },
  'tab-messages': { title: 'Mensajes', sub: 'Mensajes recibidos desde la web pública' },
  'tab-employees': { title: 'Empleados', sub: 'Gestión de personal y roles' },
  'tab-expenses': { title: 'Gastos', sub: 'Control de gastos fijos y variables' },
  'tab-providers': { title: 'Proveedores', sub: 'Directorio de proveedores y servicios' },
  'tab-notifications': { title: 'Notificaciones', sub: 'Centro de notificaciones del sistema' },
  'tab-audit': { title: 'Auditoría', sub: 'Historial de cambios y acciones del sistema' },
  'tab-backup': { title: 'Backup', sub: 'Exportación, importación y gestión de datos' },
  'tab-reports': { title: 'Reportes', sub: 'Informes y estadísticas por ciudad' },
  'tab-settings': { title: 'Configuración', sub: 'Ajustes del sistema y la empresa' }
};

function switchTab(tabId) {
  // Update sidebar active state
  sidebarLinks.forEach(function(l) { l.classList.remove('is-active'); });
  var activeLink = document.querySelector('.sidebar__nav a[data-tab="' + tabId + '"]');
  if (activeLink) activeLink.classList.add('is-active');

  // Show correct pane
  tabPanes.forEach(function(pane) {
    if (pane.id === tabId) {
      pane.classList.add('is-active');
    } else {
      pane.classList.remove('is-active');
    }
  });

  // Update header
  var info = tabTitles[tabId];
  if (info && pageTitle && pageSub) {
    pageTitle.textContent = info.title;
    pageSub.textContent = info.sub;
  }

  // Refresh the tab data
  refreshAllData();
}

sidebarLinks.forEach(function(link) {
  link.addEventListener('click', function(e) {
    e.preventDefault();
    var target = link.getAttribute('data-tab');
    switchTab(target);
  });
});

// ===================== MODAL HANDLING =====================
var btnNuevo = document.getElementById('btnNuevoPaquete');
var modalOverlay = document.getElementById('modalOverlay');
var btnCloseModal = document.getElementById('btnCloseModal');

function openModal() {
  if (modalOverlay) modalOverlay.classList.add('is-open');
}
function closeModal() {
  if (modalOverlay) modalOverlay.classList.remove('is-open');
}

if (btnNuevo) btnNuevo.addEventListener('click', function() {
  openModal();
  var serviceType = document.getElementById('f_serviceType');
  if (serviceType) {
    serviceType.value = '';
    updateServiceFields();
  }
});
if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
if (modalOverlay) {
  modalOverlay.addEventListener('click', function(e) {
    if (e.target === modalOverlay) closeModal();
  });
}

// Close on ESC key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeModal();
});

// ===================== SERVICE TYPE DYNAMIC FIELDS =====================
function updateServiceFields() {
  var type = document.getElementById('f_serviceType');
  var value = type ? type.value : '';
  var blocks = document.querySelectorAll('.service-fields');
  blocks.forEach(function(el) { el.style.display = 'none'; });
  if (!value) return;

  var predefinedFields = {
    paquete: 'fields-paquete',
    gestion_comercial: 'fields-gestion_comercial',
    construccion: 'fields-construccion',
    otro: 'fields-otro'
  };

  if (predefinedFields[value]) {
    var target = document.getElementById(predefinedFields[value]);
    if (target) target.style.display = 'block';
  } else {
    var customFields = document.getElementById('fields-otro');
    if (customFields) customFields.style.display = 'block';
  }
}

function populateServiceCatalogSelect() {
  var select = document.getElementById('f_serviceType');
  if (!select) return;
  var currentValue = select.value;
  select.innerHTML = '<option value="">Seleccionar...</option>';
  var services = getActiveServices();
  if (services.length === 0) {
    var defaultOpts = [
      { id: 'paquete', nombre_servicio: 'Envío de Paquetes' },
      { id: 'gestion_comercial', nombre_servicio: 'Gestión Comercial' },
      { id: 'construccion', nombre_servicio: 'Construcción y Mantenimiento' },
      { id: 'otro', nombre_servicio: 'Otro / Personalizado' }
    ];
    defaultOpts.forEach(function(s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.nombre_servicio;
      select.appendChild(opt);
    });
  } else {
    services.forEach(function(s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.nombre_servicio;
      select.appendChild(opt);
    });
  }
  if (currentValue) select.value = currentValue;
}

var serviceTypeSelect = document.getElementById('f_serviceType');
if (serviceTypeSelect) {
  serviceTypeSelect.addEventListener('change', updateServiceFields);
}

// ===================== FORM SUBMISSION =====================
var formNewService = document.getElementById('formNewService');
if (formNewService) {
  formNewService.addEventListener('submit', function(e) {
    e.preventDefault();

    var serviceType = document.getElementById('f_serviceType').value;
    var clientName = document.getElementById('f_clientName').value.trim();
    var clientPhone = document.getElementById('f_clientPhone').value.trim();
    var fee = document.getElementById('f_fee').value;
    var total = document.getElementById('f_total').value;
    var status = document.getElementById('f_status').value;

    var service = {
      id: generateId(),
      serviceType: serviceType,
      client: {
        name: clientName,
        phone: clientPhone
      },
      financial: {
        fee: fee,
        total: total
      },
      status: status,
      date: new Date().toISOString()
    };

    if (serviceType === 'paquete') {
      service.details = {
        senderName: document.getElementById('f_senderName').value.trim(),
        senderDoc: document.getElementById('f_senderDoc').value.trim(),
        city: document.getElementById('f_city').value.trim(),
        receiverName: document.getElementById('f_recName').value.trim(),
        receiverPhone: document.getElementById('f_recPhone').value.trim(),
        pkgDetail: document.getElementById('f_pkgDetail').value.trim()
      };
      service.label = 'Envío: ' + (service.details.city || 'Sin destino');
    } else if (serviceType === 'gestion_comercial') {
      service.details = {
        gestionTipo: document.getElementById('f_gestionTipo').value,
        gestionDesc: document.getElementById('f_gestionDesc').value.trim(),
        gestionEstado: document.getElementById('f_gestionEstado').value
      };
      service.label = 'Gestión: ' + service.details.gestionTipo;
    } else if (serviceType === 'construccion') {
      service.details = {
        obraUbicacion: document.getElementById('f_obraUbicacion').value.trim(),
        obraCategoria: document.getElementById('f_obraCategoria').value,
        obraPresupuesto: document.getElementById('f_obraPresupuesto').value,
        obraFechaInicio: document.getElementById('f_obraFechaInicio').value,
        obraFechaFin: document.getElementById('f_obraFechaFin').value,
        obraEstado: document.getElementById('f_obraEstado').value
      };
      service.label = 'Obra: ' + (service.details.obraUbicacion || 'Sin ubicación');
    } else if (serviceType === 'otro') {
      service.details = {
        otroDesc: document.getElementById('f_otroDesc').value.trim(),
        otroCategoria: document.getElementById('f_otroCategoria').value.trim(),
        otroPrioridad: document.getElementById('f_otroPrioridad').value
      };
      service.label = 'Otro: ' + (service.details.otroCategoria || 'Servicio');
    }

    packages.push(service);
    savePackages(packages);
    addAuditEntry('service_created', { id: service.id, type: service.serviceType, label: service.label, total: service.financial.total });
    closeModal();
    formNewService.reset();
    updateServiceFields();
    refreshAllData();
    showToast('Servicio ' + service.id + ' registrado correctamente');
    createInApi('packages', {
      status: service.status,
      sender_name: service.client.name,
      sender_phone: service.client.phone,
      sender_doc: '',
      receiver_name: '',
      receiver_phone: '',
      destination: service.label,
      fee: service.financial.fee,
      total: service.financial.total,
      type: service.serviceType,
      date: service.date
    }).catch(() => {});
  });
}

// ===================== RENDER FUNCTIONS =====================

// --- Overview Table ---
function renderOverviewTable(data) {
  var tbody = document.getElementById('tableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 8l-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg><p>No hay servicios registrados. Usa el botón "Registrar Servicio" para comenzar.</p></td></tr>';
    return;
  }
  // Show last 10
  var recent = data.slice(-10).reverse();
  recent.forEach(function(svc) {
    var tr = document.createElement('tr');
    var clientName = (svc.client && svc.client.name) ? svc.client.name : '—';
    var financial = svc.financial || {};
    var typeLabel = getServiceTypeLabel(svc.serviceType);
    var detailText = getServiceDetailText(svc);
    tr.innerHTML =
      '<td><span class="code">' + svc.id + '</span><span class="status status--' + svc.status + '">' + getServiceStatusText(svc.status) + '</span></td>' +
      '<td><span class="person-name">' + clientName + '</span></td>' +
      '<td><span class="city-name">' + detailText + '</span></td>' +
      '<td>' + typeLabel + '</td>' +
      '<td><span class="money-fee">' + formatMoney(financial.fee || 0) + '</span><span class="money-total">Total: ' + formatMoney(financial.total || 0) + '</span></td>' +
      '<td><button class="btn btn--secondary btn--sm btn-change-status" data-id="' + svc.id + '">Cambiar Estado</button> <button class="btn btn--danger btn--sm btn-delete" data-id="' + svc.id + '">Eliminar</button></td>';
    tbody.appendChild(tr);
  });
  attachServiceActionButtons(tbody);
}

// --- Packages Tab Table ---
function renderPackagesTable() {
  var tbody = document.getElementById('packagesTableBody');
  if (!tbody) return;
  var statusFilter = document.getElementById('filterStatus');
  var searchPkg = document.getElementById('searchPackages');
  var filtered = packages.slice();

  // Apply status filter
  if (statusFilter && statusFilter.value !== 'all') {
    filtered = filtered.filter(function(p) { return p.status === statusFilter.value; });
  }
  // Apply search filter
  if (searchPkg && searchPkg.value.trim()) {
    var term = searchPkg.value.toLowerCase();
    filtered = filtered.filter(function(p) {
      return p.id.toLowerCase().indexOf(term) !== -1 ||
        (p.sender && p.sender.name && p.sender.name.toLowerCase().indexOf(term) !== -1) ||
        (p.receiver && p.receiver.name && p.receiver.name.toLowerCase().indexOf(term) !== -1) ||
        (p.destination && p.destination.toLowerCase().indexOf(term) !== -1);
    });
  }

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><p>No se encontraron paquetes.</p></td></tr>';
    return;
  }
  filtered.reverse().forEach(function(pkg) {
    var tr = document.createElement('tr');
    var destination = (pkg.destination || '').toString();
    var senderName = (pkg.sender && pkg.sender.name || '').toString();
    var receiverName = (pkg.receiver && pkg.receiver.name || '').toString();
    var financialType = (pkg.financial && pkg.financial.type || '').toString();
    tr.innerHTML =
      '<td><span class="code">' + pkg.id + '</span></td>' +
      '<td><span class="status status--' + pkg.status + '">' + getStatusText(pkg.status) + '</span></td>' +
      '<td>' + senderName + '</td>' +
      '<td>' + receiverName + '</td>' +
      '<td>' + destination + '</td>' +
      '<td>' + financialType + '</td>' +
      '<td>' + formatDate(pkg.date) + '</td>' +
      '<td><button class="btn btn--secondary btn--sm btn-change-status" data-id="' + pkg.id + '">Estado</button> <button class="btn btn--danger btn--sm btn-delete" data-id="' + pkg.id + '">X</button></td>';
    tbody.appendChild(tr);
  });
  attachActionButtons(tbody);

  // Update packages KPIs
  var elTotal = document.getElementById('kpi-total-pkgs');
  var elTransit = document.getElementById('kpi-transit');
  var elReceived = document.getElementById('kpi-received');
  if (elTotal) elTotal.textContent = packages.length;
  if (elTransit) elTransit.textContent = packages.filter(function(p) { return p.status === 'transito'; }).length;
  if (elReceived) elReceived.textContent = packages.filter(function(p) { return p.status === 'recibido'; }).length;
}

// --- Services Unified Table ---
function getServiceStatusText(status) {
  if (!status) return '—';
  var map = {
    pendiente: 'Pendiente',
    en_proceso: 'En proceso',
    completado: 'Completado',
    cancelado: 'Cancelado',
    recibido: 'Recibido',
    transito: 'En tránsito',
    entregado: 'Entregado'
  };
  return map[status] || status;
}

function getServiceDetailText(svc) {
  if (!svc || !svc.details) return '—';
  var d = svc.details;
  if (svc.serviceType === 'paquete') {
    var parts = [];
    if (d.city) parts.push('Destino: ' + d.city);
    if (d.receiverName) parts.push('Destinatario: ' + d.receiverName);
    if (d.pkgDetail) parts.push(d.pkgDetail);
    return parts.join(' · ') || 'Envío de paquete';
  }
  if (svc.serviceType === 'gestion_comercial') {
    return (d.gestionTipo || 'Gestión') + (d.gestionDesc ? ' — ' + d.gestionDesc : '');
  }
  if (svc.serviceType === 'construccion') {
    return (d.obraCategoria || 'Obra') + (d.obraUbicacion ? ' en ' + d.obraUbicacion : '');
  }
  if (svc.serviceType === 'otro') {
    return (d.otroCategoria || 'Otro') + (d.otroDesc ? ' — ' + d.otroDesc : '');
  }
  return svc.label || svc.serviceType || '—';
}

function getServiceTypeLabel(type) {
  var map = {
    paquete: 'Envío Paquetes',
    gestion_comercial: 'Gestión Comercial',
    construccion: 'Construcción',
    otro: 'Otro'
  };
  return map[type] || type || '—';
}

function renderServicesTable() {
  var tbody = document.getElementById('servicesTableBody');
  if (!tbody) return;
  var typeFilter = document.getElementById('filterServiceType');
  var statusFilter = document.getElementById('filterServiceStatus');
  var searchEl = document.getElementById('searchServices');

  var filtered = packages.slice();

  if (typeFilter && typeFilter.value !== 'all') {
    filtered = filtered.filter(function(s) { return s.serviceType === typeFilter.value; });
  }
  if (statusFilter && statusFilter.value !== 'all') {
    filtered = filtered.filter(function(s) { return s.status === statusFilter.value; });
  }
  if (searchEl && searchEl.value.trim()) {
    var term = searchEl.value.toLowerCase();
    filtered = filtered.filter(function(s) {
      return s.id.toLowerCase().indexOf(term) !== -1 ||
        (s.client && s.client.name && s.client.name.toLowerCase().indexOf(term) !== -1) ||
        (s.label && s.label.toLowerCase().indexOf(term) !== -1);
    });
  }

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No hay servicios registrados.</p></td></tr>';
    return;
  }

  filtered.slice().reverse().forEach(function(svc) {
    var tr = document.createElement('tr');
    var detail = getServiceDetailText(svc);
    var typeLabel = getServiceTypeLabel(svc.serviceType);
    tr.innerHTML =
      '<td><span class="code">' + svc.id + '</span><br/><span style="font-size:12px;color:var(--texto-suave);">' + typeLabel + '</span></td>' +
      '<td><span class="person-name">' + (svc.client ? svc.client.name : '') + '</span>' +
      (svc.client && svc.client.phone ? '<br/><span class="person-sub">' + svc.client.phone + '</span>' : '') + '</td>' +
      '<td>' + detail + '</td>' +
      '<td><span class="status status--' + svc.status + '">' + getServiceStatusText(svc.status) + '</span></td>' +
      '<td>' + (svc.financial ? '<strong>' + formatMoney(svc.financial.total) + '</strong><br/><span class="person-sub">Comisión: ' + formatMoney(svc.financial.fee) + '</span>' : '—') + '</td>' +
      '<td>' + formatDate(svc.date) + '</td>' +
      '<td><button class="btn btn--secondary btn--sm btn-change-status" data-id="' + svc.id + '">Estado</button> <button class="btn btn--danger btn--sm btn-delete" data-id="' + svc.id + '">X</button></td>';
    tbody.appendChild(tr);
  });

  attachServiceActionButtons(tbody);
  renderServicesKPIs();
}

function attachServiceActionButtons(container) {
  var statusBtns = container.querySelectorAll('.btn-change-status');
  statusBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var id = btn.getAttribute('data-id');
      var svc = packages.find(function(p) { return p.id === id; });
      if (!svc) return;
      var cycle = ['pendiente', 'en_proceso', 'completado'];
      if (svc.serviceType === 'paquete') cycle = ['recibido', 'transito', 'entregado'];
      var idx = cycle.indexOf(svc.status);
      if (idx === -1 || idx === cycle.length - 1) svc.status = cycle[0];
      else svc.status = cycle[idx + 1];
      savePackages(packages);
      addAuditEntry('service_status_changed', { id: id, newStatus: svc.status });
      updateInApi('packages', id, { status: svc.status }).catch(function() {});
      refreshAllData();
      showToast(id + ' → ' + getServiceStatusText(svc.status));
    });
  });
  var deleteBtns = container.querySelectorAll('.btn-delete');
  deleteBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var id = btn.getAttribute('data-id');
      if (confirm('¿Seguro que deseas eliminar el servicio ' + id + '?')) {
        packages = packages.filter(function(p) { return p.id !== id; });
        savePackages(packages);
        addAuditEntry('service_deleted', { id: id });
        deleteInApi('packages', id).catch(function() {});
        refreshAllData();
        showToast('Servicio ' + id + ' eliminado');
      }
    });
  });
}

function renderServicesKPIs() {
  var elTotal = document.getElementById('kpi-services-total');
  var elPending = document.getElementById('kpi-services-pending');
  var elActive = document.getElementById('kpi-services-active');
  var elRevenue = document.getElementById('kpi-services-revenue');

  if (elTotal) elTotal.textContent = packages.length;
  if (elPending) elPending.textContent = packages.filter(function(p) { return p.status === 'pendiente'; }).length;
  if (elActive) elActive.textContent = packages.filter(function(p) { return p.status === 'en_proceso' || p.status === 'transito'; }).length;
  if (elRevenue) {
    var startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    var revenue = packages.filter(function(p) { return p.date && new Date(p.date) >= startOfMonth; }).reduce(function(s, p) { return s + Number((p.financial && p.financial.fee) || 0); }, 0);
    elRevenue.textContent = formatMoney(revenue);
  }
}

// --- Money Tab ---
function renderMoneyTable() {
  var tbody = document.getElementById('moneyTableBody');
  if (!tbody) return;
  var moneyPkgs = packages.filter(function(p) { return p.serviceType === 'gestion_comercial'; });
  tbody.innerHTML = '';
  if (moneyPkgs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No hay envíos de dinero registrados.</p></td></tr>';
  } else {
    moneyPkgs.reverse().forEach(function(svc) {
      var tr = document.createElement('tr');
      var clientName = (svc.client && svc.client.name) ? svc.client.name : '—';
      var financial = svc.financial || {};
      tr.innerHTML =
        '<td><span class="code">' + svc.id + '</span></td>' +
        '<td>' + clientName + '</td>' +
        '<td>' + (svc.details ? svc.details.gestionTipo : '') + '</td>' +
        '<td><strong>' + formatMoney(financial.total || 0) + '</strong></td>' +
        '<td>' + formatMoney(financial.fee || 0) + '</td>' +
        '<td><span class="status status--' + svc.status + '">' + getServiceStatusText(svc.status) + '</span></td>' +
        '<td>' + formatDate(svc.date) + '</td>';
      tbody.appendChild(tr);
    });
  }
  // KPIs
  var totalSent = moneyPkgs.reduce(function(s, p) { return s + Number((p.financial && p.financial.total) || 0); }, 0);
  var totalFees = moneyPkgs.reduce(function(s, p) { return s + Number((p.financial && p.financial.fee) || 0); }, 0);
  var pending = moneyPkgs.filter(function(p) { return p.status !== 'completado'; }).length;
  var elSent = document.getElementById('kpi-money-sent');
  var elFees = document.getElementById('kpi-money-fees');
  var elPending = document.getElementById('kpi-money-pending');
  if (elSent) elSent.textContent = formatMoney(totalSent);
  if (elFees) elFees.textContent = formatMoney(totalFees);
  if (elPending) elPending.textContent = pending;
}

// --- Clients Tab ---
function getClientTag(c) {
  if (c.vip) return '<span class="badge badge--vip">VIP</span>';
  if (c.frequent) return '<span class="badge badge--frecuente">Frecuente</span>';
  if (c.isNew) return '<span class="badge badge--nuevo">Nuevo</span>';
  if (c.debt) return '<span class="badge badge--moroso">Moroso</span>';
  return '';
}

function renderClientsTable() {
  var tbody = document.getElementById('clientsTableBody');
  if (!tbody) return;
  var clientMap = {};
  packages.forEach(function(svc) {
    if (!svc.client || !svc.client.name) return;
    var key = svc.client.name + '|' + (svc.client.phone || '');
    if (!clientMap[key]) {
      clientMap[key] = {
        name: svc.client.name,
        phone: svc.client.phone || '',
        email: (svc.client && svc.client.email) ? svc.client.email : '',
        doc: (svc.client && svc.client.doc) ? svc.client.doc : '',
        city: (svc.details && svc.details.city) ? svc.details.city : ((svc.client && svc.client.city) ? svc.client.city : ''),
        address: (svc.client && svc.client.address) ? svc.client.address : '',
        payment: (svc.client && svc.client.payment) ? svc.client.payment : 'Efectivo',
        notes: (svc.client && svc.client.notes) ? svc.client.notes : '',
        count: 0,
        lastDate: svc.date,
        firstDate: svc.date,
        pending: 0,
        debt: false,
        history: []
      };
    }
    clientMap[key].count++;
    if (svc.date > clientMap[key].lastDate) clientMap[key].lastDate = svc.date;
    if (svc.date < clientMap[key].firstDate) clientMap[key].firstDate = svc.date;
    if (svc.status === 'pendiente' || svc.status === 'transito') clientMap[key].pending++;
    if (svc.debt === true || svc.status === 'moroso') clientMap[key].debt = true;
    clientMap[key].history.push({
      date: svc.date,
      code: svc.id,
      status: svc.status,
      amount: (svc.amount || 0)
    });
  });
  var allClients = Object.values(clientMap);
  var today = new Date();
  var startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  allClients.forEach(function(c) {
    c.isNew = new Date(c.lastDate) >= startOfMonth && c.count === 1;
    c.frequent = c.count >= 3;
    c.vip = c.count >= 5;
  });
  var clients = allClients.slice();

  var searchEl = document.getElementById('searchClients');
  var cityEl = document.getElementById('filterClientCity');
  var typeEl = document.getElementById('filterClientType');
  var dateFromEl = document.getElementById('filterClientDateFrom');
  var dateToEl = document.getElementById('filterClientDateTo');
  if (searchEl && searchEl.value.trim()) {
    var term = searchEl.value.toLowerCase();
    clients = clients.filter(function(c) {
      return (c.name + ' ' + c.phone + ' ' + c.email + ' ' + c.doc).toLowerCase().indexOf(term) !== -1;
    });
  }
  if (cityEl && cityEl.value) {
    clients = clients.filter(function(c) { return c.city === cityEl.value; });
  }
  if (typeEl && typeEl.value) {
    clients = clients.filter(function(c) {
      if (typeEl.value === 'vip') return c.vip;
      if (typeEl.value === 'frecuente') return c.frequent;
      if (typeEl.value === 'nuevo') return c.isNew;
      if (typeEl.value === 'moroso') return c.debt;
      return true;
    });
  }
  if (dateFromEl && dateFromEl.value) {
    var from = new Date(dateFromEl.value);
    clients = clients.filter(function(c) { return new Date(c.lastDate) >= from; });
  }
  if (dateToEl && dateToEl.value) {
    var to = new Date(dateToEl.value);
    to.setHours(23, 59, 59, 999);
    clients = clients.filter(function(c) { return new Date(c.lastDate) <= to; });
  }

  tbody.innerHTML = '';
  if (clients.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state"><p>No hay clientes registrados.</p></td></tr>';
  } else {
    clients.sort(function(a, b) { return b.count - a.count; });
    clients.forEach(function(c) {
      var tr = document.createElement('tr');
      var tag = getClientTag(c);
      var key = c.name + '|' + (c.phone || '');
      tr.setAttribute('data-client-key', key);
      tr.innerHTML =
        '<td><span class="person-name" title="Doble clic para editar">' + c.name + ' ' + tag + '</span></td>' +
        '<td data-field="phone" title="Doble clic para editar">' + c.phone + '</td>' +
        '<td data-field="email" title="Doble clic para editar">' + (c.email || '—') + '</td>' +
        '<td data-field="city" title="Doble clic para editar">' + (c.city || '—') + '</td>' +
        '<td data-field="address" title="Doble clic para editar">' + (c.address || '—') + '</td>' +
        '<td data-field="payment" title="Doble clic para editar">' + c.payment + '</td>' +
        '<td data-field="doc" title="Doble clic para editar">' + (c.doc || '—') + '</td>' +
        '<td><strong>' + c.count + '</strong></td>' +
        '<td>' + formatDate(c.lastDate) + '</td>' +
        '<td data-field="notes" title="Doble clic para editar">' + (c.notes ? c.notes.substring(0, 40) + (c.notes.length > 40 ? '...' : '') : '—') + '</td>' +
        '<td><div class="table-actions">' +
          '<button class="btn btn--view" data-action="view" data-key="' + c.name + '|' + c.phone + '">Ver</button>' +
          '<button class="btn btn--edit" data-action="edit" data-key="' + c.name + '|' + c.phone + '">Editar</button>' +
          '<button class="btn btn--delete" data-action="delete" data-key="' + c.name + '|' + c.phone + '">Eliminar</button>' +
        '</div></td>';
      tbody.appendChild(tr);
    });
  }
  var elTotal = document.getElementById('kpi-total-clients');
  var elNew = document.getElementById('kpi-new-clients');
  var elFreq = document.getElementById('kpi-frequent-clients');
  var elActive = document.getElementById('kpi-active-clients');
  var elVip = document.getElementById('kpi-vip-clients');
  var elPending = document.getElementById('kpi-pending-clients');
  var elDebt = document.getElementById('kpi-debt-clients');
  if (elTotal) elTotal.textContent = allClients.length;
  if (elNew) elNew.textContent = allClients.filter(function(c) { return c.isNew; }).length;
  if (elFreq) elFreq.textContent = allClients.filter(function(c) { return c.frequent; }).length;
  if (elActive) elActive.textContent = allClients.filter(function(c) { return c.count > 0; }).length;
  if (elVip) elVip.textContent = allClients.filter(function(c) { return c.vip; }).length;
  if (elPending) elPending.textContent = allClients.reduce(function(s, c) { return s + c.pending; }, 0);
  if (elDebt) elDebt.textContent = allClients.filter(function(c) { return c.debt; }).length;

  var cities = [];
  allClients.forEach(function(c) { if (c.city && cities.indexOf(c.city) === -1) cities.push(c.city); });
  cities.sort();
  if (cityEl) {
    cityEl.innerHTML = '<option value="">Todas las ciudades</option>';
    cities.forEach(function(city) {
      var opt = document.createElement('option');
      opt.value = city;
      opt.textContent = city;
      cityEl.appendChild(opt);
    });
  }
}

function exportClientsCSV() {
  var tbody = document.getElementById('clientsTableBody');
  if (!tbody) return;
  var rows = tbody.querySelectorAll('tr');
  var csv = 'Nombre,Telefono,Email,Ciudad,Direccion,Metodo de Pago,Identificacion,Total Envios,Ultimo Envio,Notas\n';
  rows.forEach(function(tr) {
    var cells = tr.querySelectorAll('td');
    if (cells.length < 11) return;
    var row = [
      cells[0].textContent.trim(),
      cells[1].textContent.trim(),
      cells[2].textContent.trim(),
      cells[3].textContent.trim(),
      cells[4].textContent.trim(),
      cells[5].textContent.trim(),
      cells[6].textContent.trim(),
      cells[7].textContent.trim(),
      cells[8].textContent.trim(),
      cells[9].textContent.trim()
    ];
    csv += row.map(function(v) { return '"' + v.replace(/"/g, '""') + '"'; }).join(',') + '\n';
  });
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'clientes.csv';
  link.click();
}

function openClientDetail(key) {
  var client = null;
  packages.forEach(function(svc) {
    if (!svc.client || !svc.client.name) return;
    var ck = svc.client.name + '|' + (svc.client.phone || '');
    if (ck === key) {
      if (!client) {
        client = {
          name: svc.client.name,
          phone: svc.client.phone || '',
          email: (svc.client && svc.client.email) ? svc.client.email : '',
          doc: (svc.client && svc.client.doc) ? svc.client.doc : '',
          city: (svc.details && svc.details.city) ? svc.details.city : '',
          address: (svc.client && svc.client.address) ? svc.client.address : '',
          payment: (svc.client && svc.client.payment) ? svc.client.payment : 'Efectivo',
          notes: (svc.client && svc.client.notes) ? svc.client.notes : '',
          history: []
        };
      }
      client.history.push({
        date: svc.date,
        code: svc.id,
        status: svc.status,
        amount: (svc.amount || 0)
      });
    }
  });
  if (!client) return;
  client.history.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  var html = '<div class="client-detail-grid">' +
    '<div class="client-detail-item"><label>Nombre</label><span>' + client.name + '</span></div>' +
    '<div class="client-detail-item"><label>Teléfono</label><span>' + client.phone + '</span></div>' +
    '<div class="client-detail-item"><label>Email</label><span>' + (client.email || '—') + '</span></div>' +
    '<div class="client-detail-item"><label>Ciudad</label><span>' + (client.city || '—') + '</span></div>' +
    '<div class="client-detail-item"><label>Dirección</label><span>' + (client.address || '—') + '</span></div>' +
    '<div class="client-detail-item"><label>Método de Pago</label><span>' + client.payment + '</span></div>' +
    '<div class="client-detail-item"><label>Identificación</label><span>' + (client.doc || '—') + '</span></div>' +
    '<div class="client-detail-item"><label>Notas</label><span>' + (client.notes || '—') + '</span></div>' +
  '</div>' +
  '<div class="history-panel"><h4>Historial de actividad</h4><ul class="history-list">';
  client.history.forEach(function(h) {
    html += '<li><strong>' + formatDate(h.date) + '</strong> — ' + h.code + ' · ' + getServiceStatusText(h.status) + ' · ' + formatMoney(h.amount) + '</li>';
  });
  html += '</ul></div>';
  var modal = document.getElementById('clientDetailModal');
  var body = document.getElementById('clientDetailBody');
  if (modal && body) {
    body.innerHTML = html;
    modal.classList.add('is-open');
  }
}

function closeClientDetail() {
  var modal = document.getElementById('clientDetailModal');
  if (modal) modal.classList.remove('is-open');
}

function deleteClient(key) {
  if (!confirm('¿Seguro que deseas eliminar este cliente?')) return;
  for (var i = packages.length - 1; i >= 0; i--) {
    if (!packages[i].client || !packages[i].client.name) continue;
    var ck = packages[i].client.name + '|' + (packages[i].client.phone || '');
    if (ck === key) {
      packages.splice(i, 1);
    }
  }
  renderClientsTable();
}

function initClients() {
  renderClientsTable();
  var btnExport = document.getElementById('btnExportClients');
  if (btnExport) btnExport.addEventListener('click', exportClientsCSV);
  var btnClear = document.getElementById('btnClearClientFilters');
  if (btnClear) {
    btnClear.addEventListener('click', function() {
      var searchEl = document.getElementById('searchClients');
      var cityEl = document.getElementById('filterClientCity');
      var typeEl = document.getElementById('filterClientType');
      var dateFromEl = document.getElementById('filterClientDateFrom');
      var dateToEl = document.getElementById('filterClientDateTo');
      if (searchEl) searchEl.value = '';
      if (cityEl) cityEl.value = '';
      if (typeEl) typeEl.value = '';
      if (dateFromEl) dateFromEl.value = '';
      if (dateToEl) dateToEl.value = '';
      renderClientsTable();
    });
  }
  initInlineClientEdit();
  var tbody = document.getElementById('clientsTableBody');
  if (tbody) {
    tbody.addEventListener('click', function(e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var key = btn.getAttribute('data-key');
      var action = btn.getAttribute('data-action');
      if (action === 'view') openClientDetail(key);
      if (action === 'edit') alert('Editar cliente: ' + key.replace('|', ' / '));
      if (action === 'delete') deleteClient(key);
    });
  }
}

function initInlineClientEdit() {
  var tbody = document.getElementById('clientsTableBody');
  if (!tbody) return;
  var editableFields = ['phone', 'email', 'city', 'address', 'payment', 'notes'];

  tbody.addEventListener('dblclick', function(e) {
    var cell = e.target.closest('td');
    if (!cell) return;
    var field = cell.getAttribute('data-field');
    if (!field || editableFields.indexOf(field) === -1) return;
    if (cell.querySelector('input')) return;

    var current = cell.textContent.trim();
    var input = document.createElement('input');
    input.type = 'text';
    input.value = current === '—' ? '' : current;
    input.className = 'inline-edit-input';
    cell.textContent = '';
    cell.appendChild(input);
    input.focus();
    input.select();

    function save() {
      var newValue = input.value.trim();
      var row = cell.parentElement;
      var key = row.getAttribute('data-client-key');
      if (!key) return;
      packages.forEach(function(p) {
        if (!p.client || !p.client.name) return;
        var ck = p.client.name + '|' + (p.client.phone || '');
        if (ck === key) {
          if (!p.client[field]) p.client[field] = '';
          p.client[field] = newValue;
        }
      });
      savePackages(packages);
      renderClientsTable();
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { input.blur(); }
      if (ev.key === 'Escape') { renderClientsTable(); }
    });
  });
}

// --- Deliveries Tab ---
function renderDeliveriesTable() {
  var tbody = document.getElementById('deliveriesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  var sorted = packages.slice().reverse();
  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No hay entregas registradas.</p></td></tr>';
  } else {
    sorted.forEach(function(svc) {
      var tr = document.createElement('tr');
      var receiverName = (svc.details && svc.details.receiverName) ? svc.details.receiverName : ((svc.client && svc.client.name) ? svc.client.name : '—');
      var receiverPhone = (svc.details && svc.details.receiverPhone) ? svc.details.receiverPhone : ((svc.client && svc.client.phone) ? svc.client.phone : '—');
      var destination = (svc.details && svc.details.city) ? svc.details.city : (svc.details && svc.details.obraUbicacion ? svc.details.obraUbicacion : '—');
      tr.innerHTML =
        '<td><span class="code">' + svc.id + '</span></td>' +
        '<td>' + receiverName + '</td>' +
        '<td>' + destination + '</td>' +
        '<td>' + receiverPhone + '</td>' +
        '<td><span class="status status--' + svc.status + '">' + getServiceStatusText(svc.status) + '</span></td>' +
        '<td>' + formatDate(svc.date) + '</td>' +
        '<td>' + (svc.status !== 'completado' && svc.status !== 'entregado' ? '<button class="btn btn--primary btn--sm btn-deliver" data-id="' + svc.id + '">Marcar Completado</button>' : '<span style="color:var(--verde);font-weight:600;">Completado</span>') + '</td>';
      tbody.appendChild(tr);
    });
    // Attach deliver buttons
    var deliverBtns = tbody.querySelectorAll('.btn-deliver');
    deliverBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var pkgId = btn.getAttribute('data-id');
        packages.forEach(function(p) { if (p.id === pkgId) {
          if (p.serviceType === 'paquete') p.status = 'entregado';
          else p.status = 'completado';
        } });
        savePackages(packages);
        refreshAllData();
        showToast('Servicio ' + pkgId + ' marcado como completado');
      });
    });
  }
  // KPIs
  var today = new Date();
  var todayStr = today.toDateString();
  var startOfWeek = new Date(today);
  var dayOfWeek = startOfWeek.getDay();
  var diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  startOfWeek.setDate(startOfWeek.getDate() + diff);

  var delToday = packages.filter(function(p) { return (p.status === 'entregado' || p.status === 'completado') && p.date && new Date(p.date).toDateString() === todayStr; }).length;
  var delWeek = packages.filter(function(p) { return (p.status === 'entregado' || p.status === 'completado') && p.date && new Date(p.date) >= startOfWeek; }).length;
  var delPending = packages.filter(function(p) { return p.status !== 'entregado' && p.status !== 'completado'; }).length;

  var elDT = document.getElementById('kpi-del-today');
  var elDW = document.getElementById('kpi-del-week');
  var elDP = document.getElementById('kpi-del-pending');
  if (elDT) elDT.textContent = delToday;
  if (elDW) elDW.textContent = delWeek;
  if (elDP) elDP.textContent = delPending;
}

// --- Finance Tab ---
var financeFilterPeriod = 'all';

function renderFinanceTable() {
  var tbody = document.getElementById('financeTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  var filtered = packages.slice();
  if (financeFilterPeriod === 'today') {
    var todayStr2 = new Date().toDateString();
    filtered = filtered.filter(function(p) { return p.date && new Date(p.date).toDateString() === todayStr2; });
  } else if (financeFilterPeriod === 'week') {
    var today3 = new Date();
    var startOfWeek3 = new Date(today3);
    var dayOfWeek3 = startOfWeek3.getDay();
    var diff3 = (dayOfWeek3 === 0 ? -6 : 1) - dayOfWeek3;
    startOfWeek3.setDate(startOfWeek3.getDate() + diff3);
    startOfWeek3.setHours(0,0,0,0);
    filtered = filtered.filter(function(p) { return p.date && new Date(p.date) >= startOfWeek3; });
  } else if (financeFilterPeriod === 'month') {
    var startOfMonth3 = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    filtered = filtered.filter(function(p) { return p.date && new Date(p.date) >= startOfMonth3; });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No hay movimientos financieros en este periodo.</p></td></tr>';
  } else {
    filtered.slice().reverse().forEach(function(svc) {
      var tr = document.createElement('tr');
      var financial = svc.financial || {};
      var clientName = (svc.client && svc.client.name) ? svc.client.name : '—';
      var typeLabel = getServiceTypeLabel(svc.serviceType);
      tr.innerHTML =
        '<td>' + formatDate(svc.date) + '</td>' +
        '<td><span class="code">' + svc.id + '</span></td>' +
        '<td>' + typeLabel + '</td>' +
        '<td><strong>' + formatMoney(financial.total || 0) + '</strong></td>' +
        '<td>' + formatMoney(financial.fee || 0) + '</td>' +
        '<td>' + clientName + '</td>';
      tbody.appendChild(tr);
    });
  }

  // KPIs
  var today = new Date();
  var todayStr = today.toDateString();
  var startOfWeek = new Date(today);
  var dayOfWeek = startOfWeek.getDay();
  var diff2 = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  startOfWeek.setDate(startOfWeek.getDate() + diff2);
  startOfWeek.setHours(0,0,0,0);
  var startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  var totalIncome = packages.reduce(function(s, p) { return s + Number((p.financial && p.financial.total) || 0); }, 0);
  var feesToday = packages.filter(function(p) { return p.date && new Date(p.date).toDateString() === todayStr; }).reduce(function(s, p) { return s + Number((p.financial && p.financial.fee) || 0); }, 0);
  var feesWeek = packages.filter(function(p) { return p.date && new Date(p.date) >= startOfWeek; }).reduce(function(s, p) { return s + Number((p.financial && p.financial.fee) || 0); }, 0);
  var feesMonth = packages.filter(function(p) { return p.date && new Date(p.date) >= startOfMonth; }).reduce(function(s, p) { return s + Number((p.financial && p.financial.fee) || 0); }, 0);

  var elFI = document.getElementById('kpi-fin-income');
  var elFT = document.getElementById('kpi-fin-today');
  var elFW = document.getElementById('kpi-fin-week');
  var elFM = document.getElementById('kpi-fin-month');
  if (elFI) elFI.textContent = formatMoney(totalIncome);
  if (elFT) elFT.textContent = formatMoney(feesToday);
  if (elFW) elFW.textContent = formatMoney(feesWeek);
  if (elFM) elFM.textContent = formatMoney(feesMonth);
}

function getWeekKey(dateStr) {
  var d = new Date(dateStr);
  var year = d.getFullYear();
  var week = getWeekNumber(d);
  return year + '-W' + week;
}

function getWeekNumber(d) {
  var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function getMonthKey(dateStr) {
  var d = new Date(dateStr);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function getDayKey(dateStr) {
  var d = new Date(dateStr);
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return month + '/' + day;
}

function formatPeriodLabel(periodKey, type) {
  if (type === 'week') {
    var parts = periodKey.split('-W');
    return 'Semana ' + parts[1] + ' de ' + parts[0];
  } else if (type === 'month') {
    var parts2 = periodKey.split('-');
    var monthNum = parseInt(parts2[1], 10);
    var months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return months[monthNum - 1] + ' ' + parts2[0];
  }
  return periodKey;
}

function renderCommissionsHistory() {
  var tbody = document.getElementById('commissionsTableBody');
  if (!tbody) return;
  var periodFilter = document.getElementById('filterCommissionPeriod');
  var filtered = [];

  if (periodFilter && periodFilter.value === 'week') {
    var weekMap = {};
    packages.forEach(function(p) {
      if (!p.date) return;
      var key = getWeekKey(p.date);
      if (!weekMap[key]) weekMap[key] = { total: 0, count: 0, start: p.date, end: p.date };
      weekMap[key].total += Number(p.financial.fee);
      weekMap[key].count++;
      if (new Date(p.date) < new Date(weekMap[key].start)) weekMap[key].start = p.date;
      if (new Date(p.date) > new Date(weekMap[key].end)) weekMap[key].end = p.date;
    });
    Object.keys(weekMap).sort().reverse().forEach(function(key) {
      filtered.push({ key: key, type: 'week', start: weekMap[key].start, end: weekMap[key].end, total: weekMap[key].total, count: weekMap[key].count });
    });
  } else if (periodFilter && periodFilter.value === 'month') {
    var monthMap = {};
    packages.forEach(function(p) {
      if (!p.date) return;
      var key2 = getMonthKey(p.date);
      if (!monthMap[key2]) monthMap[key2] = { total: 0, count: 0, start: p.date, end: p.date };
      monthMap[key2].total += Number(p.financial.fee);
      monthMap[key2].count++;
      if (new Date(p.date) < new Date(monthMap[key2].start)) monthMap[key2].start = p.date;
      if (new Date(p.date) > new Date(monthMap[key2].end)) monthMap[key2].end = p.date;
    });
    Object.keys(monthMap).sort().reverse().forEach(function(key3) {
      filtered.push({ key: key3, type: 'month', start: monthMap[key3].start, end: monthMap[key3].end, total: monthMap[key3].total, count: monthMap[key3].count });
    });
  } else {
    var wMap = {};
    var mMap = {};
    packages.forEach(function(p) {
      if (!p.date) return;
      var wKey = getWeekKey(p.date);
      if (!wMap[wKey]) wMap[wKey] = { total: 0, count: 0, start: p.date, end: p.date };
      wMap[wKey].total += Number(p.financial.fee);
      wMap[wKey].count++;
      if (new Date(p.date) < new Date(wMap[wKey].start)) wMap[wKey].start = p.date;
      if (new Date(p.date) > new Date(wMap[wKey].end)) wMap[wKey].end = p.date;

      var mKey = getMonthKey(p.date);
      if (!mMap[mKey]) mMap[mKey] = { total: 0, count: 0, start: p.date, end: p.date };
      mMap[mKey].total += Number(p.financial.fee);
      mMap[mKey].count++;
      if (new Date(p.date) < new Date(mMap[mKey].start)) mMap[mKey].start = p.date;
      if (new Date(p.date) > new Date(mMap[mKey].end)) mMap[mKey].end = p.date;
    });
    Object.keys(wMap).sort().reverse().forEach(function(k) {
      filtered.push({ key: k, type: 'week', start: wMap[k].start, end: wMap[k].end, total: wMap[k].total, count: wMap[k].count });
    });
    Object.keys(mMap).sort().reverse().forEach(function(k2) {
      filtered.push({ key: k2, type: 'month', start: mMap[k2].start, end: mMap[k2].end, total: mMap[k2].total, count: mMap[k2].count });
    });
  }

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No hay datos de comisiones por periodo.</p></td></tr>';
    return;
  }

  filtered.forEach(function(item) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + formatPeriodLabel(item.key, item.type) + '</td>' +
      '<td>' + formatDate(item.start) + '</td>' +
      '<td>' + formatDate(item.end) + '</td>' +
      '<td><strong>' + formatMoney(item.total) + '</strong></td>' +
      '<td>' + item.count + '</td>';
    tbody.appendChild(tr);
  });
}

// --- Reports Tab ---
function renderReportsTable() {
  var tbody = document.getElementById('reportsTableBody');
  if (!tbody) return;
  var cityMap = {};
  packages.forEach(function(svc) {
    var city = (svc.details && svc.details.obraUbicacion) ? svc.details.obraUbicacion : (svc.destination || 'General');
    if (!cityMap[city]) { cityMap[city] = { total: 0, paquetes: 0, dinero: 0, otros: 0, income: 0 }; }
    cityMap[city].total++;
    if (svc.serviceType === 'paquete') cityMap[city].paquetes++;
    else if (svc.serviceType === 'gestion_comercial') cityMap[city].dinero++;
    else cityMap[city].otros++;
    cityMap[city].income += Number((svc.financial && svc.financial.total) || 0);
  });

  var cities = Object.keys(cityMap);
  tbody.innerHTML = '';
  if (cities.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No hay datos para reportes.</p></td></tr>';
  } else {
    cities.sort(function(a, b) { return cityMap[b].total - cityMap[a].total; });
    cities.forEach(function(city) {
      var d = cityMap[city];
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>' + city + '</strong></td>' +
        '<td>' + d.total + '</td>' +
        '<td>' + d.paquetes + '</td>' +
        '<td>' + d.dinero + '</td>' +
        '<td>' + d.otros + '</td>' +
        '<td><strong>' + formatMoney(d.income) + '</strong></td>';
      tbody.appendChild(tr);
    });
  }
  // KPIs
  var elRepTotal = document.getElementById('kpi-rep-total');
  var elRepCities = document.getElementById('kpi-rep-cities');
  if (elRepTotal) elRepTotal.textContent = packages.length;
  if (elRepCities) elRepCities.textContent = cities.length;
}

// ===================== ACTION BUTTONS =====================
function attachActionButtons(container) {
  // Change status buttons
  var statusBtns = container.querySelectorAll('.btn-change-status');
  statusBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var pkgId = btn.getAttribute('data-id');
      var pkg = packages.find(function(p) { return p.id === pkgId; });
      if (!pkg) return;
      // Cycle: recibido -> transito -> entregado -> recibido
      if (pkg.status === 'recibido') pkg.status = 'transito';
      else if (pkg.status === 'transito') pkg.status = 'entregado';
      else pkg.status = 'recibido';
      savePackages(packages);
      addAuditEntry('package_status_changed', { id: pkgId, newStatus: pkg.status });
      updateInApi('packages', pkgId, { status: pkg.status }).catch(() => {});
      refreshAllData();
      showToast(pkgId + ' → ' + getStatusText(pkg.status));
    });
  });
  // Delete buttons
  var deleteBtns = container.querySelectorAll('.btn-delete');
  deleteBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var pkgId = btn.getAttribute('data-id');
      if (confirm('¿Seguro que deseas eliminar el paquete ' + pkgId + '?')) {
        packages = packages.filter(function(p) { return p.id !== pkgId; });
        savePackages(packages);
        addAuditEntry('package_deleted', { id: pkgId });
        deleteInApi('packages', pkgId).catch(() => {});
        refreshAllData();
        showToast('Paquete ' + pkgId + ' eliminado');
      }
    });
  });
}

// ===================== OVERVIEW KPIs =====================
function calculateOverviewKPIs() {
  var today = new Date();
  var todayStr = today.toDateString();
  var startOfWeek = new Date(today);
  var dayOfWeek = startOfWeek.getDay();
  var diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
  startOfWeek.setDate(startOfWeek.getDate() + diff);
  var startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  var yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  var yesterdayStr = yesterday.toDateString();

  var deliveredToday = packages.filter(function(p) { return p.status === 'entregado' && p.date && new Date(p.date).toDateString() === todayStr; }).length;
  var deliveredYesterday = packages.filter(function(p) { return p.status === 'entregado' && p.date && new Date(p.date).toDateString() === yesterdayStr; }).length;
  var deliveredWeek = packages.filter(function(p) { return p.status === 'entregado' && p.date && new Date(p.date) >= startOfWeek; }).length;
  var deliveredMonth = packages.filter(function(p) { return p.status === 'entregado' && p.date && new Date(p.date) >= startOfMonth; }).length;
  var revenue = packages.filter(function(p) { return p.date && new Date(p.date) >= startOfMonth; }).reduce(function(s, p) { return s + Number((p.financial && p.financial.fee) || 0); }, 0);

  var elT = document.getElementById('kpi-today');
  var elW = document.getElementById('kpi-week');
  var elM = document.getElementById('kpi-month');
  var elR = document.getElementById('kpi-revenue');
  if (elT) elT.textContent = deliveredToday;
  if (elW) elW.textContent = deliveredWeek;
  if (elM) elM.textContent = deliveredMonth;
  if (elR) elR.textContent = formatMoney(revenue);

  function setTrend(id, current, previous) {
    var el = document.getElementById(id);
    if (!el) return;
    if (previous === 0 && current === 0) {
      el.innerHTML = '<span class="kpi-trend kpi-trend--neutral">— Sin datos</span>';
    } else if (current > previous) {
      el.innerHTML = '<span class="kpi-trend kpi-trend--up"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> +' + (previous > 0 ? Math.round((current - previous) / previous * 100) : 100) + '%</span>';
    } else if (current < previous) {
      el.innerHTML = '<span class="kpi-trend kpi-trend--down"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg> ' + (previous > 0 ? Math.round((previous - current) / previous * 100) : 0) + '%</span>';
    } else {
      el.innerHTML = '<span class="kpi-trend kpi-trend--neutral">— Igual</span>';
    }
  }

  setTrend('kpi-today-trend', deliveredToday, deliveredYesterday);
}

// ===================== SEARCH & FILTER EVENTS =====================
var searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', function() {
    var term = searchInput.value.toLowerCase();
    var filtered = packages.filter(function(pkg) {
      return pkg.id.toLowerCase().indexOf(term) !== -1 ||
        pkg.sender.name.toLowerCase().indexOf(term) !== -1 ||
        pkg.receiver.name.toLowerCase().indexOf(term) !== -1 ||
        pkg.destination.toLowerCase().indexOf(term) !== -1;
    });
    renderOverviewTable(filtered);
  });
}

var dateFrom = document.getElementById('dateFrom');
var dateTo = document.getElementById('dateTo');
var btnClearDates = document.getElementById('btnClearDates');
function applyOverviewDateFilter() {
  var from = dateFrom ? dateFrom.value : '';
  var to = dateTo ? dateTo.value : '';
  var term = (searchInput ? searchInput.value : '').toLowerCase();
  var filtered = packages.filter(function(pkg) {
    if (term && pkg.id.toLowerCase().indexOf(term) === -1 && pkg.sender.name.toLowerCase().indexOf(term) === -1 && pkg.receiver.name.toLowerCase().indexOf(term) === -1 && pkg.destination.toLowerCase().indexOf(term) === -1) return false;
    if (from && pkg.date && pkg.date.slice(0, 10) < from) return false;
    if (to && pkg.date && pkg.date.slice(0, 10) > to) return false;
    return true;
  });
  renderOverviewTable(filtered);
}
if (dateFrom) dateFrom.addEventListener('change', applyOverviewDateFilter);
if (dateTo) dateTo.addEventListener('change', applyOverviewDateFilter);
if (btnClearDates) {
  btnClearDates.addEventListener('click', function() {
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    applyOverviewDateFilter();
  });
}

var filterStatus = document.getElementById('filterStatus');
var searchPackages = document.getElementById('searchPackages');
if (filterStatus) filterStatus.addEventListener('change', renderPackagesTable);
if (searchPackages) searchPackages.addEventListener('input', renderPackagesTable);

var pkgDateFrom = document.getElementById('pkgDateFrom');
var pkgDateTo = document.getElementById('pkgDateTo');
var btnClearPkgDates = document.getElementById('btnClearPkgDates');
function applyPackageDateFilter() {
  var from = pkgDateFrom ? pkgDateFrom.value : '';
  var to = pkgDateTo ? pkgDateTo.value : '';
  var status = filterStatus ? filterStatus.value : 'all';
  var term = (searchPackages ? searchPackages.value : '').toLowerCase();
  var filtered = packages.filter(function(pkg) {
    if (status !== 'all' && pkg.status !== status) return false;
    if (term && pkg.id.toLowerCase().indexOf(term) === -1 && pkg.sender.name.toLowerCase().indexOf(term) === -1 && pkg.receiver.name.toLowerCase().indexOf(term) === -1 && pkg.destination.toLowerCase().indexOf(term) === -1) return false;
    if (from && pkg.date && pkg.date.slice(0, 10) < from) return false;
    if (to && pkg.date && pkg.date.slice(0, 10) > to) return false;
    return true;
  });
  renderPackagesTableFiltered(filtered);
}
if (pkgDateFrom) pkgDateFrom.addEventListener('change', applyPackageDateFilter);
if (pkgDateTo) pkgDateTo.addEventListener('change', applyPackageDateFilter);
if (btnClearPkgDates) {
  btnClearPkgDates.addEventListener('click', function() {
    if (pkgDateFrom) pkgDateFrom.value = '';
    if (pkgDateTo) pkgDateTo.value = '';
    applyPackageDateFilter();
  });
}

var moneyDateFrom = document.getElementById('moneyDateFrom');
var moneyDateTo = document.getElementById('moneyDateTo');
var btnClearMoneyDates = document.getElementById('btnClearMoneyDates');
function applyMoneyDateFilter() {
  var from = moneyDateFrom ? moneyDateFrom.value : '';
  var to = moneyDateTo ? moneyDateTo.value : '';
  var moneyPkgs = packages.filter(function(p) { return p.financial.type === 'Envío Dinero'; });
  if (from) moneyPkgs = moneyPkgs.filter(function(p) { return p.date && p.date.slice(0, 10) >= from; });
  if (to) moneyPkgs = moneyPkgs.filter(function(p) { return p.date && p.date.slice(0, 10) <= to; });
  renderMoneyTableFiltered(moneyPkgs);
}
if (moneyDateFrom) moneyDateFrom.addEventListener('change', applyMoneyDateFilter);
if (moneyDateTo) moneyDateTo.addEventListener('change', applyMoneyDateFilter);
if (btnClearMoneyDates) {
  btnClearMoneyDates.addEventListener('click', function() {
    if (moneyDateFrom) moneyDateFrom.value = '';
    if (moneyDateTo) moneyDateTo.value = '';
    applyMoneyDateFilter();
  });
}

var searchClients = document.getElementById('searchClients');
if (searchClients) searchClients.addEventListener('input', renderClientsTable);

// ===================== EXPORT DROPDOWN =====================
var btnExportar = document.getElementById('btnExportar');
var exportMenu = document.getElementById('exportMenu');
if (btnExportar && exportMenu) {
  btnExportar.addEventListener('click', function(e) {
    e.stopPropagation();
    exportMenu.classList.toggle('is-open');
  });
  document.addEventListener('click', function() {
    exportMenu.classList.remove('is-open');
  });
  exportMenu.addEventListener('click', function(e) {
    e.stopPropagation();
  });
}

var btnExportCSV = document.getElementById('btnExportCSV');
if (btnExportCSV) {
  btnExportCSV.addEventListener('click', function() {
    if (packages.length === 0) {
      showToast('No hay datos para exportar');
      return;
    }
    var csv = 'Código,Estado,Remitente,Teléfono Rem.,DNI,Destinatario,Teléfono Dest.,Ciudad,Tipo,Comisión,Total,Fecha\n';
    packages.forEach(function(p) {
      csv += [p.id, p.status, p.sender.name, p.sender.phone, p.sender.doc, p.receiver.name, p.receiver.phone, p.destination, p.financial.type, p.financial.fee, p.financial.total, formatDate(p.date)].join(',') + '\n';
    });
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'epikaizo_datos_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Datos exportados a CSV');
    exportMenu.classList.remove('is-open');
  });
}

var btnPrint = document.getElementById('btnPrint');
if (btnPrint) {
  btnPrint.addEventListener('click', function() {
    if (packages.length === 0) {
      showToast('No hay datos para imprimir');
      return;
    }
    var win = window.open('', '_blank');
    var today = new Date();
    var html = '<!DOCTYPE html><html><head><title>Epikaizo - Justificante</title><style>body{font-family: Arial, sans-serif; padding: 40px; color: #08222C;} h1{font-size: 22px; margin-bottom: 4px;} p{margin: 0 0 16px; color: #666;} table{width:100%; border-collapse: collapse; margin-top: 24px;} th, td{border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 13px;} th{background: #f4fafc;}</style></head><body>';
    html += '<h1>Epikaizo — Justificante de Registros</h1>';
    html += '<p>Generado el ' + formatDate(today.toISOString()) + '</p>';
    html += '<table><thead><tr><th>Código</th><th>Estado</th><th>Remitente</th><th>Destinatario</th><th>Ciudad</th><th>Tipo</th><th>Comisión</th><th>Total</th><th>Fecha</th></tr></thead><tbody>';
    packages.forEach(function(p) {
      html += '<tr><td>' + p.id + '</td><td>' + getStatusText(p.status) + '</td><td>' + p.sender.name + '</td><td>' + p.receiver.name + '</td><td>' + p.destination + '</td><td>' + p.financial.type + '</td><td>' + formatMoney(p.financial.fee) + '</td><td>' + formatMoney(p.financial.total) + '</td><td>' + formatDate(p.date) + '</td></tr>';
    });
    html += '</tbody></table>';
    html += '<p style="margin-top:24px;">Documento generado desde el Panel de Control Epikaizo.</p>';
    html += '</body></html>';
    win.document.write(html);
    win.document.close();
    win.print();
    exportMenu.classList.remove('is-open');
  });
}

// ===================== SETTINGS =====================
var btnSaveSettings = document.getElementById('btnSaveSettings');
if (btnSaveSettings) {
  btnSaveSettings.addEventListener('click', function() {
    var settings = {
      companyName: document.getElementById('s_companyName').value,
      companyPhone: document.getElementById('s_companyPhone').value,
      companyEmail: document.getElementById('s_companyEmail').value,
      companyCity: document.getElementById('s_companyCity').value,
      feePkg: document.getElementById('s_feePkg').value,
      feeMoney: document.getElementById('s_feeMoney').value,
      feeDocs: document.getElementById('s_feeDocs').value,
      currency: document.getElementById('s_currency').value,
      companyAddress: document.getElementById('s_companyAddress').value,
      companyTaxId: document.getElementById('s_companyTaxId').value,
      contactPerson: document.getElementById('s_contactPerson').value,
      companyPhone2: document.getElementById('s_companyPhone2').value,
      notifEmail: document.getElementById('s_notifEmail').checked,
      notifSound: document.getElementById('s_notifSound').checked,
      notifDesktop: document.getElementById('s_notifDesktop').checked,
      notifAlerts: document.getElementById('s_notifAlerts').checked,
      language: document.getElementById('s_language').value,
      theme: document.getElementById('s_theme').value,
      pageSize: document.getElementById('s_pageSize').value,
      timezone: document.getElementById('s_timezone').value,
      backupFreq: document.getElementById('s_backupFreq').value,
      backupTime: document.getElementById('s_backupTime').value,
      backupRetention: document.getElementById('s_backupRetention').value,
      darkMode: document.getElementById('s_darkMode').checked,
      compactMode: document.getElementById('s_compactMode').checked,
      animations: document.getElementById('s_animations').checked,
      sidebarIcons: document.getElementById('s_sidebarIcons').checked,
      showKpis: document.getElementById('s_showKpis').checked,
      maskPhones: document.getElementById('s_maskPhones').checked,
      maskDocs: document.getElementById('s_maskDocs').checked,
      showFinancials: document.getElementById('s_showFinancials').checked,
      auditLog: document.getElementById('s_auditLog').checked,
      autoRefresh: document.getElementById('s_autoRefresh').checked,
      lazyLoad: document.getElementById('s_lazyLoad').checked,
      cacheEnabled: document.getElementById('s_cacheEnabled').checked,
      reduceMotion: document.getElementById('s_reduceMotion').checked,
      webhookUrl: document.getElementById('s_webhookUrl').value,
      apiKey: document.getElementById('s_apiKey').value,
      notifEmailAddr: document.getElementById('s_notifEmailAddr').value,
      alertPhone: document.getElementById('s_alertPhone').value,
      largeText: document.getElementById('s_largeText').checked,
      highContrast: document.getElementById('s_highContrast').checked,
      screenReader: document.getElementById('s_screenReader').checked,
      keyboardNav: document.getElementById('s_keyboardNav').checked
    };
    localStorage.setItem('epk_settings', JSON.stringify(settings));
    applySettings(settings);
    showToast('Configuración guardada correctamente');
  });
}

var btnResetSettings = document.getElementById('btnResetSettings');
if (btnResetSettings) {
  btnResetSettings.addEventListener('click', function() {
    if (confirm('¿Restaurar configuración a valores por defecto?')) {
      localStorage.removeItem('epk_settings');
      location.reload();
    }
  });
}

var btnClearData = document.getElementById('btnClearData');
if (btnClearData) {
  btnClearData.addEventListener('click', function() {
    if (confirm('¿Estás seguro de que deseas borrar TODOS los datos? Esta acción no se puede deshacer.')) {
      packages = [];
      savePackages(packages);
      refreshAllData();
      showToast('Todos los datos han sido borrados');
    }
  });
}

function applySettings(settings) {
  if (!settings) {
    try {
      var data = localStorage.getItem('epk_settings');
      if (data) settings = JSON.parse(data);
    } catch(e) { return; }
  }
  if (!settings) return;
  var body = document.body;
  body.classList.toggle('theme-dark', !!settings.darkMode);
  body.classList.toggle('compact-mode', !!settings.compactMode);
  body.classList.toggle('reduce-motion', !!settings.reduceMotion);
  body.classList.toggle('large-text', !!settings.largeText);
  body.classList.toggle('high-contrast', !!settings.highContrast);
  body.classList.toggle('keyboard-nav', !!settings.keyboardNav);
  body.classList.toggle('sidebar--icons', !!settings.sidebarIcons);
  body.classList.toggle('hide-kpis', !settings.showKpis);
  body.classList.toggle('mask-phones', !!settings.maskPhones);
  body.classList.toggle('mask-docs', !!settings.maskDocs);
  body.classList.toggle('hide-financials', !settings.showFinancials);
  body.classList.toggle('no-animations', !settings.animations);

  var sidebar = document.getElementById('sidebar');
  if (sidebar) {
    if (settings.sidebarIcons) sidebar.classList.add('sidebar--icons');
    else sidebar.classList.remove('sidebar--icons');
  }

  if (settings.auditLog) {
    enableAuditLog();
  } else {
    disableAuditLog();
  }

  if (settings.autoRefresh) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }

  if (settings.lazyLoad) {
    enableLazyLoad();
  } else {
    disableLazyLoad();
  }
}

function getSettings() {
  try {
    var data = localStorage.getItem('epk_settings');
    return data ? JSON.parse(data) : {};
  } catch(e) { return {}; }
}

// ===================== TOOLTIPS =====================
function setupTooltips() {
  var links = document.querySelectorAll('.sidebar__nav a[data-tab]');
  links.forEach(function(link) {
    var text = link.textContent.trim();
    if (text && !link.getAttribute('title')) {
      link.setAttribute('title', text);
      link.classList.add('nav-tooltip');
      link.setAttribute('data-tooltip', text);
    }
  });
  var tooltipMap = {
    'stat-income': 'Facturación total del periodo seleccionado.',
    'stat-ops': 'Cantidad total de operaciones en el periodo.',
    'stat-cars': 'Vehículos marcados como vendidos.',
    'stat-orders': 'Pedidos/órdenes que no están cancelados.',
    'stat-active-services': 'Servicios pendientes, en proceso o en tránsito.',
    'stat-finished-services': 'Servicios entregados, completados o recibidos.',
    'stat-success-rate': 'Porcentaje de servicios finalizados sobre el total.',
    'stat-avg-ticket': 'Ingreso promedio por operación en el periodo.',
    'stat-pending-payments': 'Monto total de servicios pendientes de cobro.'
  };
  Object.keys(tooltipMap).forEach(function(id) {
    var el = document.getElementById(id);
    if (el && !el.getAttribute('title')) el.setAttribute('title', tooltipMap[id]);
  });
}

// ===================== GLOBAL SEARCH =====================
function setupGlobalSearch() {
  var searchInput = document.getElementById('globalSearch');
  var results = document.getElementById('globalSearchResults');
  if (!searchInput || !results) return;

  function performSearch(term) {
    if (!term) {
      results.classList.remove('is-open');
      results.innerHTML = '';
      return;
    }
    var lower = term.toLowerCase();
    var matches = [];
    var clients = getClients ? getClients() : [];
    clients.forEach(function(c) {
      var text = (c.name + ' ' + (c.phone || '') + ' ' + (c.email || '')).toLowerCase();
      if (text.indexOf(lower) !== -1) matches.push({ label: c.name, sub: c.phone || '', action: 'client', key: c.name + '|' + (c.phone || '') });
    });
    packages.forEach(function(p) {
      var text = ((p.client && p.client.name || '') + ' ' + (p.id || '') + ' ' + (p.label || '')).toLowerCase();
      if (text.indexOf(lower) !== -1) matches.push({ label: p.id, sub: (p.client && p.client.name || '') + ' · ' + (p.label || ''), action: 'package', id: p.id });
    });
    if (matches.length === 0) {
      results.innerHTML = '<div class="global-search__empty">Sin resultados para "' + term + '"</div>';
    } else {
      results.innerHTML = matches.slice(0, 10).map(function(m) {
        return '<div class="global-search__item" data-action="' + m.action + '" data-key="' + (m.key || '') + '" data-id="' + (m.id || '') + '"><strong>' + escapeHtml(m.label) + '</strong><span>' + escapeHtml(m.sub) + '</span></div>';
      }).join('');
    }
    results.classList.add('is-open');
  }

  searchInput.addEventListener('input', function() {
    performSearch(searchInput.value.trim());
  });

  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      var first = results.querySelector('.global-search__item');
      if (first) {
        var action = first.getAttribute('data-action');
        var key = first.getAttribute('data-key');
        var id = first.getAttribute('data-id');
        if (action === 'client') openClientDetail(key);
        if (action === 'package') switchTab('tab-packages');
        results.classList.remove('is-open');
        searchInput.value = '';
      }
    }
  });

  results.addEventListener('click', function(e) {
    var item = e.target.closest('.global-search__item');
    if (!item) return;
    var action = item.getAttribute('data-action');
    var key = item.getAttribute('data-key');
    var id = item.getAttribute('data-id');
    if (action === 'client') openClientDetail(key);
    if (action === 'package') switchTab('tab-packages');
    results.classList.remove('is-open');
    searchInput.value = '';
  });

  document.addEventListener('click', function(e) {
    if (!searchInput.contains(e.target) && !results.contains(e.target)) {
      results.classList.remove('is-open');
    }
  });
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

if (typeof getClients !== 'function') {
  window.getClients = function() {
    var map = {};
    packages.forEach(function(svc) {
      if (!svc.client || !svc.client.name) return;
      var key = svc.client.name + '|' + (svc.client.phone || '');
      if (!map[key]) map[key] = { name: svc.client.name, phone: svc.client.phone || '', email: (svc.client && svc.client.email) || '' };
    });
    return Object.values(map);
  };
}

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    var input = document.getElementById('globalSearch');
    if (input) {
      input.focus();
      input.select();
    }
  }
});

// ===================== AUDIT LOG =====================
var auditLogEnabled = false;
var auditLogInterval = null;

function enableAuditLog() {
  if (auditLogEnabled) return;
  auditLogEnabled = true;
  auditLogInterval = setInterval(function() {
    var log = localStorage.getItem('epk_audit_log') || '[]';
    var entries = JSON.parse(log);
    var now = new Date().toISOString();
    entries.unshift({ time: now, action: 'auto-snapshot', data: { packages: packages.length, cars: cars.length, leads: leads.length, orders: orders.length } });
    if (entries.length > 50) entries = entries.slice(0, 50);
    localStorage.setItem('epk_audit_log', JSON.stringify(entries));
  }, 60000);
}

function disableAuditLog() {
  auditLogEnabled = false;
  if (auditLogInterval) clearInterval(auditLogInterval);
}

function addAuditEntry(action, details) {
  var settings = getSettings();
  if (!settings.auditLog) return;
  var log = localStorage.getItem('epk_audit_log') || '[]';
  var entries = JSON.parse(log);
  entries.unshift({ time: new Date().toISOString(), action: action, details: details });
  if (entries.length > 200) entries = entries.slice(0, 200);
  localStorage.setItem('epk_audit_log', JSON.stringify(entries));
}

// ===================== AUTO REFRESH =====================
var autoRefreshInterval = null;

function startAutoRefresh() {
  if (autoRefreshInterval) return;
  autoRefreshInterval = setInterval(function() {
    refreshAllData();
  }, 30000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// ===================== LAZY LOAD =====================
var lazyLoadEnabled = false;
var chartsLoaded = false;

function enableLazyLoad() {
  lazyLoadEnabled = true;
  if (!chartsLoaded) {
    chartsLoaded = true;
    renderCharts();
  }
}

function disableLazyLoad() {
  lazyLoadEnabled = false;
}

// ===================== SETTINGS SAVE / LOAD =====================
var btnSaveSettings = document.getElementById('btnSaveSettings');
if (btnSaveSettings) {
  btnSaveSettings.addEventListener('click', function() {
    var settings = {
      companyName: document.getElementById('s_companyName').value,
      companyPhone: document.getElementById('s_companyPhone').value,
      companyEmail: document.getElementById('s_companyEmail').value,
      companyCity: document.getElementById('s_companyCity').value,
      feePkg: document.getElementById('s_feePkg').value,
      feeMoney: document.getElementById('s_feeMoney').value,
      feeDocs: document.getElementById('s_feeDocs').value,
      currency: document.getElementById('s_currency').value,
      companyAddress: document.getElementById('s_companyAddress').value,
      companyTaxId: document.getElementById('s_companyTaxId').value,
      contactPerson: document.getElementById('s_contactPerson').value,
      companyPhone2: document.getElementById('s_companyPhone2').value,
      notifEmail: document.getElementById('s_notifEmail').checked,
      notifSound: document.getElementById('s_notifSound').checked,
      notifDesktop: document.getElementById('s_notifDesktop').checked,
      notifAlerts: document.getElementById('s_notifAlerts').checked,
      language: document.getElementById('s_language').value,
      theme: document.getElementById('s_theme').value,
      pageSize: document.getElementById('s_pageSize').value,
      timezone: document.getElementById('s_timezone').value,
      backupFreq: document.getElementById('s_backupFreq').value,
      backupTime: document.getElementById('s_backupTime').value,
      backupRetention: document.getElementById('s_backupRetention').value,
      darkMode: document.getElementById('s_darkMode').checked,
      compactMode: document.getElementById('s_compactMode').checked,
      animations: document.getElementById('s_animations').checked,
      sidebarIcons: document.getElementById('s_sidebarIcons').checked,
      showKpis: document.getElementById('s_showKpis').checked,
      maskPhones: document.getElementById('s_maskPhones').checked,
      maskDocs: document.getElementById('s_maskDocs').checked,
      showFinancials: document.getElementById('s_showFinancials').checked,
      auditLog: document.getElementById('s_auditLog').checked,
      autoRefresh: document.getElementById('s_autoRefresh').checked,
      lazyLoad: document.getElementById('s_lazyLoad').checked,
      cacheEnabled: document.getElementById('s_cacheEnabled').checked,
      reduceMotion: document.getElementById('s_reduceMotion').checked,
      webhookUrl: document.getElementById('s_webhookUrl').value,
      apiKey: document.getElementById('s_apiKey').value,
      notifEmailAddr: document.getElementById('s_notifEmailAddr').value,
      alertPhone: document.getElementById('s_alertPhone').value,
      largeText: document.getElementById('s_largeText').checked,
      highContrast: document.getElementById('s_highContrast').checked,
      screenReader: document.getElementById('s_screenReader').checked,
      keyboardNav: document.getElementById('s_keyboardNav').checked
    };
    localStorage.setItem('epk_settings', JSON.stringify(settings));
    applySettings(settings);
    addAuditEntry('settings_saved', { keys: Object.keys(settings).join(',') });
    showToast('Configuración guardada correctamente');
  });
}

var btnResetSettings = document.getElementById('btnResetSettings');
if (btnResetSettings) {
  btnResetSettings.addEventListener('click', function() {
    if (confirm('¿Restaurar configuración a valores por defecto?')) {
      localStorage.removeItem('epk_settings');
      location.reload();
    }
  });
}

var btnClearData = document.getElementById('btnClearData');
if (btnClearData) {
  btnClearData.addEventListener('click', function() {
    if (confirm('¿Estás seguro de que deseas borrar TODOS los datos? Esta acción no se puede deshacer.')) {
      packages = [];
      savePackages(packages);
      refreshAllData();
      showToast('Todos los datos han sido borrados');
    }
  });
}

// ===================== SERVICE CATALOG UI =====================
function renderCatalogTable() {
  var tbody = document.getElementById('catalogTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  var items = serviceCatalog.slice().reverse();
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>No hay servicios en el catálogo.</p></td></tr>';
    return;
  }
  items.forEach(function(s) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="person-name">' + s.nombre_servicio + '</span>' + (s.descripcion ? '<br/><span class="person-sub">' + s.descripcion + '</span>' : '') + '</td>' +
      '<td>' + formatMoney(s.precio_base || 0) + '</td>' +
      '<td><span class="status status--' + (s.activo !== false ? 'entregado' : 'transito') + '">' + (s.activo !== false ? 'Activo' : 'Inactivo') + '</span></td>' +
      '<td><button class="btn btn--secondary btn--sm btn-toggle-catalog" data-id="' + s.id + '">' + (s.activo !== false ? 'Desactivar' : 'Activar') + '</button> <button class="btn btn--danger btn--sm btn-delete-catalog" data-id="' + s.id + '">Eliminar</button></td>';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-toggle-catalog').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var id = btn.getAttribute('data-id');
      var svc = serviceCatalog.find(function(s) { return s.id === id; });
      if (!svc) return;
      svc.activo = svc.activo === false ? true : false;
      saveServiceCatalog(serviceCatalog);
      updateInApi('services', id, { activo: svc.activo }).catch(function() {});
      renderCatalogTable();
      populateServiceCatalogSelect();
      showToast('Servicio ' + svc.nombre_servicio + ' ' + (svc.activo ? 'activado' : 'desactivado'));
    });
  });
  tbody.querySelectorAll('.btn-delete-catalog').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var id = btn.getAttribute('data-id');
      if (confirm('¿Eliminar este servicio del catálogo?')) {
        removeServiceFromCatalog(id).then(function() {
          renderCatalogTable();
          populateServiceCatalogSelect();
          showToast('Servicio eliminado del catálogo');
        });
      }
    });
  });
}

var btnAddCatalogService = document.getElementById('btnAddCatalogService');
if (btnAddCatalogService) {
  btnAddCatalogService.addEventListener('click', function() {
    var name = document.getElementById('s_serviceName').value.trim();
    if (!name) { showToast('Escribe el nombre del servicio'); return; }
    var price = parseFloat(document.getElementById('s_servicePrice').value) || 0;
    var desc = document.getElementById('s_serviceDesc').value.trim();
    var svc = {
      nombre_servicio: name,
      descripcion: desc,
      precio_base: price,
      activo: true
    };
    addServiceToCatalog(svc).then(function() {
      document.getElementById('s_serviceName').value = '';
      document.getElementById('s_servicePrice').value = '0';
      document.getElementById('s_serviceDesc').value = '';
      renderCatalogTable();
      populateServiceCatalogSelect();
      showToast('Servicio añadido al catálogo');
    });
  });
}

// Load saved settings
function loadSettings() {
  try {
    var data = localStorage.getItem('epk_settings');
    if (data) {
      var s = JSON.parse(data);
      if (s.companyName) document.getElementById('s_companyName').value = s.companyName;
      if (s.companyPhone) document.getElementById('s_companyPhone').value = s.companyPhone;
      if (s.companyEmail) document.getElementById('s_companyEmail').value = s.companyEmail;
      if (s.companyCity) document.getElementById('s_companyCity').value = s.companyCity;
      if (s.feePkg) document.getElementById('s_feePkg').value = s.feePkg;
      if (s.feeMoney) document.getElementById('s_feeMoney').value = s.feeMoney;
      if (s.feeDocs) document.getElementById('s_feeDocs').value = s.feeDocs;
      if (s.currency) document.getElementById('s_currency').value = s.currency;
      if (s.companyAddress) document.getElementById('s_companyAddress').value = s.companyAddress;
      if (s.companyTaxId) document.getElementById('s_companyTaxId').value = s.companyTaxId;
      if (s.contactPerson) document.getElementById('s_contactPerson').value = s.contactPerson;
      if (s.companyPhone2) document.getElementById('s_companyPhone2').value = s.companyPhone2;
      if (s.notifEmail !== undefined) document.getElementById('s_notifEmail').checked = s.notifEmail;
      if (s.notifSound !== undefined) document.getElementById('s_notifSound').checked = s.notifSound;
      if (s.notifDesktop !== undefined) document.getElementById('s_notifDesktop').checked = s.notifDesktop;
      if (s.notifAlerts !== undefined) document.getElementById('s_notifAlerts').checked = s.notifAlerts;
      if (s.language) document.getElementById('s_language').value = s.language;
      if (s.theme) document.getElementById('s_theme').value = s.theme;
      if (s.pageSize) document.getElementById('s_pageSize').value = s.pageSize;
      if (s.timezone) document.getElementById('s_timezone').value = s.timezone;
      if (s.backupFreq) document.getElementById('s_backupFreq').value = s.backupFreq;
      if (s.backupTime) document.getElementById('s_backupTime').value = s.backupTime;
      if (s.backupRetention) document.getElementById('s_backupRetention').value = s.backupRetention;
      if (s.darkMode !== undefined) document.getElementById('s_darkMode').checked = s.darkMode;
      if (s.compactMode !== undefined) document.getElementById('s_compactMode').checked = s.compactMode;
      if (s.animations !== undefined) document.getElementById('s_animations').checked = s.animations;
      if (s.sidebarIcons !== undefined) document.getElementById('s_sidebarIcons').checked = s.sidebarIcons;
      if (s.showKpis !== undefined) document.getElementById('s_showKpis').checked = s.showKpis;
      if (s.maskPhones !== undefined) document.getElementById('s_maskPhones').checked = s.maskPhones;
      if (s.maskDocs !== undefined) document.getElementById('s_maskDocs').checked = s.maskDocs;
      if (s.showFinancials !== undefined) document.getElementById('s_showFinancials').checked = s.showFinancials;
      if (s.auditLog !== undefined) document.getElementById('s_auditLog').checked = s.auditLog;
      if (s.autoRefresh !== undefined) document.getElementById('s_autoRefresh').checked = s.autoRefresh;
      if (s.lazyLoad !== undefined) document.getElementById('s_lazyLoad').checked = s.lazyLoad;
      if (s.cacheEnabled !== undefined) document.getElementById('s_cacheEnabled').checked = s.cacheEnabled;
      if (s.reduceMotion !== undefined) document.getElementById('s_reduceMotion').checked = s.reduceMotion;
      if (s.webhookUrl) document.getElementById('s_webhookUrl').value = s.webhookUrl;
      if (s.apiKey) document.getElementById('s_apiKey').value = s.apiKey;
      if (s.notifEmailAddr) document.getElementById('s_notifEmailAddr').value = s.notifEmailAddr;
      if (s.alertPhone) document.getElementById('s_alertPhone').value = s.alertPhone;
      if (s.largeText !== undefined) document.getElementById('s_largeText').checked = s.largeText;
      if (s.highContrast !== undefined) document.getElementById('s_highContrast').checked = s.highContrast;
      if (s.screenReader !== undefined) document.getElementById('s_screenReader').checked = s.screenReader;
      if (s.keyboardNav !== undefined) document.getElementById('s_keyboardNav').checked = s.keyboardNav;
      applySettings(s);
    }
  } catch(e) {}
}

// ===================== REFRESH ALL =====================
function refreshAllData() {
  calculateOverviewKPIs();
  renderOverviewTable(packages);
  renderPackagesTable();
  renderMoneyTable();
  renderClientsTable();
  renderDeliveriesTable();
  renderFinanceTable();
  renderReportsTable();
  renderMessages();
  refreshCarData();
}

// ===================== CAR DEALERSHIP DATA STORE =====================
function loadCars() {
  try {
    var data = localStorage.getItem('epk_cars');
    return data ? JSON.parse(data) : [];
  } catch(e) { return []; }
}
function saveCars(arr) {
  localStorage.setItem('epk_cars', JSON.stringify(arr));
}
var cars = loadCars();

function loadLeads() {
  try {
    var data = localStorage.getItem('epk_leads');
    return data ? JSON.parse(data) : [];
  } catch(e) { return []; }
}
function saveLeads(arr) {
  localStorage.setItem('epk_leads', JSON.stringify(arr));
}
var leads = loadLeads();

function loadTasks() {
  try {
    var data = localStorage.getItem('epk_tasks');
    return data ? JSON.parse(data) : [];
  } catch(e) { return []; }
}
function saveTasks(arr) {
  localStorage.setItem('epk_tasks', JSON.stringify(arr));
}
var tasks = loadTasks();

// ===================== DEMO DATA =====================
function seedDemoData() {
  if (cars.length > 0) return;

  var demoCars = [
    { id: 'CAR-001', brand: 'Toyota', model: 'Corolla', year: 2022, plate: '1234ABC', km: 25000, cost: 18000, price: 22000, status: 'disponible', date: new Date(Date.now() - 10*24*60*60*1000).toISOString() },
    { id: 'CAR-002', brand: 'Volkswagen', model: 'Golf', year: 2021, plate: '5678DEF', km: 35000, cost: 20000, price: 25000, status: 'disponible', date: new Date(Date.now() - 5*24*60*60*1000).toISOString() },
    { id: 'CAR-003', brand: 'BMW', model: 'Serie 3', year: 2023, plate: '9012GHI', km: 10000, cost: 35000, price: 42000, status: 'reservado', date: new Date(Date.now() - 45*24*60*60*1000).toISOString() },
    { id: 'CAR-004', brand: 'Mercedes', model: 'Clase A', year: 2020, plate: '3456JKL', km: 55000, cost: 25000, price: 30000, status: 'disponible', date: new Date(Date.now() - 80*24*60*60*1000).toISOString() },
    { id: 'CAR-005', brand: 'Audi', model: 'A4', year: 2022, plate: '7890MNO', km: 20000, cost: 30000, price: 36000, status: 'taller', date: new Date(Date.now() - 3*24*60*60*1000).toISOString() },
    { id: 'CAR-006', brand: 'Ford', model: 'Focus', year: 2019, plate: '2345PQR', km: 65000, cost: 14000, price: 18000, status: 'vendido', date: new Date(Date.now() - 60*24*60*60*1000).toISOString() }
  ];
  saveCars(demoCars);

  var demoLeads = [
    { id: 'LEAD-001', name: 'Juan García', phone: '600111222', email: 'juan@mail.com', channel: 'Web', notes: 'Interesado en SUV', stage: 'nuevo', carId: '' },
    { id: 'LEAD-002', name: 'María López', phone: '600333444', email: 'maria@mail.com', channel: 'Redes Sociales', notes: 'Busca coche familiar', stage: 'contactado', carId: 'CAR-001' },
    { id: 'LEAD-003', name: 'Pedro Martínez', phone: '600555666', email: 'pedro@mail.com', channel: 'Clasificados', notes: 'Presupuesto 25k', stage: 'visita', carId: 'CAR-002' },
    { id: 'LEAD-004', name: 'Ana Sánchez', phone: '600777888', email: 'ana@mail.com', channel: 'Recomendación', notes: 'Financiación necesaria', stage: 'financiacion', carId: 'CAR-003' },
    { id: 'LEAD-005', name: 'Carlos Ruiz', phone: '600999000', email: 'carlos@mail.com', channel: 'Recurrente', notes: 'Ya ha comprado antes', stage: 'cerrado', carId: 'CAR-006' }
  ];
  saveLeads(demoLeads);

  var demoTasks = [
    { id: 'TSK-001', type: 'Prueba de conducción', client: 'Pedro Martínez', car: 'Volkswagen Golf - 5678DEF', date: new Date(Date.now() + 2*24*60*60*1000).toISOString(), status: 'pendiente' },
    { id: 'TSK-002', type: 'Seguimiento', client: 'Juan García', car: '', date: new Date(Date.now() + 1*24*60*60*1000).toISOString(), status: 'pendiente' },
    { id: 'TSK-003', type: 'Documentación', client: 'Ana Sánchez', car: 'BMW Serie 3 - 9012GHI', date: new Date(Date.now() - 1*24*60*60*1000).toISOString(), status: 'pendiente' },
    { id: 'TSK-004', type: 'Prueba de conducción', client: 'María López', car: 'Toyota Corolla - 1234ABC', date: new Date(Date.now() - 5*24*60*60*1000).toISOString(), status: 'completada' }
  ];
  saveTasks(demoTasks);
}
seedDemoData();

// ===================== CAR UTILITIES =====================
function formatCarPrice(num) {
  return Number(num).toLocaleString('es-ES') + ' €';
}
function getCarStatusText(status) {
  var map = { 'disponible': 'Disponible', 'reservado': 'Reservado', 'vendido': 'Vendido', 'taller': 'En Taller' };
  return map[status] || status;
}
function getDaysInStock(dateStr) {
  var d = new Date(dateStr);
  var now = new Date();
  return Math.floor((now - d) / (1000 * 60 * 60 * 24));
}

// ===================== RENDER CARS TABLE =====================
function renderCarsTable() {
  var tbody = document.getElementById('carsTableBody');
  if (!tbody) return;
  var statusFilter = document.getElementById('filterCarStatus');
  var searchCar = document.getElementById('searchCar');
  var filtered = cars.slice();

  if (statusFilter && statusFilter.value !== 'all') {
    filtered = filtered.filter(function(c) { return c.status === statusFilter.value; });
  }
  if (searchCar && searchCar.value.trim()) {
    var term = searchCar.value.toLowerCase();
    filtered = filtered.filter(function(c) {
      return c.model.toLowerCase().indexOf(term) !== -1 ||
        c.plate.toLowerCase().indexOf(term) !== -1 ||
        c.brand.toLowerCase().indexOf(term) !== -1;
    });
  }

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><p>No hay vehículos registrados.</p></td></tr>';
    return;
  }

  filtered.forEach(function(car) {
    var days = getDaysInStock(car.date);
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="person-name">' + car.brand + ' ' + car.model + '</span></td>' +
      '<td><span class="code">' + car.plate + '</span></td>' +
      '<td>' + car.year + '</td>' +
      '<td>' + car.km.toLocaleString('es-ES') + ' km</td>' +
      '<td>' + formatCarPrice(car.cost) + '</td>' +
      '<td><strong>' + formatCarPrice(car.price) + '</strong></td>' +
      '<td><span class="status status--' + car.status + '">' + getCarStatusText(car.status) + '</span></td>' +
      '<td>' + days + ' días</td>' +
      '<td><button class="btn btn--secondary btn--sm btn-car-status" data-id="' + car.id + '">Estado</button> <button class="btn btn--danger btn--sm btn-car-delete" data-id="' + car.id + '">X</button></td>';
    tbody.appendChild(tr);
  });

  // Attach car action buttons
  var statusBtns = tbody.querySelectorAll('.btn-car-status');
  statusBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var carId = btn.getAttribute('data-id');
      var car = cars.find(function(c) { return c.id === carId; });
      if (!car) return;
      var cycle = ['disponible', 'reservado', 'vendido', 'taller'];
      var idx = cycle.indexOf(car.status);
      car.status = cycle[(idx + 1) % cycle.length];
      saveCars(cars);
      refreshCarData();
      showToast(car.id + ' → ' + getCarStatusText(car.status));
    });
  });
  var deleteBtns = tbody.querySelectorAll('.btn-car-delete');
  deleteBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var carId = btn.getAttribute('data-id');
      if (confirm('¿Seguro que deseas eliminar el vehículo ' + carId + '?')) {
        cars = cars.filter(function(c) { return c.id !== carId; });
        saveCars(cars);
        refreshCarData();
        showToast('Vehículo ' + carId + ' eliminado');
      }
    });
  });
}

// ===================== RENDER ALERTS =====================
function renderAlerts() {
  var container = document.getElementById('alertsContainer');
  if (!container) return;
  container.innerHTML = '';
  var alerts = [];
  cars.forEach(function(car) {
    if (car.status === 'disponible' || car.status === 'reservado') {
      var days = getDaysInStock(car.date);
      if (days >= 90) {
        alerts.push({ type: 'danger', car: car, days: days });
      } else if (days >= 60) {
        alerts.push({ type: 'warning', car: car, days: days });
      }
    }
  });

  if (alerts.length === 0) {
    container.innerHTML = '<p style="color:var(--texto-suave);font-size:14px;">No hay alertas de inmovilización actualmente.</p>';
    return;
  }

  alerts.forEach(function(a) {
    var div = document.createElement('div');
    div.className = 'alert-box alert-box--' + a.type;
    div.innerHTML = (a.type === 'danger' ?
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' :
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>') +
      '<span><strong>' + a.car.brand + ' ' + a.car.model + '</strong> (' + a.car.plate + ') lleva <strong>' + a.days + ' días</strong> en stock.</span>';
    container.appendChild(div);
  });
}

// ===================== RENDER PIPELINE =====================
function renderPipeline() {
  var stages = ['nuevo', 'contactado', 'visita', 'financiacion', 'cerrado'];
  stages.forEach(function(stage) {
    var container = document.getElementById('stage-' + stage);
    if (!container) return;
    container.innerHTML = '';
    var stageLeads = leads.filter(function(l) { return l.stage === stage; });
    stageLeads.forEach(function(lead) {
      var card = document.createElement('div');
      card.className = 'pipeline-card';
      var carInfo = lead.carId ? (function() {
        var c = cars.find(function(car) { return car.id === lead.carId; });
        return c ? c.brand + ' ' + c.model : '';
      })() : '';
      card.innerHTML =
        '<span class="pipeline-card__name">' + lead.name + '</span>' +
        '<span class="pipeline-card__detail">' + lead.phone + '</span>' +
        '<span class="pipeline-card__detail">' + lead.channel + '</span>' +
        (carInfo ? '<span class="pipeline-card__detail" style="font-weight:600;color:var(--azul-oceano);">' + carInfo + '</span>' : '') +
        '<div class="pipeline-card__actions">' +
          '<button class="btn-prev" data-id="' + lead.id + '">←</button>' +
          '<button class="btn-next" data-id="' + lead.id + '">→</button>' +
        '</div>';
      container.appendChild(card);
    });

    // Attach pipeline navigation
    container.querySelectorAll('.btn-prev').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var lid = btn.getAttribute('data-id');
        var lead = leads.find(function(l) { return l.id === lid; });
        if (!lead) return;
        var idx = stages.indexOf(lead.stage);
        if (idx > 0) {
          lead.stage = stages[idx - 1];
          saveLeads(leads);
          refreshCarData();
        }
      });
    });
    container.querySelectorAll('.btn-next').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var lid = btn.getAttribute('data-id');
        var lead = leads.find(function(l) { return l.id === lid; });
        if (!lead) return;
        var idx = stages.indexOf(lead.stage);
        if (idx < stages.length - 1) {
          lead.stage = stages[idx + 1];
          saveLeads(leads);
          refreshCarData();
        }
      });
    });
  });
}

// ===================== RENDER TASKS =====================
function renderTasks() {
  var tbody = document.getElementById('tasksTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (tasks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No hay tareas registradas.</p></td></tr>';
    return;
  }
  tasks.slice().reverse().forEach(function(task) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="status status--transito">' + task.type + '</span></td>' +
      '<td><span class="person-name">' + task.client + '</span></td>' +
      '<td>' + (task.car || '-') + '</td>' +
      '<td>' + formatDate(task.date) + '</td>' +
      '<td><span class="status status--' + (task.status === 'completada' ? 'entregado' : 'transito') + '">' + (task.status === 'completada' ? 'Completada' : 'Pendiente') + '</span></td>' +
      '<td>' + (task.status !== 'completada' ? '<button class="btn btn--primary btn--sm btn-task-done" data-id="' + task.id + '">Completar</button>' : '<span style="color:var(--verde);font-weight:600;">OK</span>') + '</td>';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-task-done').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tid = btn.getAttribute('data-id');
      var task = tasks.find(function(t) { return t.id === tid; });
      if (task) {
        task.status = 'completada';
        saveTasks(tasks);
        refreshCarData();
        showToast('Tarea ' + tid + ' completada');
      }
    });
  });
}

// ===================== RENDER ANALYTICS =====================
function renderAnalytics() {
  // Models chart
  var chartModels = document.getElementById('chartModels');
  if (chartModels) {
    var modelCounts = {};
    leads.forEach(function(l) {
      var key = l.channel || 'Otros';
      modelCounts[key] = (modelCounts[key] || 0) + 1;
    });
    var total = leads.length || 1;
    var html = '<div class="channel-list">';
    Object.keys(modelCounts).sort(function(a, b) { return modelCounts[b] - modelCounts[a]; }).forEach(function(ch) {
      var pct = Math.round((modelCounts[ch] / total) * 100);
      html += '<div class="channel-item"><span class="channel-item__name"><span class="channel-dot" style="background:var(--azul-oceano);"></span>' + ch + '</span><span class="channel-item__count">' + modelCounts[ch] + ' (' + pct + '%)</span></div>';
    });
    html += '</div>';
    chartModels.innerHTML = html;
  }

  // Salespeople performance
  var chartSales = document.getElementById('chartSalespeople');
  if (chartSales) {
    var salesMap = {};
    leads.forEach(function(l) {
      if (l.stage === 'cerrado') {
        var name = l.name.split(' ')[0];
        salesMap[name] = (salesMap[name] || 0) + 1;
      }
    });
    var maxSales = Math.max.apply(null, Object.values(salesMap)) || 1;
    var html = '<div class="bar-chart">';
    Object.keys(salesMap).sort(function(a, b) { return salesMap[b] - salesMap[a]; }).forEach(function(name) {
      var pct = (salesMap[name] / maxSales) * 100;
      html += '<div class="bar-row"><span class="bar-label">' + name + '</span><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;"></div></div><span class="bar-value">' + salesMap[name] + '</span></div>';
    });
    html += '</div>';
    chartSales.innerHTML = html || '<p style="color:var(--texto-suave);font-size:14px;">Sin datos de ventas aún.</p>';
  }

  // Channels chart
  var chartChannels = document.getElementById('chartChannels');
  if (chartChannels) {
    var channelCounts = {};
    var colors = { 'Web': '#0B6E99', 'Redes Sociales': '#3FC1C9', 'Clasificados': '#F2A65A', 'Recomendación': '#2ecc71', 'Recurrente': '#9b59b6' };
    leads.forEach(function(l) {
      channelCounts[l.channel] = (channelCounts[l.channel] || 0) + 1;
    });
    var totalLeads = leads.length || 1;
    var html = '<div class="bar-chart">';
    Object.keys(channelCounts).sort(function(a, b) { return channelCounts[b] - channelCounts[a]; }).forEach(function(ch) {
      var pct = Math.round((channelCounts[ch] / totalLeads) * 100);
      var color = colors[ch] || '#0B6E99';
      html += '<div class="bar-row"><span class="bar-label">' + ch + '</span><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div><span class="bar-value">' + channelCounts[ch] + '</span></div>';
    });
    html += '</div>';
    chartChannels.innerHTML = html;
  }
}

// ===================== CAR KPIs =====================
function calculateCarKPIs() {
  var today = new Date();
  var startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  var stock = cars.filter(function(c) { return c.status === 'disponible' || c.status === 'reservado'; }).length;
  var soldThisMonth = cars.filter(function(c) { return c.status === 'vendido' && c.date && new Date(c.date) >= startOfMonth; }).length;
  var revenue = cars.filter(function(c) { return c.status === 'vendido' && c.date && new Date(c.date) >= startOfMonth; }).reduce(function(s, c) { return s + Number(c.price); }, 0);
  var activeLeads = leads.filter(function(l) { return l.stage !== 'cerrado'; }).length;

  var elStock = document.getElementById('kpi-stock');
  var elMonth = document.getElementById('kpi-cars-month');
  var elRevenue = document.getElementById('kpi-cars-revenue');
  var elLeads = document.getElementById('kpi-leads');

  if (elStock) elStock.textContent = stock;
  if (elMonth) elMonth.textContent = soldThisMonth;
  if (elRevenue) elRevenue.textContent = formatCarPrice(revenue);
  if (elLeads) elLeads.textContent = activeLeads;
}

// ===================== EVENT LISTENERS =====================
// Register car button
var btnRegisterCar = document.getElementById('btnRegisterCar');
var modalCarOverlay = document.getElementById('modalCarOverlay');
var btnCloseCarModal = document.getElementById('btnCloseCarModal');

if (btnRegisterCar && modalCarOverlay) {
  btnRegisterCar.addEventListener('click', function() { modalCarOverlay.classList.add('is-open'); });
}
if (btnCloseCarModal && modalCarOverlay) {
  btnCloseCarModal.addEventListener('click', function() { modalCarOverlay.classList.remove('is-open'); });
}
if (modalCarOverlay) {
  modalCarOverlay.addEventListener('click', function(e) {
    if (e.target === modalCarOverlay) modalCarOverlay.classList.remove('is-open');
  });
}

// Form new car
var formNewCar = document.getElementById('formNewCar');
if (formNewCar) {
  formNewCar.addEventListener('submit', function(e) {
    e.preventDefault();
    var newCar = {
      id: 'CAR-' + Math.floor(100 + Math.random() * 900),
      brand: document.getElementById('f_carBrand').value.trim(),
      model: document.getElementById('f_carModel').value.trim(),
      year: parseInt(document.getElementById('f_carYear').value),
      plate: document.getElementById('f_carPlate').value.trim().toUpperCase(),
      km: parseInt(document.getElementById('f_carKm').value),
      cost: parseFloat(document.getElementById('f_carCost').value),
      price: parseFloat(document.getElementById('f_carPrice').value),
      status: document.getElementById('f_carStatus').value,
      date: new Date().toISOString()
    };
    cars.push(newCar);
    saveCars(cars);
    modalCarOverlay.classList.remove('is-open');
    formNewCar.reset();
    refreshCarData();
    showToast('Vehículo ' + newCar.id + ' registrado correctamente');
  });
}

// Add lead button
var btnAddLead = document.getElementById('btnAddLead');
var modalLeadOverlay = document.getElementById('modalLeadOverlay');
var btnCloseLeadModal = document.getElementById('btnCloseLeadModal');

if (btnAddLead && modalLeadOverlay) {
  btnAddLead.addEventListener('click', function() { modalLeadOverlay.classList.add('is-open'); });
}
if (btnCloseLeadModal && modalLeadOverlay) {
  btnCloseLeadModal.addEventListener('click', function() { modalLeadOverlay.classList.remove('is-open'); });
}
if (modalLeadOverlay) {
  modalLeadOverlay.addEventListener('click', function(e) {
    if (e.target === modalLeadOverlay) modalLeadOverlay.classList.remove('is-open');
  });
}

var formNewLead = document.getElementById('formNewLead');
if (formNewLead) {
  formNewLead.addEventListener('submit', function(e) {
    e.preventDefault();
    var newLead = {
      id: 'LEAD-' + Math.floor(100 + Math.random() * 900),
      name: document.getElementById('f_leadName').value.trim(),
      phone: document.getElementById('f_leadPhone').value.trim(),
      email: document.getElementById('f_leadEmail').value.trim(),
      channel: document.getElementById('f_leadChannel').value,
      notes: document.getElementById('f_leadNotes').value.trim(),
      stage: 'nuevo',
      carId: ''
    };
    leads.push(newLead);
    saveLeads(leads);
    modalLeadOverlay.classList.remove('is-open');
    formNewLead.reset();
    refreshCarData();
    showToast('Lead ' + newLead.id + ' creado');
  });
}

// Add task button
var btnAddTask = document.getElementById('btnAddTask');
var modalTaskOverlay = document.getElementById('modalTaskOverlay');
var btnCloseTaskModal = document.getElementById('btnCloseTaskModal');

if (btnAddTask && modalTaskOverlay) {
  btnAddTask.addEventListener('click', function() { modalTaskOverlay.classList.add('is-open'); });
}
if (btnCloseTaskModal && modalTaskOverlay) {
  btnCloseTaskModal.addEventListener('click', function() { modalTaskOverlay.classList.remove('is-open'); });
}
if (modalTaskOverlay) {
  modalTaskOverlay.addEventListener('click', function(e) {
    if (e.target === modalTaskOverlay) modalTaskOverlay.classList.remove('is-open');
  });
}

var formNewTask = document.getElementById('formNewTask');
if (formNewTask) {
  formNewTask.addEventListener('submit', function(e) {
    e.preventDefault();
    var newTask = {
      id: 'TSK-' + Math.floor(100 + Math.random() * 900),
      type: document.getElementById('f_taskType').value,
      client: document.getElementById('f_taskClient').value.trim(),
      car: document.getElementById('f_taskCar').value.trim(),
      date: document.getElementById('f_taskDate').value,
      status: 'pendiente'
    };
    tasks.push(newTask);
    saveTasks(tasks);
    modalTaskOverlay.classList.remove('is-open');
    formNewTask.reset();
    refreshCarData();
    showToast('Tarea ' + newTask.id + ' creada');
  });
}

// Car filters
var filterCarStatus = document.getElementById('filterCarStatus');
var searchCar = document.getElementById('searchCar');
if (filterCarStatus) filterCarStatus.addEventListener('change', renderCarsTable);
if (searchCar) searchCar.addEventListener('input', renderCarsTable);

// Finance KPIs clickable filters
var kpiTodayCard = document.getElementById('kpi-fin-today-card');
var kpiWeekCard = document.getElementById('kpi-fin-week-card');
var kpiMonthCard = document.getElementById('kpi-fin-month-card');
var financeKPICards = [kpiTodayCard, kpiWeekCard, kpiMonthCard];

function setActiveFinanceKPI(card) {
  financeKPICards.forEach(function(c) {
    if (c) c.classList.remove('is-active-fin');
  });
  if (card) card.classList.add('is-active-fin');
}

if (kpiTodayCard) {
  console.log('KPI Today card found');
  kpiTodayCard.addEventListener('click', function() {
    if (financeFilterPeriod === 'today') {
      financeFilterPeriod = 'all';
      setActiveFinanceKPI(null);
      showToast('Mostrando todas las comisiones');
    } else {
      financeFilterPeriod = 'today';
      setActiveFinanceKPI(kpiTodayCard);
      showToast('Filtrando comisiones de hoy');
    }
    renderFinanceTable();
  });
}
if (kpiWeekCard) {
  console.log('KPI Week card found');
  kpiWeekCard.addEventListener('click', function() {
    if (financeFilterPeriod === 'week') {
      financeFilterPeriod = 'all';
      setActiveFinanceKPI(null);
      showToast('Mostrando todas las comisiones');
    } else {
      financeFilterPeriod = 'week';
      setActiveFinanceKPI(kpiWeekCard);
      showToast('Filtrando comisiones de esta semana');
    }
    renderFinanceTable();
  });
}
if (kpiMonthCard) {
  console.log('KPI Month card found');
  kpiMonthCard.addEventListener('click', function() {
    if (financeFilterPeriod === 'month') {
      financeFilterPeriod = 'all';
      setActiveFinanceKPI(null);
      showToast('Mostrando todas las comisiones');
    } else {
      financeFilterPeriod = 'month';
      setActiveFinanceKPI(kpiMonthCard);
      showToast('Filtrando comisiones de este mes');
    }
    renderFinanceTable();
  });
}

var filterCommissionPeriod = document.getElementById('filterCommissionPeriod');
if (filterCommissionPeriod) filterCommissionPeriod.addEventListener('change', renderCommissionsHistory);

// ===================== REFRESH CAR DATA =====================
function refreshCarData() {
  calculateCarKPIs();
  renderCarsTable();
  renderAlerts();
  renderPipeline();
  renderTasks();
  renderAnalytics();
}

// ===================== UPDATE REFRESH ALL =====================
function refreshAllData() {
  calculateOverviewKPIs();
  renderOverviewTable(packages);
  renderPackagesTable();
  renderMoneyTable();
  renderClientsTable();
  renderDeliveriesTable();
  renderFinanceTable();
  renderReportsTable();
  renderMessages();
  renderOrders();
  renderGlobalHistory();
  refreshCarData();
  renderCharts();
}

// ===================== WEB MESSAGES =====================
function loadMessages() {
  try {
    var data = localStorage.getItem('epk_web_messages');
    return data ? JSON.parse(data) : [];
  } catch(e) { return []; }
}
function saveMessages(arr) {
  localStorage.setItem('epk_web_messages', JSON.stringify(arr));
}
var webMessages = loadMessages();

function migrateLocalMessagesToBackend() {
  if (!webMessages.length) return;
  var tenant = JSON.parse(localStorage.getItem('epk_tenant') || '{}');
  var tId = tenant.id || 'public';
  var pending = webMessages.filter(function(m) { return m.status !== 'respondido'; });
  pending.forEach(function(msg) {
    api.post('/messages', {
      name: msg.name,
      phone: msg.phone,
      email: msg.email || '',
      message: msg.message,
      tenantId: tId
    }).catch(function() {});
  });
  localStorage.removeItem('epk_web_messages');
  webMessages = [];
}
migrateLocalMessagesToBackend();

function renderMessages() {
  var tbody = document.getElementById('messagesTableBody');
  if (!tbody) return;
  var tenant = JSON.parse(localStorage.getItem('epk_tenant') || '{}');
  var tId = tenant.id || 'public';
  api.get('/messages?tenantId=' + encodeURIComponent(tId)).then(function(messages) {
    var statusFilter = document.getElementById('filterMessageStatus');
    var filtered = messages.slice();

    if (statusFilter && statusFilter.value !== 'all') {
      filtered = filtered.filter(function(m) { return m.status === statusFilter.value; });
    }

    tbody.innerHTML = '';
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No hay mensajes recibidos desde la web.</p></td></tr>';
      return;
    }

    filtered.reverse().forEach(function(msg) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + formatDate(msg.date) + '</td>' +
        '<td><span class="person-name">' + (msg.name || '') + '</span><span class="person-sub">' + (msg.email || '') + '</span></td>' +
        '<td>' + (msg.phone || '') + '</td>' +
        '<td>' + (msg.message || '') + '</td>' +
        '<td><span class="status status--' + (msg.status === 'leido' ? 'recibido' : msg.status === 'respondido' ? 'entregado' : 'transito') + '">' + (msg.status === 'leido' ? 'Leído' : msg.status === 'respondido' ? 'Respondido' : 'Pendiente') + '</span></td>' +
        '<td>' + (msg.status !== 'respondido' ? '<button class="btn btn--primary btn--sm btn-msg-reply" data-id="' + msg.id + '">Marcar Respondido</button>' : '<span style="color:var(--verde);font-weight:600;">OK</span>') + '</td>';
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.btn-msg-reply').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var mid = btn.getAttribute('data-id');
        api.put('/messages/' + mid + '/status', { status: 'respondido' }).then(function() {
          refreshAllData();
          showToast('Mensaje ' + mid + ' marcado como respondido');
        }).catch(function() {
          showToast('Error al actualizar mensaje');
        });
      });
    });
  }).catch(function() {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No se pudieron cargar los mensajes.</p></td></tr>';
  });
}

var filterMessageStatus = document.getElementById('filterMessageStatus');
if (filterMessageStatus) filterMessageStatus.addEventListener('change', renderMessages);

// ===================== VEHICLE ORDERS =====================
function loadOrders() {
  try {
    var data = localStorage.getItem('epk_orders');
    return data ? JSON.parse(data) : [];
  } catch(e) { return []; }
}
function saveOrders(arr) {
  localStorage.setItem('epk_orders', JSON.stringify(arr));
}
var orders = loadOrders();

function renderOrders() {
  var tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No hay pedidos registrados.</p></td></tr>';
    return;
  }
  orders.slice().reverse().forEach(function(order) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="code">' + order.id + '</span></td>' +
      '<td><span class="person-name">' + order.client + '</span><span class="person-sub">' + order.phone + '</span></td>' +
      '<td>' + order.vehicleType + '</td>' +
      '<td>' + formatCarPrice(order.budget) + '</td>' +
      '<td>' + order.notes + '</td>' +
      '<td><span class="status status--transito">Pendiente</span></td>' +
      '<td>' + formatDate(order.date) + '</td>';
    tbody.appendChild(tr);
  });
}

var btnNuevoPedido = document.getElementById('btnNuevoPedido');
var btnNuevoPedido2 = document.getElementById('btnNuevoPedido2');
var modalOrderOverlay = document.getElementById('modalOrderOverlay');
var btnCloseOrderModal = document.getElementById('btnCloseOrderModal');

if (btnNuevoPedido && modalOrderOverlay) {
  btnNuevoPedido.addEventListener('click', function() { modalOrderOverlay.classList.add('is-open'); });
}
if (btnNuevoPedido2 && modalOrderOverlay) {
  btnNuevoPedido2.addEventListener('click', function() { modalOrderOverlay.classList.add('is-open'); });
}
if (btnCloseOrderModal && modalOrderOverlay) {
  btnCloseOrderModal.addEventListener('click', function() { modalOrderOverlay.classList.remove('is-open'); });
}
if (modalOrderOverlay) {
  modalOrderOverlay.addEventListener('click', function(e) {
    if (e.target === modalOrderOverlay) modalOrderOverlay.classList.remove('is-open');
  });
}

var formNewOrder = document.getElementById('formNewOrder');
if (formNewOrder) {
  formNewOrder.addEventListener('submit', function(e) {
    e.preventDefault();
    console.log('Order form submitted');
    var newOrder = {
      id: 'PED-' + Math.floor(100 + Math.random() * 900),
      client: document.getElementById('f_orderClient').value.trim(),
      phone: document.getElementById('f_orderPhone').value.trim(),
      vehicleType: document.getElementById('f_orderVehicleType').value.trim(),
      budget: parseFloat(document.getElementById('f_orderBudget').value) || 0,
      notes: document.getElementById('f_orderNotes').value.trim(),
      date: new Date().toISOString(),
      status: 'pendiente'
    };
    console.log('New order:', newOrder);
    orders.push(newOrder);
    saveOrders(orders);
    addAuditEntry('order_created', { id: newOrder.id, client: newOrder.client, vehicleType: newOrder.vehicleType });
    createInApi('orders', { client: newOrder.client, phone: newOrder.phone, vehicle_type: newOrder.vehicleType, budget: newOrder.budget, notes: newOrder.notes, status: newOrder.status, date: newOrder.date }).catch(() => {});
    console.log('Orders saved, total:', orders.length);
    modalOrderOverlay.classList.remove('is-open');
    formNewOrder.reset();
    refreshAllData();
    showToast('Pedido ' + newOrder.id + ' registrado correctamente');
  });
} else {
  console.log('Order form not found');
}

// ===================== INVOICES =====================
function renderInvoicesTable() {
  var tbody = document.getElementById('invoicesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!invoices || invoices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No hay facturas registradas.</p></td></tr>';
    return;
  }
  invoices.slice().reverse().forEach(function(inv) {
    var tr = document.createElement('tr');
    var statusLabel = inv.status === 'issued' ? 'Emitida' : inv.status === 'sent' ? 'Enviada' : 'Borrador';
    var statusClass = inv.status === 'issued' ? 'status--transito' : inv.status === 'sent' ? 'status--entregado' : 'status--pendiente';
    tr.innerHTML =
      '<td><span class="code">' + inv.invoice_number + '</span></td>' +
      '<td><span class="person-name">' + inv.client_name + '</span></td>' +
      '<td>' + inv.client_phone + '</td>' +
      '<td><strong>' + formatMoney(inv.amount) + '</strong></td>' +
      '<td><span class="status ' + statusClass + '">' + statusLabel + '</span></td>' +
      '<td>' + formatDate(inv.date) + '</td>' +
      '<td>' +
        '<button class="btn btn--ghost btn--sm" data-action="view-qr" data-id="' + inv.id + '">Ver QR</button>' +
        (inv.status !== 'sent' ? ' <button class="btn btn--sand btn--sm" data-action="send-whatsapp" data-id="' + inv.id + '">Enviar WhatsApp</button>' : '') +
      '</td>';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-action="view-qr"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      openQrModal(this.getAttribute('data-id'));
    });
  });
  tbody.querySelectorAll('[data-action="send-whatsapp"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      sendInvoiceWhatsApp(this.getAttribute('data-id'));
    });
  });
}

var modalInvoiceOverlay = document.getElementById('modalInvoiceOverlay');
var btnNuevaFactura = document.getElementById('btnNuevaFactura');
var btnCloseInvoiceModal = document.getElementById('btnCloseInvoiceModal');
var formNewInvoice = document.getElementById('formNewInvoice');

if (btnNuevaFactura && modalInvoiceOverlay) {
  btnNuevaFactura.addEventListener('click', function() { modalInvoiceOverlay.classList.add('is-open'); });
}
if (btnCloseInvoiceModal && modalInvoiceOverlay) {
  btnCloseInvoiceModal.addEventListener('click', function() { modalInvoiceOverlay.classList.remove('is-open'); });
}
if (modalInvoiceOverlay) {
  modalInvoiceOverlay.addEventListener('click', function(e) {
    if (e.target === modalInvoiceOverlay) modalInvoiceOverlay.classList.remove('is-open');
  });
}

if (formNewInvoice) {
  formNewInvoice.addEventListener('submit', async function(e) {
    e.preventDefault();
    var payload = {
      client_name: document.getElementById('f_invClientName').value.trim(),
      client_phone: document.getElementById('f_invClientPhone').value.trim(),
      client_email: document.getElementById('f_invClientEmail').value.trim(),
      amount: document.getElementById('f_invAmount').value,
      currency: document.getElementById('f_invCurrency').value
    };
    try {
      var result = await createInApi('invoices', payload);
      invoices.push(result.invoice);
      saveInvoices(invoices);
      modalInvoiceOverlay.classList.remove('is-open');
      formNewInvoice.reset();
      renderInvoicesTable();
      showToast('Factura ' + result.invoice.invoice_number + ' creada correctamente');
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  });
}

var modalQrOverlay = document.getElementById('modalQrOverlay');
var btnCloseQrModal = document.getElementById('btnCloseQrModal');
var qrPreviewImg = document.getElementById('qrPreviewImg');
var qrPreviewInfo = document.getElementById('qrPreviewInfo');
var qrDownloadLink = document.getElementById('qrDownloadLink');
var btnSendWhatsApp = document.getElementById('btnSendWhatsApp');
var currentQrInvoiceId = null;

function openQrModal(invoiceId) {
  currentQrInvoiceId = invoiceId;
  var inv = invoices.find(function(i) { return i.id === invoiceId; });
  if (!inv) return;
  qrPreviewImg.src = '/api/invoices/' + invoiceId + '/qr';
  qrPreviewInfo.textContent = inv.invoice_number + ' - ' + inv.client_name + ' - ' + formatMoney(inv.amount);
  qrDownloadLink.href = '/api/invoices/' + invoiceId + '/qr';
  qrDownloadLink.download = inv.invoice_number + '-qr.png';
  modalQrOverlay.classList.add('is-open');
}

if (btnCloseQrModal && modalQrOverlay) {
  btnCloseQrModal.addEventListener('click', function() { modalQrOverlay.classList.remove('is-open'); });
}

var clientDetailModal = document.getElementById('clientDetailModal');
var btnCloseClientDetail = document.getElementById('btnCloseClientDetail');
if (btnCloseClientDetail && clientDetailModal) {
  btnCloseClientDetail.addEventListener('click', closeClientDetail);
}
if (clientDetailModal) {
  clientDetailModal.addEventListener('click', function(e) {
    if (e.target === clientDetailModal) closeClientDetail();
  });
}
if (modalQrOverlay) {
  modalQrOverlay.addEventListener('click', function(e) {
    if (e.target === modalQrOverlay) modalQrOverlay.classList.remove('is-open');
  });
}

async function sendInvoiceWhatsApp(invoiceId) {
  var inv = invoices.find(function(i) { return i.id === invoiceId; });
  if (!inv) return;
  try {
    var result = await api.post('/invoices/' + invoiceId + '/send-whatsapp', {});
    inv.status = 'sent';
    saveInvoices(invoices);
    renderInvoicesTable();
    showToast('Factura enviada por WhatsApp correctamente');
  } catch (err) {
    showToast('Error enviando WhatsApp: ' + err.message);
  }
}

if (btnSendWhatsApp) {
  btnSendWhatsApp.addEventListener('click', function() {
    if (currentQrInvoiceId) sendInvoiceWhatsApp(currentQrInvoiceId);
  });
}

function buildGlobalHistory() {
  var history = [];

  packages.forEach(function(svc) {
    var detail = '—';
    if (svc.serviceType === 'paquete' && svc.details) {
      detail = (svc.details.senderName || '') + ' → ' + (svc.details.receiverName || '') + ' (' + (svc.details.city || '') + ')';
    } else if (svc.client && svc.client.name) {
      detail = svc.client.name + ' — ' + (svc.label || svc.serviceType || '');
    }
    history.push({
      date: svc.date,
      type: svc.serviceType || 'servicio',
      detail: detail,
      reference: svc.id,
      status: svc.status
    });
  });

  cars.forEach(function(c) {
    history.push({
      date: c.date,
      type: 'vehiculo',
      detail: c.brand + ' ' + c.model + ' (' + c.plate + ')',
      reference: c.id,
      status: c.status
    });
  });

  orders.forEach(function(o) {
    history.push({
      date: o.date,
      type: 'pedido',
      detail: o.client + ' - ' + o.vehicleType,
      reference: o.id,
      status: o.status
    });
  });

  webMessages.forEach(function(m) {
    history.push({
      date: m.date,
      type: 'mensaje',
      detail: m.name + ': ' + m.message,
      reference: m.id,
      status: m.status
    });
  });

  history.sort(function(a, b) {
    var da = new Date(a.date || 0);
    var db = new Date(b.date || 0);
    return db - da;
  });

  return history;
}

function renderGlobalHistory() {
  var tbody = document.getElementById('historyTableBody');
  if (!tbody) return;
  var typeFilter = document.getElementById('filterHistoryType');
  var history = buildGlobalHistory();

  if (typeFilter && typeFilter.value !== 'all') {
    history = history.filter(function(h) { return h.type === typeFilter.value; });
  }

  tbody.innerHTML = '';
  if (history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No hay actividad registrada.</p></td></tr>';
    return;
  }

  history.slice(0, 200).forEach(function(item) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + formatDate(item.date) + '</td>' +
      '<td><span class="status status--transito">' + item.type.toUpperCase() + '</span></td>' +
      '<td>' + item.detail + '</td>' +
      '<td><span class="code">' + item.reference + '</span></td>' +
      '<td><span class="status status--' + (item.status === 'entregado' || item.status === 'respondido' || item.status === 'vendido' || item.status === 'completada' ? 'entregado' : item.status === 'transito' || item.status === 'pendiente' ? 'transito' : 'recibido') + '">' + (item.status || '—') + '</span></td>';
    tbody.appendChild(tr);
  });
}

var filterHistoryType = document.getElementById('filterHistoryType');
if (filterHistoryType) filterHistoryType.addEventListener('change', renderGlobalHistory);

// ===================== ESTADÍSTICAS Y GRÁFICAS =====================
var statsCtxRevenue = null;
var statsCtxOpsType = null;
var statsCtxCommissions = null;
var statsCtxTopCars = null;

function getMonthKey(dateStr) {
  var d = new Date(dateStr);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function getWeekKey(dateStr) {
  var d = new Date(dateStr);
  var year = d.getFullYear();
  var week = getWeekNumber(d);
  return year + '-W' + week;
}

function getWeekNumber(d) {
  var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function getFilteredPackages() {
  var rangeEl = document.getElementById('statsRange');
  var fromEl = document.getElementById('statsFrom');
  var toEl = document.getElementById('statsTo');
  var now = new Date();
  var from = new Date(now);
  var to = new Date(now);

  if (fromEl && fromEl.value) from = new Date(fromEl.value + 'T00:00:00');
  else if (rangeEl && rangeEl.value) from.setDate(from.getDate() - parseInt(rangeEl.value, 10));
  else from.setDate(from.getDate() - 30);

  if (toEl && toEl.value) to = new Date(toEl.value + 'T23:59:59');
  else to.setHours(23, 59, 59, 999);

  return packages.filter(function(p) {
    if (!p.date) return false;
    var d = new Date(p.date);
    return d >= from && d <= to;
  });
}

function renderStatsKPIs() {
  var filtered = getFilteredPackages();
  var totalIncome = filtered.reduce(function(s, p) { return s + Number((p.financial && p.financial.total) || 0); }, 0);
  var totalOps = filtered.length;
  var soldCars = cars.filter(function(c) { return c.status === 'vendido'; }).length;
  var activeOrders = orders.filter(function(o) { return o.status !== 'cancelado'; }).length;
  var activeServices = filtered.filter(function(p) { return p.status === 'pendiente' || p.status === 'en_proceso' || p.status === 'transito'; }).length;
  var finishedServices = filtered.filter(function(p) { return p.status === 'entregado' || p.status === 'completado' || p.status === 'recibido'; }).length;
  var successRate = totalOps > 0 ? Math.round((finishedServices / totalOps) * 100) : 0;
  var avgTicket = totalOps > 0 ? (totalIncome / totalOps) : 0;
  var pendingPayments = filtered.filter(function(p) { return p.status === 'pendiente' || p.status === 'en_proceso' || p.status === 'transito'; }).reduce(function(s, p) { return s + Number((p.financial && p.financial.total) || 0); }, 0);

  var elIncome = document.getElementById('stat-income');
  var elOps = document.getElementById('stat-ops');
  var elCars = document.getElementById('stat-cars');
  var elOrders = document.getElementById('stat-orders');
  var elActiveServices = document.getElementById('stat-active-services');
  var elFinishedServices = document.getElementById('stat-finished-services');
  var elSuccessRate = document.getElementById('stat-success-rate');
  var elAvgTicket = document.getElementById('stat-avg-ticket');
  var elPendingPayments = document.getElementById('stat-pending-payments');
  if (elIncome) elIncome.textContent = formatMoney(totalIncome);
  if (elOps) elOps.textContent = totalOps;
  if (elCars) elCars.textContent = soldCars;
  if (elOrders) elOrders.textContent = activeOrders;
  if (elActiveServices) elActiveServices.textContent = activeServices;
  if (elFinishedServices) elFinishedServices.textContent = finishedServices;
  if (elSuccessRate) elSuccessRate.textContent = successRate + '%';
  if (elAvgTicket) elAvgTicket.textContent = formatMoney(avgTicket);
  if (elPendingPayments) elPendingPayments.textContent = formatMoney(pendingPayments);
}

function drawBarChart(canvasId, labels, values, colors) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  var padding = { top: 24, right: 16, bottom: 64, left: 48 };
  var chartWidth = rect.width - padding.left - padding.right;
  var chartHeight = rect.height - padding.top - padding.bottom;

  if (values.length === 0) {
    ctx.fillStyle = '#666';
    ctx.font = '13px Work Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos en este periodo', rect.width / 2, rect.height / 2);
    return;
  }

  var maxVal = Math.max.apply(null, values) || 1;
  var barWidth = chartWidth / values.length * 0.55;
  var gap = chartWidth / values.length * 0.45;

  ctx.strokeStyle = 'rgba(8,34,44,0.08)';
  ctx.lineWidth = 1;
  for (var i = 0; i <= 5; i++) {
    var y = padding.top + chartHeight - (i / 5) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
  }

  values.forEach(function(val, i) {
    var barHeight = Math.max((val / maxVal) * chartHeight, 2);
    var x = padding.left + i * (barWidth + gap) + gap / 2;
    var y = padding.top + chartHeight - barHeight;

    ctx.shadowColor = 'rgba(5,47,61,0.18)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = colors[i % colors.length];

    var r = 6;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + barWidth - r, y);
    ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
    ctx.lineTo(x + barWidth, y + barHeight);
    ctx.lineTo(x, y + barHeight);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = '#08222C';
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(val, x + barWidth / 2, y - 8);

    ctx.fillStyle = '#555';
    ctx.font = '11px Work Sans, sans-serif';
    ctx.fillText(labels[i], x + barWidth / 2, padding.top + chartHeight + 18);
  });
}

function drawLineChart(canvasId, labels, values, color) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  var padding = { top: 24, right: 16, bottom: 64, left: 48 };
  var chartWidth = rect.width - padding.left - padding.right;
  var chartHeight = rect.height - padding.top - padding.bottom;

  if (values.length === 0) {
    ctx.fillStyle = '#666';
    ctx.font = '13px Work Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos en este periodo', rect.width / 2, rect.height / 2);
    return;
  }

  var maxVal = Math.max.apply(null, values) || 1;
  var stepX = chartWidth / (values.length - 1 || 1);

  ctx.strokeStyle = 'rgba(8,34,44,0.08)';
  ctx.lineWidth = 1;
  for (var i = 0; i <= 5; i++) {
    var y = padding.top + chartHeight - (i / 5) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  values.forEach(function(val, i) {
    var x = padding.left + i * stepX;
    var y = padding.top + chartHeight - (val / maxVal) * chartHeight;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = color;
  values.forEach(function(val, i) {
    var x = padding.left + i * stepX;
    var y = padding.top + chartHeight - (val / maxVal) * chartHeight;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
  });

  ctx.fillStyle = '#555';
  ctx.font = '11px Work Sans, sans-serif';
  ctx.textAlign = 'center';
  labels.forEach(function(label, i) {
    var x = padding.left + i * stepX;
    ctx.fillText(label, x, padding.top + chartHeight + 18);
  });
}

function drawDoughnut(canvasId, labels, values, colors) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  var total = values.reduce(function(s, v) { return s + v; }, 0) || 1;
  if (total === 0) {
    ctx.fillStyle = '#666';
    ctx.font = '13px Work Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos en este periodo', rect.width / 2, rect.height / 2);
    return;
  }

  var centerX = rect.width / 2;
  var centerY = rect.height / 2 - 10;
  var radius = Math.min(centerX, centerY) - 50;
  var innerRadius = radius * 0.6;

  var startAngle = -Math.PI / 2;
  values.forEach(function(val, i) {
    var sliceAngle = (val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(centerX + Math.cos(startAngle) * innerRadius, centerY + Math.sin(startAngle) * innerRadius);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.arc(centerX, centerY, innerRadius, startAngle + sliceAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    startAngle += sliceAngle;
  });

  ctx.fillStyle = '#08222C';
  ctx.font = 'bold 16px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total, centerX, centerY - 6);
  ctx.font = '11px Work Sans, sans-serif';
  ctx.fillStyle = '#666';
  ctx.fillText('Total', centerX, centerY + 10);

  var legendY = rect.height - 24;
  var legendStartX = 10;
  labels.forEach(function(label, i) {
    var x = legendStartX + i * (rect.width / labels.length);
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    var lx = x;
    var ly = legendY;
    var lr = 2;
    ctx.moveTo(lx + lr, ly);
    ctx.lineTo(lx + 10 - lr, ly);
    ctx.quadraticCurveTo(lx + 10, ly, lx + 10, ly + lr);
    ctx.lineTo(lx + 10, ly + 10 - lr);
    ctx.quadraticCurveTo(lx + 10, ly + 10, lx + 10 - lr, ly + 10);
    ctx.lineTo(lx + lr, ly + 10);
    ctx.quadraticCurveTo(lx, ly + 10, lx, ly + 10 - lr);
    ctx.lineTo(lx, ly + lr);
    ctx.quadraticCurveTo(lx, ly, lx + lr, ly);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#444';
    ctx.font = '11px Work Sans, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label + ' (' + Math.round((values[i] / total) * 100) + '%)', x + 14, legendY + 9);
  });
}

function drawSparkline(canvasId, values, color) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (values.length < 2) {
    ctx.fillStyle = '#888';
    ctx.font = '10px Work Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin serie suficiente', rect.width / 2, rect.height / 2);
    return;
  }

  var padding = { top: 4, right: 4, bottom: 4, left: 4 };
  var w = rect.width - padding.left - padding.right;
  var h = rect.height - padding.top - padding.bottom;
  var max = Math.max.apply(null, values) || 1;
  var min = Math.min.apply(null, values);
  var range = max - min || 1;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  values.forEach(function(val, i) {
    var x = padding.left + (i / (values.length - 1)) * w;
    var y = padding.top + h - ((val - min) / range) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  var lastX = padding.left + w;
  var lastY = padding.top + h - ((values[values.length - 1] - min) / range) * h;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawMultiLineChart(canvasId, labels, datasets, colors) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  var padding = { top: 24, right: 16, bottom: 64, left: 48 };
  var chartWidth = rect.width - padding.left - padding.right;
  var chartHeight = rect.height - padding.top - padding.bottom;

  var allValues = [];
  datasets.forEach(function(ds) { allValues = allValues.concat(ds.values); });
  if (allValues.length === 0) {
    ctx.fillStyle = '#666';
    ctx.font = '13px Work Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos en este periodo', rect.width / 2, rect.height / 2);
    return;
  }
  var maxVal = Math.max.apply(null, allValues) || 1;
  var stepX = chartWidth / (labels.length - 1 || 1);

  ctx.strokeStyle = 'rgba(8,34,44,0.08)';
  ctx.lineWidth = 1;
  for (var i = 0; i <= 5; i++) {
    var y = padding.top + chartHeight - (i / 5) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
  }

  datasets.forEach(function(ds) {
    ctx.strokeStyle = ds.color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ds.values.forEach(function(val, i) {
      var x = padding.left + i * stepX;
      var y = padding.top + chartHeight - (val / maxVal) * chartHeight;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  ctx.fillStyle = '#555';
  ctx.font = '11px Work Sans, sans-serif';
  ctx.textAlign = 'center';
  labels.forEach(function(label, i) {
    var x = padding.left + i * stepX;
    ctx.fillText(label, x, padding.top + chartHeight + 18);
  });
}

function drawStackedBarChart(canvasId, labels, datasets, colors) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  if (rect.width === 0) return;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  var padding = { top: 24, right: 16, bottom: 64, left: 48 };
  var chartWidth = rect.width - padding.left - padding.right;
  var chartHeight = rect.height - padding.top - padding.bottom;

  var totals = labels.map(function(_, i) {
    return datasets.reduce(function(s, ds) { return s + (ds.values[i] || 0); }, 0);
  });
  var maxVal = Math.max.apply(null, totals) || 1;
  var barWidth = chartWidth / labels.length * 0.55;
  var gap = chartWidth / labels.length * 0.45;

  ctx.strokeStyle = 'rgba(8,34,44,0.08)';
  ctx.lineWidth = 1;
  for (var i = 0; i <= 5; i++) {
    var y = padding.top + chartHeight - (i / 5) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
  }

  labels.forEach(function(label, i) {
    var x = padding.left + i * (barWidth + gap) + gap / 2;
    var yOffset = padding.top + chartHeight;
    datasets.forEach(function(ds, j) {
      var val = ds.values[i] || 0;
      var barHeight = (val / maxVal) * chartHeight;
      yOffset -= barHeight;
      ctx.fillStyle = ds.color;
      ctx.fillRect(x, yOffset, barWidth, barHeight);
    });
    ctx.fillStyle = '#08222C';
    ctx.font = 'bold 11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(totals[i], x + barWidth / 2, padding.top + chartHeight - (totals[i] / maxVal) * chartHeight - 8);
    ctx.fillStyle = '#555';
    ctx.font = '11px Work Sans, sans-serif';
    ctx.fillText(label, x + barWidth / 2, padding.top + chartHeight + 18);
  });
}

function drawRevenueTrend(filtered) {
  var dailyByType = {};
  filtered.forEach(function(p) {
    var dayKey = getDayKey(p.date);
    if (!dailyByType[dayKey]) dailyByType[dayKey] = { paquete: 0, gestion_comercial: 0, construccion: 0, otro: 0 };
    dailyByType[dayKey][p.serviceType] = (dailyByType[dayKey][p.serviceType] || 0) + Number((p.financial && p.financial.total) || 0);
  });
  var days = Object.keys(dailyByType).sort();
  if (days.length === 0) return;
  var labels = days;
  var datasets = [
    { label: 'Paquetes', values: days.map(function(d) { return dailyByType[d].paquete || 0; }), color: '#0B6E99' },
    { label: 'Gestión Comercial', values: days.map(function(d) { return dailyByType[d].gestion_comercial || 0; }), color: '#3FC1C9' },
    { label: 'Construcción', values: days.map(function(d) { return dailyByType[d].construccion || 0; }), color: '#F2A65A' },
    { label: 'Otro', values: days.map(function(d) { return dailyByType[d].otro || 0; }), color: '#2ecc71' }
  ];
  drawMultiLineChart('chartRevenueTrend', labels, datasets, []);
}

function drawStackedRevenue(months, revenueByMonthType, colors) {
  var datasets = [
    { label: 'Paquetes', values: months.map(function(m) { return revenueByMonthType[m] ? (revenueByMonthType[m].paquete || 0) : 0; }), color: '#0B6E99' },
    { label: 'Gestión Comercial', values: months.map(function(m) { return revenueByMonthType[m] ? (revenueByMonthType[m].gestion_comercial || 0) : 0; }), color: '#3FC1C9' },
    { label: 'Construcción', values: months.map(function(m) { return revenueByMonthType[m] ? (revenueByMonthType[m].construccion || 0) : 0; }), color: '#F2A65A' },
    { label: 'Otro', values: months.map(function(m) { return revenueByMonthType[m] ? (revenueByMonthType[m].otro || 0) : 0; }), color: '#2ecc71' }
  ];
  drawStackedBarChart('chartStackedRevenue', months, datasets, colors);
}

function renderStatsTopClients(filtered) {
  var tbody = document.getElementById('statsTopClientsBody');
  if (!tbody) return;
  var clientMap = {};
  filtered.forEach(function(p) {
    if (!p.client || !p.client.name) return;
    var key = p.client.name + '|' + (p.client.phone || '');
    if (!clientMap[key]) clientMap[key] = { name: p.client.name, phone: p.client.phone || '', count: 0, revenue: 0 };
    clientMap[key].count++;
    clientMap[key].revenue += Number((p.financial && p.financial.total) || 0);
  });
  var clients = Object.values(clientMap);
  clients.sort(function(a, b) { return b.revenue - a.revenue; });
  var top = clients.slice(0, 10);
  tbody.innerHTML = '';
  if (top.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state"><p>No hay datos suficientes.</p></td></tr>';
    return;
  }
  top.forEach(function(c) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="person-name">' + c.name + '</span></td>' +
      '<td>' + c.phone + '</td>' +
      '<td><strong>' + c.count + '</strong></td>' +
      '<td>' + formatMoney(c.revenue) + '</td>';
    tbody.appendChild(tr);
  });
}

function renderStatsPendingPayments(filtered) {
  var tbody = document.getElementById('statsPendingPaymentsBody');
  if (!tbody) return;
  var pending = filtered.filter(function(p) { return p.status === 'pendiente' || p.status === 'en_proceso' || p.status === 'transito'; });
  pending.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  tbody.innerHTML = '';
  if (pending.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No hay pagos pendientes en este periodo.</p></td></tr>';
    return;
  }
  pending.forEach(function(p) {
    var tr = document.createElement('tr');
    var clientName = (p.client && p.client.name) ? p.client.name : '—';
    var typeLabel = getServiceTypeLabel(p.serviceType);
    tr.innerHTML =
      '<td><span class="code">' + p.id + '</span></td>' +
      '<td><span class="person-name">' + clientName + '</span></td>' +
      '<td>' + typeLabel + '</td>' +
      '<td><strong>' + formatMoney((p.financial && p.financial.total) || 0) + '</strong></td>' +
      '<td><span class="status status--' + p.status + '">' + getServiceStatusText(p.status) + '</span></td>' +
      '<td>' + formatDate(p.date) + '</td>';
    tbody.appendChild(tr);
  });
}

function renderCharts() {
  renderStatsKPIs();

  var months = [];
  var revenueByMonth = [];
  var commissionsByWeek = {};
  var weekLabels = [];
  var weekValues = [];
  var opTypeCounts = { paquete: 0, gestion_comercial: 0, construccion: 0, otro: 0 };
  var revenueByType = { paquete: 0, gestion_comercial: 0, construccion: 0, otro: 0 };
  var carSales = {};
  var monthRevenue = {};
  var revenueByMonthType = {};
  var dailyIncomeTotal = {};
  var dailyIncomeByType = {};
  var activeByDay = {};
  var ticketByDay = {};

  var filtered = getFilteredPackages();

  filtered.forEach(function(p) {
    var mk = getMonthKey(p.date);
    monthRevenue[mk] = (monthRevenue[mk] || 0) + Number((p.financial && p.financial.total) || 0);

    var ft = p.serviceType;
    if (ft === 'paquete') opTypeCounts.paquete++;
    else if (ft === 'gestion_comercial') opTypeCounts.gestion_comercial++;
    else if (ft === 'construccion') opTypeCounts.construccion++;
    else if (ft === 'otro') opTypeCounts.otro++;

    revenueByType[ft] = (revenueByType[ft] || 0) + Number((p.financial && p.financial.total) || 0);

    var dayKey = getDayKey(p.date);
    dailyIncomeTotal[dayKey] = (dailyIncomeTotal[dayKey] || 0) + Number((p.financial && p.financial.total) || 0);
    dailyIncomeByType[dayKey] = dailyIncomeByType[dayKey] || {};
    dailyIncomeByType[dayKey][ft] = (dailyIncomeByType[dayKey][ft] || 0) + Number((p.financial && p.financial.total) || 0);
    if (p.status === 'pendiente' || p.status === 'en_proceso' || p.status === 'transito') {
      activeByDay[dayKey] = (activeByDay[dayKey] || 0) + 1;
    }
    ticketByDay[dayKey] = (ticketByDay[dayKey] || 0) + Number((p.financial && p.financial.total) || 0);

    if (!revenueByMonthType[mk]) revenueByMonthType[mk] = { paquete: 0, gestion_comercial: 0, construccion: 0, otro: 0 };
    revenueByMonthType[mk][ft] = (revenueByMonthType[mk][ft] || 0) + Number((p.financial && p.financial.total) || 0);

    var wk = getWeekKey(p.date);
    commissionsByWeek[wk] = (commissionsByWeek[wk] || 0) + Number((p.financial && p.financial.fee) || 0);
  });

  cars.forEach(function(c) {
    if (c.status === 'vendido') {
      var key = c.brand + ' ' + c.model;
      carSales[key] = (carSales[key] || 0) + 1;
    }
  });

  var sortedMonths = Object.keys(monthRevenue).sort();
  sortedMonths.forEach(function(m) {
    var parts = m.split('-');
    var monthNames = ['Ene','Feb','Mar','Abr','Mayo','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    months.push(monthNames[parseInt(parts[1], 10) - 1] + ' ' + parts[0]);
    revenueByMonth.push(monthRevenue[m]);
  });

  var sortedWeeks = Object.keys(commissionsByWeek).sort();
  sortedWeeks.forEach(function(w) {
    weekLabels.push('S ' + w.split('-W')[1]);
    weekValues.push(commissionsByWeek[w]);
  });

  var palette = ['#052F3D', '#0B6E99', '#3FC1C9', '#F2A65A', '#2ecc71', '#9b59b6', '#e74c3c', '#3498db'];
  var typeColors = ['#0B6E99', '#3FC1C9', '#F2A65A', '#2ecc71'];

  drawBarChart('chartRevenue', months, revenueByMonth, palette);
  drawDoughnut('chartOpsType', ['Paquetes', 'Gestión Comercial', 'Construcción', 'Otro'], [opTypeCounts.paquete, opTypeCounts.gestion_comercial, opTypeCounts.construccion, opTypeCounts.otro], typeColors);
  drawBarChart('chartCommissions', weekLabels, weekValues, ['#F2A65A']);
  drawBarChart('chartTopCars', Object.keys(carSales), Object.values(carSales), ['#0B6E99']);
  drawDoughnut('chartRevenueByType', ['Paquetes', 'Gestión Comercial', 'Construcción', 'Otro'], [revenueByType.paquete, revenueByType.gestion_comercial, revenueByType.construccion, revenueByType.otro], typeColors);

  drawRevenueTrend(filtered);
  drawStackedRevenue(months, revenueByMonthType, typeColors);

  drawSparkline('spark-income', Object.values(dailyIncomeTotal), '#0B6E99');
  drawSparkline('spark-ops', Object.keys(dailyIncomeTotal).map(function(k) { return activeByDay[k] || 0; }), '#F2A65A');
  drawSparkline('spark-active', Object.keys(dailyIncomeTotal).map(function(k) { return activeByDay[k] || 0; }), '#2ecc71');
  drawSparkline('spark-ticket', Object.keys(dailyIncomeTotal).map(function(k) { return ticketByDay[k] || 0; }), '#9b59b6');

  renderStatsTopClients(filtered);
  renderStatsPendingPayments(filtered);
}

// ===================== EMPLEADOS =====================
function loadEmployees() {
  try {
    var data = localStorage.getItem('epk_employees');
    return data ? JSON.parse(data) : [];
  } catch(e) { return []; }
}
function saveEmployees(arr) {
  localStorage.setItem('epk_employees', JSON.stringify(arr));
}
var employees = loadEmployees();

function renderEmployees() {
  var tbody = document.getElementById('employeesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (employees.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><p>No hay empleados registrados.</p></td></tr>';
    return;
  }
  employees.slice().reverse().forEach(function(emp) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="person-name">' + emp.name + '</span></td>' +
      '<td>' + emp.role + '</td>' +
      '<td>' + emp.phone + '</td>' +
      '<td>' + emp.email + '</td>' +
      '<td>' + formatDate(emp.date) + '</td>' +
      '<td><span class="status status--' + (emp.status === 'activo' ? 'entregado' : 'transito') + '">' + (emp.status === 'activo' ? 'Activo' : 'Inactivo') + '</span></td>' +
      '<td><button class="btn btn--secondary btn--sm btn-emp-status" data-id="' + emp.id + '">Estado</button> <button class="btn btn--danger btn--sm btn-emp-delete" data-id="' + emp.id + '">X</button></td>';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-emp-status').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var eid = btn.getAttribute('data-id');
      var emp = employees.find(function(e) { return e.id === eid; });
      if (!emp) return;
      emp.status = emp.status === 'activo' ? 'inactivo' : 'activo';
      saveEmployees(employees);
      refreshAllData();
      showToast('Empleado ' + eid + ' → ' + (emp.status === 'activo' ? 'Activo' : 'Inactivo'));
    });
  });
  tbody.querySelectorAll('.btn-emp-delete').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var eid = btn.getAttribute('data-id');
      if (confirm('¿Eliminar empleado ' + eid + '?')) {
        employees = employees.filter(function(e) { return e.id !== eid; });
        saveEmployees(employees);
        refreshAllData();
        showToast('Empleado eliminado');
      }
    });
  });
}

var btnAddEmployee = document.getElementById('btnAddEmployee');
if (btnAddEmployee) {
  btnAddEmployee.addEventListener('click', function() {
    var name = prompt('Nombre del empleado:');
    if (!name) return;
    var role = prompt('Rol (ej. Repartidor, Administrativo, Comercial):');
    if (!role) role = 'Sin asignar';
    var phone = prompt('Teléfono:') || '';
    var email = prompt('Email:') || '';
    var emp = {
      id: 'EMP-' + Math.floor(100 + Math.random() * 900),
      name: name,
      role: role,
      phone: phone,
      email: email,
      date: new Date().toISOString(),
      status: 'activo'
    };
    employees.push(emp);
    saveEmployees(employees);
    addAuditEntry('employee_created', { id: emp.id, name: emp.name, role: emp.role });
    createInApi('employees', { name: emp.name, role: emp.role, phone: emp.phone, email: emp.email, status: emp.status, date: emp.date }).catch(() => {});
    refreshAllData();
    showToast('Empleado ' + emp.id + ' creado');
  });
}

// ===================== GASTOS =====================
function loadExpenses() {
  try {
    var data = localStorage.getItem('epk_expenses');
    return data ? JSON.parse(data) : [];
  } catch(e) { return []; }
}
function saveExpenses(arr) {
  localStorage.setItem('epk_expenses', JSON.stringify(arr));
}
var expenses = loadExpenses();

function renderExpenses() {
  var tbody = document.getElementById('expensesTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (expenses.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No hay gastos registrados.</p></td></tr>';
    return;
  }
  expenses.slice().reverse().forEach(function(exp) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + formatDate(exp.date) + '</td>' +
      '<td>' + exp.category + '</td>' +
      '<td>' + exp.concept + '</td>' +
      '<td><strong>' + formatMoney(exp.amount) + '</strong></td>' +
      '<td><span class="status status--' + (exp.type === 'fijo' ? 'entregado' : 'transito') + '">' + (exp.type === 'fijo' ? 'Fijo' : 'Variable') + '</span></td>' +
      '<td><button class="btn btn--danger btn--sm btn-exp-delete" data-id="' + exp.id + '">X</button></td>';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-exp-delete').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var eid = btn.getAttribute('data-id');
      if (confirm('¿Eliminar gasto ' + eid + '?')) {
        expenses = expenses.filter(function(e) { return e.id !== eid; });
        saveExpenses(expenses);
        refreshAllData();
        showToast('Gasto eliminado');
      }
    });
  });
}

var btnAddExpense = document.getElementById('btnAddExpense');
if (btnAddExpense) {
  btnAddExpense.addEventListener('click', function() {
    var category = prompt('Categoría (ej. Alquiler, Luz, Gasolina, Sueldos):');
    if (!category) return;
    var concept = prompt('Concepto:') || category;
    var amount = parseFloat(prompt('Monto:') || '0');
    if (isNaN(amount) || amount <= 0) { showToast('Monto inválido'); return; }
    var type = confirm('¿Es un gasto fijo?') ? 'fijo' : 'variable';
    var exp = {
      id: 'EXP-' + Math.floor(100 + Math.random() * 900),
      date: new Date().toISOString(),
      category: category,
      concept: concept,
      amount: amount,
      type: type
    };
    expenses.push(exp);
    saveExpenses(expenses);
    addAuditEntry('expense_created', { id: exp.id, category: exp.category, amount: exp.amount, type: exp.type });
    createInApi('expenses', { category: exp.category, concept: exp.concept, amount: exp.amount, type: exp.type, date: exp.date }).catch(() => {});
    refreshAllData();
    showToast('Gasto ' + exp.id + ' registrado');
  });
}

// ===================== INGRESOS =====================
function loadIncomes() {
  try {
    var data = localStorage.getItem('epk_incomes');
    return data ? JSON.parse(data) : [];
  } catch(e) { return []; }
}
function saveIncomes(arr) {
  localStorage.setItem('epk_incomes', JSON.stringify(arr));
}
var incomes = loadIncomes();

// ===================== FINANZAS =====================
var financeMovTypeFilter = 'all';
var financeMovPeriodFilter = 'all';

function getFinanceMovements() {
  var movements = [];
  incomes.forEach(function(inc) {
    movements.push({ date: inc.date, type: 'ingreso', concept: inc.concept, reference: inc.id, amount: Number(inc.amount) });
  });
  expenses.forEach(function(exp) {
    movements.push({ date: exp.date, type: 'gasto', concept: exp.concept + (exp.category ? ' (' + exp.category + ')' : ''), reference: exp.id, amount: Number(exp.amount) });
  });
  movements.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  return movements;
}

function applyFinancePeriodFilter(movements) {
  if (financeMovPeriodFilter === 'today') {
    var todayStr = new Date().toDateString();
    return movements.filter(function(m) { return m.date && new Date(m.date).toDateString() === todayStr; });
  } else if (financeMovPeriodFilter === 'week') {
    var today = new Date();
    var startOfWeek = new Date(today);
    var dayOfWeek = startOfWeek.getDay();
    var diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    startOfWeek.setDate(startOfWeek.getDate() + diff);
    startOfWeek.setHours(0, 0, 0, 0);
    return movements.filter(function(m) { return m.date && new Date(m.date) >= startOfWeek; });
  } else if (financeMovPeriodFilter === 'month') {
    var startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return movements.filter(function(m) { return m.date && new Date(m.date) >= startOfMonth; });
  }
  return movements;
}

function renderFinanceMovementsTable() {
  var tbody = document.getElementById('financeMovTableBody');
  if (!tbody) return;
  var movements = getFinanceMovements();
  if (financeMovTypeFilter !== 'all') {
    movements = movements.filter(function(m) { return m.type === financeMovTypeFilter; });
  }
  movements = applyFinancePeriodFilter(movements);

  tbody.innerHTML = '';
  if (movements.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No hay movimientos financieros en este periodo.</p></td></tr>';
    return;
  }

  movements.forEach(function(m) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + formatDate(m.date) + '</td>' +
      '<td><span class="status status--' + (m.type === 'ingreso' ? 'entregado' : 'transito') + '">' + (m.type === 'ingreso' ? 'Ingreso' : 'Gasto') + '</span></td>' +
      '<td>' + m.concept + '</td>' +
      '<td><span class="code">' + m.reference + '</span></td>' +
      '<td><strong style="color:' + (m.type === 'ingreso' ? '#22c55e' : '#ef4444') + ';">' + formatMoney(m.amount) + '</strong></td>';
    tbody.appendChild(tr);
  });
}

function renderFinanceSummaryTable() {
  var tbody = document.getElementById('financeSummaryTableBody');
  if (!tbody) return;
  var periodType = document.getElementById('filterFinSummaryPeriod') ? document.getElementById('filterFinSummaryPeriod').value : 'week';
  var movements = getFinanceMovements();
  movements = applyFinancePeriodFilter(movements);

  tbody.innerHTML = '';
  if (movements.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No hay datos para este periodo.</p></td></tr>';
    return;
  }

  var groups = {};
  movements.forEach(function(m) {
    var key;
    if (periodType === 'week') {
      key = getWeekKey(m.date);
    } else {
      key = getMonthKey(m.date);
    }
    if (!groups[key]) groups[key] = { ingresos: 0, gastos: 0, count: 0 };
    if (m.type === 'ingreso') groups[key].ingresos += m.amount;
    else groups[key].gastos += m.amount;
    groups[key].count++;
  });

  var sortedKeys = Object.keys(groups).sort().reverse();
  sortedKeys.forEach(function(key) {
    var g = groups[key];
    var balance = g.ingresos - g.gastos;
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><strong>' + formatPeriodLabel(key, periodType) + '</strong></td>' +
      '<td style="color:#22c55e;"><strong>' + formatMoney(g.ingresos) + '</strong></td>' +
      '<td style="color:#ef4444;"><strong>' + formatMoney(g.gastos) + '</strong></td>' +
      '<td style="color:' + (balance >= 0 ? '#3b82f6' : '#ef4444') + ';"><strong>' + formatMoney(balance) + '</strong></td>' +
      '<td>' + g.count + '</td>';
    tbody.appendChild(tr);
  });
}

function calculateFinanceKPIs() {
  var movements = getFinanceMovements();
  var totalIncome = incomes.reduce(function(s, i) { return s + Number(i.amount); }, 0);
  var totalExpenses = expenses.reduce(function(s, e) { return s + Number(e.amount); }, 0);
  var cash = totalIncome - totalExpenses;

  var elIncome = document.getElementById('kpi-fin-income');
  var elExpenses = document.getElementById('kpi-fin-expenses');
  var elCash = document.getElementById('kpi-fin-cash');
  if (elIncome) elIncome.textContent = formatMoney(totalIncome);
  if (elExpenses) elExpenses.textContent = formatMoney(totalExpenses);
  if (elCash) elCash.textContent = formatMoney(cash);
}

// ===================== PROVEEDORES =====================
function loadProviders() {
  try {
    var data = localStorage.getItem('epk_providers');
    return data ? JSON.parse(data) : [];
  } catch(e) { return []; }
}
function saveProviders(arr) {
  localStorage.setItem('epk_providers', JSON.stringify(arr));
}
var providers = loadProviders();

function renderProviders() {
  var tbody = document.getElementById('providersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (providers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><p>No hay proveedores registrados.</p></td></tr>';
    return;
  }
  providers.slice().reverse().forEach(function(prov) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="person-name">' + prov.name + '</span></td>' +
      '<td>' + prov.service + '</td>' +
      '<td>' + prov.phone + '</td>' +
      '<td>' + prov.email + '</td>' +
      '<td>' + (prov.notes || '-') + '</td>' +
      '<td><button class="btn btn--danger btn--sm btn-prov-delete" data-id="' + prov.id + '">X</button></td>';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-prov-delete').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var pid = btn.getAttribute('data-id');
      if (confirm('¿Eliminar proveedor ' + pid + '?')) {
        providers = providers.filter(function(p) { return p.id !== pid; });
        saveProviders(providers);
        refreshAllData();
        showToast('Proveedor eliminado');
      }
    });
  });
}

var btnAddProvider = document.getElementById('btnAddProvider');
if (btnAddProvider) {
  btnAddProvider.addEventListener('click', function() {
    var name = prompt('Nombre del proveedor:');
    if (!name) return;
    var service = prompt('Servicio (ej. Mensajería, combustible, seguros):') || 'Otros';
    var phone = prompt('Teléfono:') || '';
    var email = prompt('Email:') || '';
    var notes = prompt('Notas:') || '';
    var prov = {
      id: 'PROV-' + Math.floor(100 + Math.random() * 900),
      name: name,
      service: service,
      phone: phone,
      email: email,
      notes: notes
    };
    providers.push(prov);
    saveProviders(providers);
    addAuditEntry('provider_created', { id: prov.id, name: prov.name, service: prov.service });
    createInApi('providers', { name: prov.name, service: prov.service, phone: prov.phone, email: prov.email, notes: prov.notes }).catch(() => {});
    refreshAllData();
    showToast('Proveedor ' + prov.id + ' creado');
  });
}

// ===================== NOTIFICACIONES =====================
function loadNotifications() {
  try {
    var data = localStorage.getItem('epk_notifications');
    return data ? JSON.parse(data) : [];
  } catch(e) { return []; }
}
function saveNotifications(arr) {
  localStorage.setItem('epk_notifications', JSON.stringify(arr));
}
var notifications = loadNotifications();

function addNotification(message, type) {
  var notif = {
    id: 'NTF-' + Math.floor(100 + Math.random() * 900),
    date: new Date().toISOString(),
    message: message,
    type: type || 'info',
    status: 'pendiente'
  };
  notifications.push(notif);
  saveNotifications(notifications);
  return notif;
}

function renderNotifications() {
  var tbody = document.getElementById('notificationsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (notifications.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No hay notificaciones.</p></td></tr>';
    return;
  }
  notifications.slice().reverse().forEach(function(n) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + formatDate(n.date) + '</td>' +
      '<td><span class="status status--' + (n.type === 'warning' ? 'transito' : n.type === 'error' ? 'recibido' : 'entregado') + '">' + n.type.toUpperCase() + '</span></td>' +
      '<td>' + n.message + '</td>' +
      '<td><span class="status status--' + (n.status === 'pendiente' ? 'transito' : 'entregado') + '">' + (n.status === 'pendiente' ? 'Pendiente' : 'Leída') + '</span></td>' +
      '<td>' + (n.status !== 'leida' ? '<button class="btn btn--primary btn--sm btn-notif-read" data-id="' + n.id + '">Marcar Leída</button>' : '—') + '</td>';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-notif-read').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var nid = btn.getAttribute('data-id');
      var n = notifications.find(function(x) { return x.id === nid; });
      if (n) {
        n.status = 'leida';
        saveNotifications(notifications);
        refreshAllData();
      }
    });
  });
}

var btnClearNotifications = document.getElementById('btnClearNotifications');
if (btnClearNotifications) {
  btnClearNotifications.addEventListener('click', function() {
    if (confirm('¿Borrar todas las notificaciones?')) {
      notifications = [];
      saveNotifications(notifications);
      refreshAllData();
      showToast('Notificaciones limpiadas');
    }
  });
}

// ===================== AUDITORÍA =====================
function renderAuditLog() {
  var tbody = document.getElementById('auditTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  var log = [];
  try {
    var data = localStorage.getItem('epk_audit_log');
    if (data) log = JSON.parse(data);
  } catch(e) {}
  if (log.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state"><p>No hay entradas de auditoría.</p></td></tr>';
    return;
  }
  log.slice(0, 100).forEach(function(entry) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + formatDate(entry.time) + '</td>' +
      '<td><span class="status status--transito">' + (entry.action || '—') + '</span></td>' +
      '<td><pre style="margin:0;font-family:var(--font-mono);font-size:12px;white-space:pre-wrap;">' + JSON.stringify(entry.details || {}) + '</pre></td>';
    tbody.appendChild(tr);
  });
}

var btnClearAudit = document.getElementById('btnClearAudit');
if (btnClearAudit) {
  btnClearAudit.addEventListener('click', function() {
    if (confirm('¿Borrar historial de auditoría?')) {
      localStorage.removeItem('epk_audit_log');
      refreshAllData();
      showToast('Historial de auditoría limpiado');
    }
  });
}

// ===================== BACKUP =====================
function updateBackupStats() {
  var elLast = document.getElementById('kpi-backup-last');
  var elRecords = document.getElementById('kpi-backup-records');
  var elSize = document.getElementById('kpi-backup-size');
  var lastBackup = localStorage.getItem('epk_last_backup');
  if (elLast) elLast.textContent = lastBackup ? formatDate(lastBackup) : 'Nunca';
  var totalRecords = packages.length + cars.length + leads.length + tasks.length + employees.length + expenses.length + providers.length + notifications.length;
  if (elRecords) elRecords.textContent = totalRecords;
  var dataStr = JSON.stringify({
    packages: packages,
    cars: cars,
    leads: leads,
    tasks: tasks,
    employees: employees,
    expenses: expenses,
    providers: providers,
    notifications: notifications
  });
  var sizeKB = Math.round((new Blob([dataStr]).size / 1024) * 100) / 100;
  if (elSize) elSize.textContent = sizeKB + ' KB';
}

var btnBackupExport = document.getElementById('btnBackupExport');
if (btnBackupExport) {
  btnBackupExport.addEventListener('click', function() {
    var backup = {
      date: new Date().toISOString(),
      version: '1.0',
      data: {
        packages: packages,
        cars: cars,
        leads: leads,
        tasks: tasks,
        employees: employees,
        expenses: expenses,
        providers: providers,
        notifications: notifications
      }
    };
    var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'epikaizo_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem('epk_last_backup', new Date().toISOString());
    updateBackupStats();
    addAuditEntry('backup_exported', { date: new Date().toISOString() });
    showToast('Backup exportado correctamente');
  });
}

var btnBackupImport = document.getElementById('btnBackupImport');
var backupFileInput = document.getElementById('backupFileInput');
if (btnBackupImport && backupFileInput) {
  btnBackupImport.addEventListener('click', function() {
    backupFileInput.click();
  });
  backupFileInput.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(evt) {
      try {
        var backup = JSON.parse(evt.target.result);
        if (backup.data) {
          if (confirm('¿Restaurar backup? Se sobrescribirán todos los datos actuales.')) {
            packages = backup.data.packages || [];
            savePackages(packages);
            cars = backup.data.cars || [];
            saveCars(cars);
            leads = backup.data.leads || [];
            saveLeads(leads);
            tasks = backup.data.tasks || [];
            saveTasks(tasks);
            employees = backup.data.employees || [];
            saveEmployees(employees);
            expenses = backup.data.expenses || [];
            saveExpenses(expenses);
            providers = backup.data.providers || [];
            saveProviders(providers);
            notifications = backup.data.notifications || [];
            saveNotifications(notifications);
            addAuditEntry('backup_imported', { date: new Date().toISOString() });
            refreshAllData();
            showToast('Backup restaurado correctamente');
          }
        } else {
          showToast('Formato de backup inválido');
        }
      } catch(err) {
        showToast('Error al leer backup: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
}

var btnClearAllData = document.getElementById('btnClearAllData');
if (btnClearAllData) {
  btnClearAllData.addEventListener('click', function() {
    if (confirm('¿Borrar TODOS los datos? Esta acción no se puede deshacer.')) {
      packages = []; savePackages(packages);
      cars = []; saveCars(cars);
      leads = []; saveLeads(leads);
      tasks = []; saveTasks(tasks);
      employees = []; saveEmployees(employees);
      expenses = []; saveExpenses(expenses);
      providers = []; saveProviders(providers);
      notifications = []; saveNotifications(notifications);
      addAuditEntry('all_data_cleared', {});
      refreshAllData();
      showToast('Todos los datos han sido eliminados');
    }
  });
}

// ===================== ACTUALIZAR REFRESH ALL =====================
function calculateExpenseKPIs() {
  var now = new Date();
  var startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  var monthExpenses = expenses.filter(function(e) { return e.date && new Date(e.date) >= startOfMonth; });
  var monthTotal = monthExpenses.reduce(function(s, e) { return s + Number(e.amount); }, 0);
  var fixedTotal = expenses.filter(function(e) { return e.type === 'fijo'; }).reduce(function(s, e) { return s + Number(e.amount); }, 0);
  var totalIncome = packages.reduce(function(s, p) { return s + Number(p.financial.total); }, 0);
  var netBalance = totalIncome - expenses.reduce(function(s, e) { return s + Number(e.amount); }, 0);

  var elMonth = document.getElementById('kpi-exp-month');
  var elFixed = document.getElementById('kpi-exp-fixed');
  var elNet = document.getElementById('kpi-exp-net');
  if (elMonth) elMonth.textContent = formatMoney(monthTotal);
  if (elFixed) elFixed.textContent = formatMoney(fixedTotal);
  if (elNet) elNet.textContent = formatMoney(netBalance);
}

function refreshAllData() {
  calculateOverviewKPIs();
  renderOverviewTable(packages);
  renderPackagesTable();
  renderServicesTable();
  renderMoneyTable();
  renderClientsTable();
  renderDeliveriesTable();
  renderFinanceTable();
  renderFinanceMovementsTable();
  renderFinanceSummaryTable();
  calculateFinanceKPIs();
  renderReportsTable();
  renderMessages();
  renderOrders();
  renderGlobalHistory();
  refreshCarData();
  renderCharts();
  renderEmployees();
  renderExpenses();
  calculateExpenseKPIs();
  renderProviders();
  renderNotifications();
  renderAuditLog();
  updateBackupStats();
  applyDataMasks();
  renderInvoicesTable();
}

function applyDataMasks() {
  var settings = getSettings();
  if (settings.maskPhones) {
    document.querySelectorAll('.person-sub').forEach(function(el) {
      var text = el.textContent.trim();
      if (text && text !== '-' && /^[+\d\s()-]{7,}$/.test(text)) {
        el.textContent = '****' + text.slice(-4);
      }
    });
  }
  if (settings.maskDocs) {
    document.querySelectorAll('td').forEach(function(td) {
      var text = td.textContent.trim();
      if (text && /^[A-Z0-9]{6,12}$/.test(text) && td.querySelector('.code')) {
        td.textContent = '****';
      }
    });
  }
}

// ===================== FINANCE BUTTONS & FILTERS =====================
var btnAddFinIncome = document.getElementById('btnAddFinIncome');
var btnAddFinExpense = document.getElementById('btnAddFinExpense');

if (btnAddFinIncome) {
  btnAddFinIncome.addEventListener('click', function() {
    var concept = prompt('Concepto del ingreso (ej. Comisión paquete, Transferencia):');
    if (!concept) return;
    var amount = parseFloat(prompt('Monto del ingreso:') || '0');
    if (isNaN(amount) || amount <= 0) { showToast('Monto inválido'); return; }
    var inc = {
      id: 'INC-' + Math.floor(100 + Math.random() * 900),
      date: new Date().toISOString(),
      concept: concept,
      amount: amount
    };
    incomes.push(inc);
    saveIncomes(incomes);
    addAuditEntry('income_created', { id: inc.id, concept: inc.concept, amount: inc.amount });
    createInApi('incomes', { concept: inc.concept, amount: inc.amount, date: inc.date }).catch(() => {});
    refreshAllData();
    showToast('Ingreso ' + inc.id + ' registrado');
  });
}

if (btnAddFinExpense) {
  btnAddFinExpense.addEventListener('click', function() {
    var category = prompt('Categoría (ej. Alquiler, Luz, Gasolina, Sueldos):');
    if (!category) return;
    var concept = prompt('Concepto:') || category;
    var amount = parseFloat(prompt('Monto:') || '0');
    if (isNaN(amount) || amount <= 0) { showToast('Monto inválido'); return; }
    var type = confirm('¿Es un gasto fijo?') ? 'fijo' : 'variable';
    var exp = {
      id: 'EXP-' + Math.floor(100 + Math.random() * 900),
      date: new Date().toISOString(),
      category: category,
      concept: concept,
      amount: amount,
      type: type
    };
    expenses.push(exp);
    saveExpenses(expenses);
    addAuditEntry('expense_created', { id: exp.id, category: exp.category, amount: exp.amount, type: exp.type });
    createInApi('expenses', { category: exp.category, concept: exp.concept, amount: exp.amount, type: exp.type, date: exp.date }).catch(() => {});
    refreshAllData();
    showToast('Gasto ' + exp.id + ' registrado');
  });
}

var filterFinMovType = document.getElementById('filterFinMovType');
var filterFinMovPeriod = document.getElementById('filterFinMovPeriod');
var filterFinSummaryPeriod = document.getElementById('filterFinSummaryPeriod');

if (filterFinMovType) filterFinMovType.addEventListener('change', function() { financeMovTypeFilter = filterFinMovType.value; renderFinanceMovementsTable(); });
if (filterFinMovPeriod) filterFinMovPeriod.addEventListener('change', function() { financeMovPeriodFilter = filterFinMovPeriod.value; renderFinanceMovementsTable(); renderFinanceSummaryTable(); });
if (filterFinSummaryPeriod) filterFinSummaryPeriod.addEventListener('change', function() { renderFinanceSummaryTable(); });

var filterServiceType = document.getElementById('filterServiceType');
var filterServiceStatus = document.getElementById('filterServiceStatus');
var searchServices = document.getElementById('searchServices');
if (filterServiceType) filterServiceType.addEventListener('change', renderServicesTable);
if (filterServiceStatus) filterServiceStatus.addEventListener('change', renderServicesTable);
if (searchServices) searchServices.addEventListener('input', renderServicesTable);

// Client filters
var searchClients = document.getElementById('searchClients');
var filterClientCity = document.getElementById('filterClientCity');
var filterClientType = document.getElementById('filterClientType');
var filterClientDateFrom = document.getElementById('filterClientDateFrom');
var filterClientDateTo = document.getElementById('filterClientDateTo');
if (searchClients) searchClients.addEventListener('input', renderClientsTable);
if (filterClientCity) filterClientCity.addEventListener('change', renderClientsTable);
if (filterClientType) filterClientType.addEventListener('change', renderClientsTable);
if (filterClientDateFrom) filterClientDateFrom.addEventListener('change', renderClientsTable);
if (filterClientDateTo) filterClientDateTo.addEventListener('change', renderClientsTable);

// ===================== INIT =====================
console.log('Dashboard init starting...');
initDashboard();

var statsRange = document.getElementById('statsRange');
var statsFrom = document.getElementById('statsFrom');
var statsTo = document.getElementById('statsTo');
if (statsRange) statsRange.addEventListener('change', renderCharts);
if (statsFrom) statsFrom.addEventListener('change', renderCharts);
if (statsTo) statsTo.addEventListener('change', renderCharts);

window.addEventListener('resize', function() {
  renderCharts();
});
console.log('Dashboard init complete');

// ===================== WHATSAPP PANEL =====================
(function initWhatsappPanel() {
  var toggle = document.getElementById('whatsappPanelToggle');
  var win = document.getElementById('whatsappPanelWindow');
  var close = document.getElementById('whatsappPanelClose');
  var container = document.getElementById('whatsappMessages');
  var badge = document.getElementById('whatsappBadge');
  if (!toggle || !win || !container) return;

  function openPanel() {
    win.classList.add('is-open');
    loadWhatsappMessages();
  }
  function closePanel() {
    win.classList.remove('is-open');
  }

  toggle.addEventListener('click', openPanel);
  close.addEventListener('click', closePanel);

  function renderMessage(msg) {
    var div = document.createElement('div');
    div.className = 'whatsapp-panel__message whatsapp-panel__message--' + msg.type;
    div.innerHTML = '<div class="whatsapp-panel__meta">' + formatDate(msg.date) + ' · ' + escapeHtml(msg.from) + '</div>' + escapeHtml(msg.text);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function loadWhatsappMessages() {
    var token = localStorage.getItem('epk_token');
    fetch('http://localhost:3001/api/whatsapp/messages', {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        container.innerHTML = '';
        if (!data.messages || !data.messages.length) {
          container.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 11.5a8.5 8.5 0 1 1-4.6-7.56"/><path d="M21 4v5h-5"/></svg><p>No hay mensajes aún. Configura el webhook de WhatsApp Business para recibirlos aquí.</p></div>';
          if (badge) badge.hidden = true;
          return;
        }
        if (badge) {
          var unread = data.messages.filter(function(m) { return !m.read; }).length;
          if (unread > 0) {
            badge.hidden = false;
            badge.textContent = unread > 99 ? '99+' : unread;
          } else {
            badge.hidden = true;
          }
        }
        data.messages.forEach(function(msg) {
          renderMessage(msg);
        });
      })
      .catch(function() {
        container.innerHTML = '<div class="empty-state"><p>Error al cargar mensajes. Verifica el servidor.</p></div>';
      });
  }

  setInterval(function() {
    if (win.classList.contains('is-open')) {
      loadWhatsappMessages();
    }
  }, 15000);
})();

// ===================== EMAIL PANEL =====================
(function initEmailPanel() {
  var toggle = document.getElementById('emailPanelToggle');
  var win = document.getElementById('emailPanelWindow');
  var close = document.getElementById('emailPanelClose');
  var container = document.getElementById('emailMessages');
  var badge = document.getElementById('emailBadge');
  if (!toggle || !win || !container) return;

  function openPanel() {
    win.classList.add('is-open');
    loadEmailMessages();
  }
  function closePanel() {
    win.classList.remove('is-open');
  }

  toggle.addEventListener('click', openPanel);
  close.addEventListener('click', closePanel);

  function renderEmailMessage(msg) {
    var div = document.createElement('div');
    div.className = 'email-panel__message email-panel__message--incoming';
    var from = msg.from || '';
    var subject = msg.subject || '';
    var body = msg.body || msg.snippet || '';
    var date = msg.date || '';
    var meta = escapeHtml(from);
    if (subject) meta += ' · ' + escapeHtml(subject);
    div.innerHTML = '<div class="email-panel__meta">' + escapeHtml(formatDate(date)) + ' · ' + meta + '</div>' + escapeHtml(body);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function loadEmailMessages() {
    var token = localStorage.getItem('epk_token');
    fetch('/api/gmail/emails?max=20', {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        container.innerHTML = '';
        var messages = data.messages || [];
        if (!messages.length) {
          container.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 11.5a8.5 8.5 0 1 1-4.6-7.56"/><path d="M21 4v5h-5"/></svg><p>No hay correos aún. Configura Gmail API para ver tus correos aquí.</p></div>';
          if (badge) badge.hidden = true;
          return;
        }
        if (badge) {
          badge.hidden = false;
          badge.textContent = messages.length > 99 ? '99+' : messages.length;
        }
        messages.forEach(function(msg) {
          renderEmailMessage(msg);
        });
      })
      .catch(function() {
        container.innerHTML = '<div class="empty-state"><p>Error al cargar correos de Gmail. Verifica las credenciales.</p></div>';
      });
  }

  setInterval(function() {
    if (win.classList.contains('is-open')) {
      loadEmailMessages();
    }
  }, 15000);
})();

// ===================== MODAL: REGISTRAR INGRESO / GASTO FINANCIERO =====================
(function() {
  var overlay = document.getElementById('modalFinanceOverlay');
  var closeBtn = document.getElementById('btnCloseFinanceModal');
  var form = document.getElementById('formNewFinance');
  var btnIncome = document.getElementById('btnAddFinIncome');
  var btnExpense = document.getElementById('btnAddFinExpense');
  var titleEl = document.getElementById('financeModalTitle');

  function openModal(type) {
    if (!overlay) return;
    if (titleEl) titleEl.textContent = type === 'ingreso' ? 'Registrar Ingreso' : 'Registrar Gasto';
    var sel = document.getElementById('f_finType');
    if (sel) sel.value = type;
    var dateEl = document.getElementById('f_finDate');
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    overlay.classList.add('is-open');
  }
  function closeModal() { if (overlay) overlay.classList.remove('is-open'); }

  if (btnIncome) btnIncome.addEventListener('click', function() { openModal('ingreso'); });
  if (btnExpense) btnExpense.addEventListener('click', function() { openModal('gasto'); });
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (overlay) overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

  if (form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var type = (document.getElementById('f_finType') || {}).value || 'ingreso';
      var concept = (document.getElementById('f_finConcept') || {}).value || '';
      var category = (document.getElementById('f_finCategory') || {}).value || 'operativo';
      var amount = parseFloat((document.getElementById('f_finAmount') || {}).value) || 0;
      var ref = (document.getElementById('f_finRef') || {}).value || '';
      var date = (document.getElementById('f_finDate') || {}).value || new Date().toISOString();

      var entry = { id: 'MOV-' + Math.floor(100000 + Math.random() * 900000), type: type, concept: concept, category: category, amount: amount, ref: ref, date: date };

      if (type === 'ingreso') {
        if (typeof incomes !== 'undefined') { incomes.push(entry); try { localStorage.setItem('epk_incomes', JSON.stringify(incomes)); } catch(e){} }
      } else {
        if (typeof expenses !== 'undefined') { expenses.push(entry); try { localStorage.setItem('epk_expenses', JSON.stringify(expenses)); } catch(e){} }
      }

      if (typeof addAuditEntry === 'function') addAuditEntry('finance_' + type, entry);
      if (typeof refreshAllData === 'function') refreshAllData();
      if (typeof showToast === 'function') showToast((type === 'ingreso' ? 'Ingreso' : 'Gasto') + ' registrado: ' + formatMoney(amount));
      form.reset();
      closeModal();
    });
  }
})();

// ===================== MODAL: REGISTRAR ENVÍO DE DINERO =====================
(function() {
  var overlay = document.getElementById('modalMoneyOverlay');
  var closeBtn = document.getElementById('btnCloseMoneyModal');
  var form = document.getElementById('formNewMoney');
  var openBtn = document.getElementById('btnNuevoEnvioDinero');

  function openModal() { if (overlay) overlay.classList.add('is-open'); }
  function closeModal() { if (overlay) overlay.classList.remove('is-open'); }

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (overlay) overlay.addEventListener('click', function(e) { if (e.target === overlay) closeModal(); });

  if (form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var senderName = (document.getElementById('f_monSenderName') || {}).value || '';
      var senderPhone = (document.getElementById('f_monSenderPhone') || {}).value || '';
      var recName = (document.getElementById('f_monRecName') || {}).value || '';
      var recPhone = (document.getElementById('f_monRecPhone') || {}).value || '';
      var city = (document.getElementById('f_monCity') || {}).value || '';
      var dest = (document.getElementById('f_monDest') || {}).value || 'local';
      var amount = parseFloat((document.getElementById('f_monAmount') || {}).value) || 0;
      var fee = parseFloat((document.getElementById('f_monFee') || {}).value) || 0;
      var status = (document.getElementById('f_monStatus') || {}).value || 'pendiente';

      var code = 'DIN-' + Math.floor(100000 + Math.random() * 900000);
      var entry = { id: code, code: code, senderName: senderName, senderPhone: senderPhone, recName: recName, recPhone: recPhone, city: city, dest: dest, amount: amount, fee: fee, status: status, date: new Date().toISOString() };

      if (typeof moneyTransfers !== 'undefined') {
        moneyTransfers.push(entry);
        try { localStorage.setItem('epk_money', JSON.stringify(moneyTransfers)); } catch(er) {}
      }

      if (typeof addAuditEntry === 'function') addAuditEntry('money_created', { id: code, sender: senderName, amount: amount });
      if (typeof refreshAllData === 'function') refreshAllData();
      if (typeof showToast === 'function') showToast('Envío de dinero ' + code + ' registrado');
      form.reset();
      closeModal();
    });
  }
})();

// ===================== NAV: PEDIDOS =====================
(function() {
  var navOrders = document.getElementById('nav-orders');
  if (navOrders) {
    navOrders.addEventListener('click', function(e) {
      e.preventDefault();
      // Reuse the same tab-switching mechanism as other nav links
      document.querySelectorAll('#sidebarNav a[data-tab]').forEach(function(a) { a.classList.remove('is-active'); });
      document.querySelectorAll('.tab-pane').forEach(function(p) { p.classList.remove('is-active'); });
      navOrders.classList.add('is-active');
      var pane = document.getElementById('tab-orders');
      if (pane) pane.classList.add('is-active');
      var pageTitle = document.getElementById('pageTitle');
      var pageSub = document.getElementById('pageSub');
      if (pageTitle) pageTitle.textContent = 'Pedidos de Vehículos';
      if (pageSub) pageSub.textContent = 'Gestión de pedidos y solicitudes';
    });
  }
})();
