// Configuración (misma API que el proyecto Java)
const API_URL = '/api/grafos';
const CACHE_KEY = 'grafo_rutas_cache';
const CACHE_VERSION = '1.0'; // Cambiar versión para invalidar caché

/** Paleta visual del mapa (nodos, etiquetas y aristas) */
const MAP_STYLES = {
    nodo: {
        normal:   { fill: '#0ea5e9', stroke: '#ffffff', radius: 7 },
        centro:   { fill: '#10b981', stroke: '#ffffff', radius: 10 },
        radio:    { fill: '#f59e0b', stroke: '#ffffff', radius: 11 },
        diametro: { fill: '#ef4444', stroke: '#ffffff', radius: 9 }
    },
    arista: {
        carretera: { color: '#0284c7', weight: 3, opacity: 0.65, dashArray: null },
        recta:     { color: '#94a3b8', weight: 2, opacity: 0.5, dashArray: '6 8' },
        ruta:      { color: '#d97706', weight: 5, opacity: 0.88, dashArray: '12 8' },
        ciclo:     { color: '#059669', weight: 4, opacity: 0.8, dashArray: null }
    }
};

/** Vista inicial del mapa (Bogotá y región central) */
const VISTA_INICIAL = {
    centro: [4.653, -74.084],
    zoom: 9
};

function uiIcon(name) {
    return `<i class="fi fi-rr-${name} fi-btn"></i>`;
}

function setToggleBtn(btn, iconName, label, isOpen, closeLabel) {
    if (!btn) return;
    btn.innerHTML = isOpen
        ? `${uiIcon('cross-small')} ${closeLabel || 'Cerrar'}`
        : `${uiIcon(iconName)} ${label}`;
}

function openDrawer(shellId) {
    document.querySelectorAll('.tool-drawer.drawer-open').forEach(d => {
        if (d.id !== shellId) closeDrawer(d.id);
    });
    const shell = document.getElementById(shellId);
    if (!shell) return;
    shell.classList.add('drawer-open');
    shell.setAttribute('aria-hidden', 'false');
    shell.querySelector('.drawer-panel')?.classList.add('open');
}

function closeDrawer(shellId) {
    const shell = document.getElementById(shellId);
    if (!shell) return;
    shell.classList.remove('drawer-open');
    shell.setAttribute('aria-hidden', 'true');
    shell.querySelector('.drawer-panel')?.classList.remove('open');
}

function closeAllDrawers() {
    ['excentricidadesPanel', 'rutasPanel', 'ciclosPanel'].forEach(closeDrawer);
}

function isDrawerOpen(shellId) {
    return document.getElementById(shellId)?.classList.contains('drawer-open') ?? false;
}

function initDrawerUi() {
    document.querySelectorAll('[data-drawer]').forEach(el => {
        el.addEventListener('click', () => closeDrawer(el.getAttribute('data-drawer')));
    });
}

// Variables globales
let map;
let markers = [];
let markerObjects = {}; // Para acceso a markers por ID
let connections = [];
let nodosData = [];
let conexionesData = [];
let allNodeItems = []; // Para el filtrado
let rutasCache = {}; // Caché en memoria de las rutas
let useRoadRoutes = true; // Toggle entre rutas de carretera y líneas rectas
let nodosCentroIds = new Set(); // IDs de los 3 nodos con menor excentricidad
let nodosRadioIds = new Set(); // IDs de los nodos con excentricidad = radio
let nodosDiametroIds = new Set(); // IDs de los nodos con excentricidad = diámetro
let eccFiltroTipo = 'all';
let eccDataCompleta = null;
let eccRutaLayer = null;

/**
 * Cierra todos los modales abiertos
 */
function cerrarTodosLosModales() {
    closeAllDrawers();
}

/**
 * Actualiza el estado activo de los botones del header
 */
function actualizarBotonesActivos(botonActivoId) {
    // Remover clase active de todos los botones
    document.querySelectorAll('.nav-btn, .cache-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Agregar clase active al botón seleccionado
    if (botonActivoId) {
        const botonActivo = document.getElementById(botonActivoId);
        if (botonActivo) {
            botonActivo.classList.add('active');
        }
    }
}

/**
 * Carga el caché de rutas desde localStorage
 */
function cargarCacheRutas() {
    try {
        const cacheData = localStorage.getItem(CACHE_KEY);
        if (cacheData) {
            const cache = JSON.parse(cacheData);
            // Verificar versión del caché
            if (cache.version === CACHE_VERSION) {
                rutasCache = cache.rutas || {};
                console.log(`Caché cargado: ${Object.keys(rutasCache).length} rutas en caché`);
                return true;
            } else {
                console.log('Versión de caché obsoleta, se recalcularán las rutas');
                localStorage.removeItem(CACHE_KEY);
            }
        }
    } catch (error) {
        console.error('Error al cargar caché:', error);
    }
    return false;
}

/**
 * Guarda el caché de rutas en localStorage
 */
function guardarCacheRutas() {
    try {
        const cacheData = {
            version: CACHE_VERSION,
            rutas: rutasCache,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        console.log(`Caché guardado: ${Object.keys(rutasCache).length} rutas`);
    } catch (error) {
        console.error('Error al guardar caché:', error);
    }
}

/**
 * Inicializa el mapa
 */
function initMap() {
    map = L.map('map').setView(VISTA_INICIAL.centro, VISTA_INICIAL.zoom);

    // Añadir capa de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);

    setTimeout(() => map.invalidateSize(), 150);
}

/**
 * Carga los datos desde la API
 */
async function cargarDatos() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        nodosData = data.nodos;
        conexionesData = data.conexiones;

        // Actualizar estadísticas
        document.getElementById('totalNodos').textContent = nodosData.length;
        document.getElementById('totalConexiones').textContent = conexionesData.length;

        // Dibujar en el mapa
        dibujarNodos();
        await dibujarConexiones(); // Ahora es asíncrona
        
        // Cargar lista de nodos en el sidebar
        cargarListaNodos();

        // Ocultar loading
        document.getElementById('loading').style.display = 'none';

        // Mantener vista centrada en Bogotá al cargar
        map.setView(VISTA_INICIAL.centro, VISTA_INICIAL.zoom);

    } catch (error) {
        console.error('Error al cargar datos:', error);
        document.getElementById('loading').innerHTML = 
            '<div style="color: #c33;">Error al cargar datos. Verifica que el servidor esté corriendo.</div>';
    }
}

/**
 * Dibuja los nodos en el mapa
 */
function dibujarNodos() {
    nodosData.forEach(nodo => {
        // Determinar color y tamaño según categoría del nodo
        const esCentro = nodosCentroIds.has(nodo.id);
        const esRadio = nodosRadioIds.has(nodo.id);
        const esDiametro = nodosDiametroIds.has(nodo.id);
        
        let estilo, badge;
        
        if (esRadio) {
            estilo = MAP_STYLES.nodo.radio;
            badge = 'Radio del grafo';
        } else if (esCentro) {
            estilo = MAP_STYLES.nodo.centro;
            badge = 'Centro del grafo';
        } else if (esDiametro) {
            estilo = MAP_STYLES.nodo.diametro;
            badge = 'Diámetro del grafo';
        } else {
            estilo = MAP_STYLES.nodo.normal;
            badge = '';
        }
        
        const marker = L.circleMarker([nodo.latitud, nodo.longitud], {
            radius: estilo.radius,
            fillColor: estilo.fill,
            color: estilo.stroke,
            weight: 2.5,
            opacity: 1,
            fillOpacity: 0.9
        }).addTo(map);

        const specialLabel = badge
            ? `<div class="popup-badge" style="background:${estilo.fill}22;color:${estilo.fill};border:1px solid ${estilo.fill}66">${badge}</div>`
            : '';
        const popupContent = `
            <div class="popup-title">${nodo.nombre}</div>
            ${specialLabel}
            <div class="popup-info"><strong>ID:</strong> ${nodo.id}</div>
            <div class="popup-info"><strong>Lat:</strong> ${nodo.latitud.toFixed(6)}</div>
            <div class="popup-info"><strong>Lng:</strong> ${nodo.longitud.toFixed(6)}</div>
        `;
        marker.bindPopup(popupContent);

        // Añadir tooltip con el nombre
        let tooltipClass = 'node-label';
        if (esRadio) tooltipClass += ' node-label-radio';
        else if (esCentro) tooltipClass += ' node-label-centro';
        else if (esDiametro) tooltipClass += ' node-label-diametro';
        
        marker.bindTooltip(nodo.nombre, {
            permanent: true,
            direction: 'top',
            className: tooltipClass,
            offset: [0, -(estilo.radius + 14)]
        });

        // Respetar el estado del checkbox de etiquetas
        const showLabels = document.getElementById('showLabels');
        if (showLabels && !showLabels.checked) {
            marker.closeTooltip();
        }

        markers.push(marker);
        markerObjects[nodo.id] = { marker: marker, nodo: nodo };
    });
}

/**
 * Dibuja las conexiones usando rutas reales por carretera
 */
async function dibujarConexiones() {
    if (!conexionesData || conexionesData.length === 0) return;
    
    // Si está en modo línea recta, dibujar directamente
    if (!useRoadRoutes) {
        conexionesData.forEach(conexion => {
            const nodoOrigen = nodosData.find(n => n.id === conexion.origen);
            const nodoDestino = nodosData.find(n => n.id === conexion.destino);
            if (nodoOrigen && nodoDestino) {
                dibujarLineaRecta(nodoOrigen, nodoDestino, conexion);
            }
        });
        return;
    }
    
    // Modo carretera: cargar caché al inicio
    const cacheCargado = cargarCacheRutas();
    
    // Contar rutas que necesitan calcularse
    const rutasPorCalcular = conexionesData.filter(conexion => {
        const cacheKey = `${conexion.origen}-${conexion.destino}`;
        return !rutasCache[cacheKey];
    });
    
    if (rutasPorCalcular.length === 0) {
        console.log('Todas las rutas están en caché, dibujando directamente...');
        // Dibujar todas desde caché
        conexionesData.forEach(conexion => dibujarRutaDesdeCacheOLinea(conexion));
        return;
    }
    
    console.log(`${rutasPorCalcular.length} rutas nuevas por calcular (${conexionesData.length - rutasPorCalcular.length} en caché)`);
    showRoutingSpinner();
    
    let rutasCalculadas = 0;
    const totalRutas = conexionesData.length;
    
    // Primero dibujar las que están en caché
    const rutasEnCache = conexionesData.filter(conexion => {
        const cacheKey = `${conexion.origen}-${conexion.destino}`;
        return rutasCache[cacheKey];
    });
    
    rutasEnCache.forEach(conexion => {
        dibujarRutaDesdeCacheOLinea(conexion);
        rutasCalculadas++;
    });
    updateRoutingProgress(rutasCalculadas, totalRutas);
    
    // Procesar rutas nuevas en lotes
    const batchSize = 5;
    
    for (let i = 0; i < rutasPorCalcular.length; i += batchSize) {
        const batch = rutasPorCalcular.slice(i, i + batchSize);
        const promises = batch.map(conexion => calcularRutaCarretera(conexion));
        
        await Promise.all(promises);
        
        rutasCalculadas += batch.length;
        updateRoutingProgress(rutasCalculadas, totalRutas);
        
        // Pequeña pausa entre lotes
        if (i + batchSize < rutasPorCalcular.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    // Guardar caché después de calcular
    guardarCacheRutas();
    
    hideRoutingSpinner();
    console.log(`${rutasCalculadas} rutas calculadas correctamente`);
}

/**
 * Calcula una ruta por carretera entre dos nodos
 */
async function calcularRutaCarretera(conexion) {
    const nodoOrigen = nodosData.find(n => n.id === conexion.origen);
    const nodoDestino = nodosData.find(n => n.id === conexion.destino);
    
    if (!nodoOrigen || !nodoDestino) {
        console.warn(`No se encontraron nodos para ${conexion.origen} -> ${conexion.destino}`);
        return;
    }
    
    const cacheKey = `${conexion.origen}-${conexion.destino}`;
    
    // Verificar si ya está en caché
    if (rutasCache[cacheKey]) {
        dibujarRutaDesdeCacheOLinea(conexion);
        return;
    }
    
    try {
        // OSRM API para calcular ruta real
        const url = `https://router.project-osrm.org/route/v1/driving/${nodoOrigen.longitud},${nodoOrigen.latitud};${nodoDestino.longitud},${nodoDestino.latitud}?overview=full&geometries=geojson`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const coordinates = route.geometry.coordinates;
            
            // Convertir [lon, lat] a [lat, lon] para Leaflet
            const latLngs = coordinates.map(coord => [coord[1], coord[0]]);
            
            // Guardar en caché
            rutasCache[cacheKey] = {
                latLngs: latLngs,
                distance: route.distance
            };
            
            const polyline = L.polyline(latLngs, estiloArista('carretera')).addTo(map);
            
            const distanciaRuta = (route.distance / 1000).toFixed(2);
            const popupContent = `
                <div class="popup-title">Ruta por Carretera</div>
                <div class="popup-info"><strong>Origen:</strong> ${nodoOrigen.nombre}</div>
                <div class="popup-info"><strong>Destino:</strong> ${nodoDestino.nombre}</div>
                <div class="popup-info"><strong>Distancia directa:</strong> ${conexion.distanciaKm.toFixed(2)} km</div>
                <div class="popup-info"><strong>Distancia por carretera:</strong> ${distanciaRuta} km</div>
            `;
            polyline.bindPopup(popupContent);
            
            connections.push(polyline);
        } else {
            // Fallback: línea recta
            dibujarLineaRecta(nodoOrigen, nodoDestino, conexion);
        }
    } catch (error) {
        console.error(`Error al calcular ruta:`, error);
        dibujarLineaRecta(nodoOrigen, nodoDestino, conexion);
    }
}

/**
 * Dibuja una ruta desde el caché o línea recta si no existe
 */
function dibujarRutaDesdeCacheOLinea(conexion) {
    const nodoOrigen = nodosData.find(n => n.id === conexion.origen);
    const nodoDestino = nodosData.find(n => n.id === conexion.destino);
    
    if (!nodoOrigen || !nodoDestino) return;
    
    const cacheKey = `${conexion.origen}-${conexion.destino}`;
    const rutaCacheada = rutasCache[cacheKey];
    
    if (rutaCacheada) {
        // Dibujar ruta desde caché
        const polyline = L.polyline(rutaCacheada.latLngs, estiloArista('carretera')).addTo(map);
        
        const distanciaRuta = (rutaCacheada.distance / 1000).toFixed(2);
        const popupContent = `
            <div class="popup-title">Ruta por Carretera (caché)</div>
            <div class="popup-info"><strong>Origen:</strong> ${nodoOrigen.nombre}</div>
            <div class="popup-info"><strong>Destino:</strong> ${nodoDestino.nombre}</div>
            <div class="popup-info"><strong>Distancia directa:</strong> ${conexion.distanciaKm.toFixed(2)} km</div>
            <div class="popup-info"><strong>Distancia por carretera:</strong> ${distanciaRuta} km</div>
        `;
        polyline.bindPopup(popupContent);
        connections.push(polyline);
    } else {
        // Dibujar línea recta
        dibujarLineaRecta(nodoOrigen, nodoDestino, conexion);
    }
}

function estiloArista(tipo) {
    const s = MAP_STYLES.arista[tipo];
    const opts = { color: s.color, weight: s.weight, opacity: s.opacity, lineCap: 'round', lineJoin: 'round' };
    if (s.dashArray) opts.dashArray = s.dashArray;
    return opts;
}

/**
 * Dibuja línea recta (fallback cuando no hay ruta disponible)
 */
function dibujarLineaRecta(nodoOrigen, nodoDestino, conexion) {
    const polyline = L.polyline([
        [nodoOrigen.latitud, nodoOrigen.longitud],
        [nodoDestino.latitud, nodoDestino.longitud]
    ], estiloArista('recta')).addTo(map);

    const popupContent = `
        <div class="popup-title">Conexión</div>
        <div class="popup-info"><strong>Origen:</strong> ${nodoOrigen.nombre}</div>
        <div class="popup-info"><strong>Destino:</strong> ${nodoDestino.nombre}</div>
        <div class="popup-info"><strong>Distancia:</strong> ${conexion.distanciaKm.toFixed(2)} km</div>
    `;
    polyline.bindPopup(popupContent);

    connections.push(polyline);
}

/**
 * Carga la lista de nodos en el sidebar
 */
function cargarListaNodos() {
    const nodeList = document.getElementById('nodeList');
    nodeList.innerHTML = '';
    allNodeItems = [];

    nodosData.forEach(nodo => {
        const nodeItem = document.createElement('div');
        nodeItem.className = 'node-item';
        nodeItem.innerHTML = `
            <div class="node-item-id">${nodo.id}</div>
            <div class="node-item-name">${nodo.nombre}</div>
        `;
        
        // Click para centrar en el nodo
        nodeItem.addEventListener('click', () => {
            centrarEnNodo(nodo.id);
        });
        
        nodeList.appendChild(nodeItem);
        allNodeItems.push({ element: nodeItem, nodo: nodo });
    });
}

/**
 * Centra el mapa en un nodo específico
 */
function centrarEnNodo(nodoId) {
    const markerObj = markerObjects[nodoId];
    if (markerObj) {
        const { marker, nodo } = markerObj;
        
        // Centrar el mapa en el nodo
        map.setView([nodo.latitud, nodo.longitud], 12);
        
        // Abrir el popup
        marker.openPopup();
        
        // Resaltar temporalmente el marcador
        marker.setStyle({
            radius: 12,
            fillColor: '#ff6b6b',
            color: '#fff',
            weight: 3
        });
        
        // Restaurar estilo original después de 2 segundos
        setTimeout(() => {
            marker.setStyle({
                radius: MAP_STYLES.nodo.normal.radius,
                fillColor: MAP_STYLES.nodo.normal.fill,
                color: MAP_STYLES.nodo.normal.stroke,
                weight: 2.5
            });
        }, 2000);
    }
}

/**
 * Inicializa los controles de búsqueda
 */
function initBusqueda() {
    const searchBox = document.getElementById('searchBox');
    const panelContent = document.getElementById('nodePanelContent');
    
    searchBox.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        // Si hay texto de búsqueda, abrir automáticamente el panel
        if (searchTerm !== '' && !panelContent.classList.contains('open')) {
            panelContent.classList.add('open');
            setToggleBtn(document.getElementById('togglePanel'), 'list', 'Lista de municipios', true, 'Ocultar lista');
        }
        
        // Si se borra el texto de búsqueda, cerrar el panel
        if (searchTerm === '' && panelContent.classList.contains('open')) {
            panelContent.classList.remove('open');
            setToggleBtn(document.getElementById('togglePanel'), 'list', 'Lista de municipios', false);
        }
        
        // Filtrar nodos en la lista
        allNodeItems.forEach(({ element, nodo }) => {
            const matchId = nodo.id.toLowerCase().includes(searchTerm);
            const matchName = nodo.nombre.toLowerCase().includes(searchTerm);
            
            if (matchId || matchName || searchTerm === '') {
                element.style.display = 'block';
            } else {
                element.style.display = 'none';
            }
        });
        
        // Si solo hay un resultado, centrar automáticamente en él
        const visibleNodes = allNodeItems.filter(({ element }) => 
            element.style.display !== 'none'
        );
        
        if (visibleNodes.length === 1 && searchTerm !== '') {
            centrarEnNodo(visibleNodes[0].nodo.id);
        }
    });
    
    // Al presionar Enter, centrar en el primer resultado
    searchBox.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const visibleNodes = allNodeItems.filter(({ element }) => 
                element.style.display !== 'none'
            );
            
            if (visibleNodes.length > 0) {
                centrarEnNodo(visibleNodes[0].nodo.id);
            }
        }
    });
}

/**
 * Inicializa el toggle del panel de nodos
 */
function initNodePanelToggle() {
    document.getElementById('togglePanel').addEventListener('click', function() {
        const panelContent = document.getElementById('nodePanelContent');
        panelContent.classList.toggle('open');
        
        // Actualizar texto del botón
        if (panelContent.classList.contains('open')) {
            setToggleBtn(this, 'list', 'Lista de municipios', true, 'Ocultar lista');
        } else {
            setToggleBtn(this, 'list', 'Lista de municipios', false);
        }
    });
}

/**
 * Inicializa los controles de visibilidad
 */
function initControlesVisibilidad() {
    // Control de nodos
    document.getElementById('showNodes').addEventListener('change', (e) => {
        markers.forEach(marker => {
            if (e.target.checked) {
                marker.addTo(map);
            } else {
                map.removeLayer(marker);
            }
        });
    });

    // Control de conexiones
    document.getElementById('showConnections').addEventListener('change', (e) => {
        connections.forEach(connection => {
            if (e.target.checked) {
                connection.addTo(map);
            } else {
                map.removeLayer(connection);
            }
        });
    });

    // Control de etiquetas
    document.getElementById('showLabels').addEventListener('change', (e) => {
        markers.forEach(marker => {
            const tooltip = marker.getTooltip();
            if (tooltip) {
                if (e.target.checked) {
                    marker.openTooltip();
                } else {
                    marker.closeTooltip();
                }
            }
        });
    });
}

/**
 * Inicializa los controles de caché
 */
function initCacheControls() {
    // Botón recargar rutas
    document.getElementById('recargarRutas').addEventListener('click', recargarTodasLasRutas);
}

/**
 * Recarga todas las rutas: limpia caché y recalcula
 */
async function recargarTodasLasRutas() {
    const confirmar = confirm(
        '🔄 ¿Estás seguro de que deseas recalcular todas las rutas?\n\n' +
        'Esto eliminará el caché actual y calculará nuevamente las ' + conexionesData.length + ' rutas.\n' +
        'El proceso puede tomar 30-40 segundos.'
    );
    
    if (!confirmar) return;
    
    try {
        // Limpiar caché
        rutasCache = {};
        localStorage.removeItem(CACHE_KEY);
        console.log('✅ Caché limpiado');
        
        // Limpiar conexiones del mapa
        connections.forEach(conn => map.removeLayer(conn));
        connections = [];
        
        // Verificar que estamos en modo carretera
        if (!useRoadRoutes) {
            document.getElementById('roadRoute').checked = true;
            useRoadRoutes = true;
        }
        
        // Recalcular todas las rutas
        await dibujarConexiones();
        
        alert('✅ Rutas recalculadas correctamente y guardadas en caché.');
        
    } catch (error) {
        console.error('Error al recargar rutas:', error);
        alert('❌ Error al recargar las rutas. Revisa la consola para más detalles.');
    }
}

/**
 * Inicializa el toggle de tipo de ruta
 */
function initRouteTypeToggle() {
    const roadRoute = document.getElementById('roadRoute');
    const straightLine = document.getElementById('straightLine');
    
    roadRoute.addEventListener('change', () => {
        if (roadRoute.checked) {
            useRoadRoutes = true;
            redibujarConexiones();
        }
    });
    
    straightLine.addEventListener('change', () => {
        if (straightLine.checked) {
            useRoadRoutes = false;
            redibujarConexiones();
        }
    });
}

/**
 * Redibuja todas las conexiones según el modo seleccionado
 */
function redibujarConexiones() {
    // Limpiar conexiones existentes
    connections.forEach(conn => map.removeLayer(conn));
    connections = [];
    
    if (!conexionesData || conexionesData.length === 0) return;
    
    // Redibujar según el modo
    if (useRoadRoutes) {
        // Modo carretera: usar caché o dibujar líneas si no existe
        conexionesData.forEach(conexion => {
            dibujarRutaDesdeCacheOLinea(conexion);
        });
    } else {
        // Modo línea recta: siempre dibujar líneas
        conexionesData.forEach(conexion => {
            const nodoOrigen = nodosData.find(n => n.id === conexion.origen);
            const nodoDestino = nodosData.find(n => n.id === conexion.destino);
            if (nodoOrigen && nodoDestino) {
                dibujarLineaRecta(nodoOrigen, nodoDestino, conexion);
            }
        });
    }
}

/**
 * Muestra el indicador de progreso de cálculo de rutas
 */
function showRoutingSpinner() {
    const loading = document.getElementById('loading');
    loading.innerHTML = `
        <div class="loading-spinner"></div>
        <p>Cargando rutas...</p>
        <p id="routing-progress" style="font-size: 0.9em; margin-top: 10px;">0%</p>
    `;
    loading.style.display = 'flex';
}

/**
 * Oculta el indicador de progreso
 */
function hideRoutingSpinner() {
    document.getElementById('loading').style.display = 'none';
}

/**
 * Actualiza el progreso del cálculo de rutas
 */
function updateRoutingProgress(current, total) {
    const progressElement = document.getElementById('routing-progress');
    if (progressElement) {
        const percentage = Math.round((current / total) * 100);
        progressElement.textContent = `${percentage}% (${current}/${total} rutas)`;
    }
}

function focusNodoEnMapa(nodoId) {
    const marker = markerObjects[nodoId];
    if (marker) {
        map.setView([marker.nodo.latitud, marker.nodo.longitud], 12);
        marker.marker.openPopup();
    }
}

function renderCentrosChips(excentricidades, centros) {
    const list = document.getElementById('nodosCentroList');
    const countEl = document.getElementById('eccCentrosCount');
    const details = document.getElementById('eccCentrosDetails');
    if (!list || !countEl) return;

    const items = excentricidades.filter(e => centros.includes(e.nodoId));
    countEl.textContent = String(items.length);
    list.innerHTML = '';

    if (items.length === 0) {
        list.innerHTML = '<span class="ecc-chip ecc-chip-empty">Sin datos</span>';
        if (details) details.removeAttribute('open');
        return;
    }

    items.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ecc-chip';
        btn.title = `ID: ${item.nodoId} — Clic para ver en el mapa`;
        btn.innerHTML = `${item.nodoNombre} · <strong>${item.excentricidad}</strong>`;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            focusNodoEnMapa(item.nodoId);
        });
        list.appendChild(btn);
    });

    // Colapsado por defecto; el usuario lo expande si lo necesita
}

function aplicarFiltroExcentricidades() {
    const filtro = (document.getElementById('filtroExcentricidades')?.value || '').toLowerCase().trim();
    const tbody = document.getElementById('excentricidadesTableBody');
    const countEl = document.getElementById('eccFilterCount');
    if (!tbody) return;

    const filas = tbody.getElementsByTagName('tr');
    let visibles = 0;

    Array.from(filas).forEach(fila => {
        const tipo = fila.dataset.tipo || 'normal';
        const nombre = (fila.dataset.nombre || '').toLowerCase();
        const id = (fila.dataset.id || '').toLowerCase();
        const coincideTexto = !filtro || nombre.includes(filtro) || id.includes(filtro);
        const coincideTipo = eccFiltroTipo === 'all' || tipo === eccFiltroTipo;
        const visible = coincideTexto && coincideTipo;

        fila.style.display = visible ? '' : 'none';
        if (visible) visibles++;
    });

    if (countEl) {
        countEl.textContent = filtro || eccFiltroTipo !== 'all'
            ? `${visibles}/${filas.length}`
            : `${filas.length}`;
    }
}

/**
 * Inicializa el botón de excentricidades
 */
function initExcentricidades() {
    // El botón del header ahora hace toggle del panel
    document.getElementById('calcularExcentricidades').addEventListener('click', () => {
        console.log('📊 Click en botón Excentricidades del header');
        const isOpen = isDrawerOpen('excentricidadesPanel');
        
        if (isOpen) {
            // Si está abierto, cerrarlo
            toggleExcentricidadesPanel();
            actualizarBotonesActivos(null);
        } else {
            // Cerrar otros modales primero
            cerrarTodosLosModales();
            // Si está cerrado, calcular y abrir
            calcularYMostrarExcentricidades();
            actualizarBotonesActivos('calcularExcentricidades');
        }
    });
    
    // El botón del panel toggle solo abre/cierra
    document.getElementById('toggleExcentricidadesPanel').addEventListener('click', () => {
        console.log('📊 Click en botón Toggle del panel');
        toggleExcentricidadesPanel();
    });
    
    const filtroInput = document.getElementById('filtroExcentricidades');
    if (filtroInput) {
        filtroInput.addEventListener('input', aplicarFiltroExcentricidades);
    }

    document.querySelectorAll('[data-ecc-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-ecc-filter]').forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            eccFiltroTipo = btn.dataset.eccFilter || 'all';
            aplicarFiltroExcentricidades();
        });
    });

    document.getElementById('btnCaminoDiametro')?.addEventListener('click', () => {
        if (!eccDataCompleta?.caminoDiametroIds?.length) return;
        mostrarDetalleRutaExcentricidad({
            titulo: 'Ruta del diámetro del grafo',
            origen: eccDataCompleta.diametroOrigenNombre,
            destino: eccDataCompleta.diametroDestinoNombre,
            saltos: eccDataCompleta.diametro,
            caminoIds: eccDataCompleta.caminoDiametroIds,
            caminoNombres: eccDataCompleta.caminoDiametroNombres
        });
    });

    document.getElementById('eccRutaCerrar')?.addEventListener('click', () => {
        document.getElementById('eccRutaDetalle')?.classList.add('is-hidden');
        limpiarRutaExcentricidad();
    });
}

function mostrarDetalleRutaExcentricidad({ titulo, origen, destino, saltos, caminoIds, caminoNombres }) {
    const panel = document.getElementById('eccRutaDetalle');
    const tituloEl = document.getElementById('eccRutaTitulo');
    const resumenEl = document.getElementById('eccRutaResumen');
    const caminoEl = document.getElementById('eccRutaCamino');
    if (!panel || !caminoEl) return;

    if (tituloEl) tituloEl.textContent = titulo;
    if (resumenEl) {
        resumenEl.textContent = `${origen} → ${destino} · ${saltos} saltos · ${caminoNombres.length} municipios en la ruta`;
    }
    caminoEl.textContent = caminoNombres.join(' → ');
    panel.classList.remove('is-hidden');

    visualizarCaminoExcentricidad(caminoIds, caminoNombres);
}

function limpiarRutaExcentricidad() {
    if (eccRutaLayer) {
        map.removeLayer(eccRutaLayer);
        eccRutaLayer = null;
    }
}

function visualizarCaminoExcentricidad(caminoIds, caminoNombres) {
    limpiarRutaExcentricidad();
    limpiarRutaVisualizada();

    if (!caminoIds?.length) return;

    eccRutaLayer = L.layerGroup();
    const coordenadas = caminoIds.map(id => {
        const nodo = nodosData.find(n => n.id === id);
        return nodo ? [nodo.latitud, nodo.longitud] : null;
    }).filter(Boolean);

    if (coordenadas.length < 2) return;

    const linea = L.polyline(coordenadas, {
        color: '#7c3aed',
        weight: 5,
        opacity: 0.9,
        dashArray: '8 6',
        lineCap: 'round',
        lineJoin: 'round'
    });
    eccRutaLayer.addLayer(linea);

    caminoIds.forEach((id, index) => {
        const nodo = nodosData.find(n => n.id === id);
        if (!nodo) return;
        const esInicio = index === 0;
        const esFin = index === caminoIds.length - 1;
        const marker = L.circleMarker([nodo.latitud, nodo.longitud], {
            radius: esInicio || esFin ? 9 : 6,
            fillColor: esInicio ? '#10b981' : (esFin ? '#ef4444' : '#7c3aed'),
            color: '#fff',
            weight: 2,
            fillOpacity: 0.95
        });
        marker.bindTooltip(`${index + 1}. ${nodo.nombre}`, { permanent: false, direction: 'top' });
        eccRutaLayer.addLayer(marker);
    });

    eccRutaLayer.addTo(map);
    map.fitBounds(linea.getBounds(), { padding: [60, 60] });
}

/**
 * Abre/cierra el panel de excentricidades
 */
function toggleExcentricidadesPanel() {
    if (isDrawerOpen('excentricidadesPanel')) {
        closeDrawer('excentricidadesPanel');
        return;
    }

    openDrawer('excentricidadesPanel');
    const tbody = document.getElementById('excentricidadesTableBody');
    if (tbody.children.length === 0) {
        calcularYMostrarExcentricidades();
    }
}

/**
 * Calcula y muestra las excentricidades
 */
async function calcularYMostrarExcentricidades() {
    try {
        console.log('📊 Iniciando cálculo de excentricidades...');
        
        // Abrir el panel inmediatamente
        openDrawer('excentricidadesPanel');
        
        // Mostrar loading
        const loading = document.getElementById('loading');
        loading.innerHTML = `
            <div class="loading-spinner"></div>
            <p>Calculando excentricidades...</p>
            <p style="font-size: 0.85em; margin-top: 10px;">Esto puede tomar unos momentos</p>
        `;
        loading.style.display = 'flex';
        
        // Llamar al nuevo endpoint que devuelve todo
        const response = await fetch(`${API_URL}/excentricidades-completas`);
        const data = await response.json();
        console.log('📊 Datos completos recibidos:', data);
        
        const excentricidades = data.excentricidades;
        const radio = data.radio;
        const diametro = data.diametro;
        const centros = data.centros;
        const nodosRadio = data.nodosRadio;
        const nodosDiametro = data.nodosDiametro;
        
        console.log('📊 Radio:', radio, 'saltos | Diámetro:', diametro, 'saltos');
        console.log('📊 Centros (top 3):', centros);
        console.log('📊 Nodos Radio:', nodosRadio);
        console.log('📊 Nodos Diámetro:', nodosDiametro);
        
        // Ocultar loading
        loading.style.display = 'none';
        
        // Actualizar información general
        document.getElementById('radioGrafo').textContent = `${radio} saltos`;
        document.getElementById('diametroGrafo').textContent = `${diametro} saltos`;
        
        // Actualizar los Sets de nodos especiales
        nodosCentroIds.clear();
        nodosRadioIds.clear();
        nodosDiametroIds.clear();
        
        centros.forEach(id => nodosCentroIds.add(id));
        nodosRadio.forEach(id => nodosRadioIds.add(id));
        nodosDiametro.forEach(id => nodosDiametroIds.add(id));
        
        // Redibujar todos los nodos para aplicar los nuevos colores
        if (nodosData.length > 0) {
            markers.forEach(m => map.removeLayer(m));
            markers = [];
            markerObjects = {};
            dibujarNodos();
        }
        
        renderCentrosChips(excentricidades, centros);

        eccDataCompleta = data;
        const btnDiam = document.getElementById('btnCaminoDiametro');
        if (btnDiam && data.caminoDiametroNombres?.length) {
            btnDiam.title = `${data.diametroOrigenNombre} → ${data.diametroDestinoNombre} (${data.diametro} saltos)`;
        }

        // Mostrar resultados en panel
        mostrarExcentricidadesEnPanel(excentricidades, centros, nodosRadio, nodosDiametro);
        
    } catch (error) {
        console.error('Error al calcular excentricidades:', error);
        alert('❌ Error al calcular las excentricidades. Verifica que el servidor esté corriendo.');
        document.getElementById('loading').style.display = 'none';
    }
}

/**
 * Muestra los resultados de excentricidades en el panel lateral
 */
function mostrarExcentricidadesEnPanel(excentricidades, centros, nodosRadio, nodosDiametro) {
    console.log('📊 Mostrando excentricidades en panel:', excentricidades.length, 'nodos');
    console.log('📊 Centros:', centros);
    console.log('📊 Nodos Radio:', nodosRadio);
    console.log('📊 Nodos Diámetro:', nodosDiametro);
    
    if (excentricidades.length === 0) {
        alert('No hay datos de excentricidades disponibles.');
        return;
    }
    
    // Llenar tabla
    const tbody = document.getElementById('excentricidadesTableBody');
    console.log('📊 Elemento tbody encontrado:', tbody);
    tbody.innerHTML = '';
    
    let rowCount = 0;
    excentricidades.forEach((item, index) => {
        const esCentro = centros.includes(item.nodoId);
        const esRadio = nodosRadio.includes(item.nodoId);
        const esDiametro = nodosDiametro.includes(item.nodoId);
        
        const row = document.createElement('tr');
        row.dataset.id = item.nodoId;
        row.dataset.nombre = item.nodoNombre;

        let tipo = 'normal';
        let badge = '<span class="badge-no">—</span>';
        if (esRadio) {
            tipo = 'radio';
            row.classList.add('ecc-row-radio');
            badge = '<span class="badge-radio">Radio</span>';
        } else if (esCentro) {
            tipo = 'centro';
            row.classList.add('centro-row', 'ecc-row-centro');
            badge = '<span class="badge-centro">Centro</span>';
        } else if (esDiametro) {
            tipo = 'diametro';
            row.classList.add('ecc-row-diametro');
            badge = '<span class="badge-diametro">Diámetro</span>';
        }
        row.dataset.tipo = tipo;

        row.innerHTML = `
            <td>${index + 1}</td>
            <td title="${item.nodoNombre} (${item.nodoId})">${item.nodoNombre}</td>
            <td>${item.excentricidad}</td>
            <td>${badge}</td>
        `;

        row.style.cursor = 'pointer';
        row.title = item.caminoNombres?.length
            ? `Clic: ver ruta hacia ${item.destinoMasLejanoNombre}`
            : 'Clic para centrar en el mapa';
        row.addEventListener('click', () => {
            if (item.caminoIds?.length) {
                document.querySelectorAll('#excentricidadesTableBody tr').forEach(r => r.classList.remove('ecc-row-selected'));
                row.classList.add('ecc-row-selected');
                mostrarDetalleRutaExcentricidad({
                    titulo: `Ruta desde ${item.nodoNombre}`,
                    origen: item.nodoNombre,
                    destino: item.destinoMasLejanoNombre || item.caminoNombres[item.caminoNombres.length - 1],
                    saltos: item.excentricidad,
                    caminoIds: item.caminoIds,
                    caminoNombres: item.caminoNombres
                });
            } else {
                focusNodoEnMapa(item.nodoId);
            }
        });
        
        tbody.appendChild(row);
        rowCount++;
    });
    
    console.log('📊 Total de filas agregadas a la tabla:', rowCount);

    aplicarFiltroExcentricidades();
    openDrawer('excentricidadesPanel');
}

/**
 * Variables globales para rutas
 */
let rutasData = null;
let rutaSeleccionadaLayer = null;

/**
 * Inicializa el modal de rutas
 */
function initRutas() {
    document.getElementById('calcularRutas').addEventListener('click', () => {
        const isOpen = isDrawerOpen('rutasPanel');
        
        if (isOpen) {
            // Si está abierto, cerrarlo
            toggleRutasPanel();
            actualizarBotonesActivos(null);
        } else {
            // Cerrar otros modales primero
            cerrarTodosLosModales();
            // Abrir este modal
            toggleRutasPanel();
            actualizarBotonesActivos('calcularRutas');
        }
    });
    
    document.getElementById('toggleRutasPanel').addEventListener('click', toggleRutasPanel);
    document.getElementById('btnCalcularRutas').addEventListener('click', calcularRutasEntreNodos);
    document.getElementById('btnLimpiarRuta').addEventListener('click', limpiarRutaVisualizada);
    
    // Cargar nodos en los selectores
    cargarNodosEnSelectores();
}

/**
 * Toggle del panel de rutas
 */
function toggleRutasPanel() {
    if (isDrawerOpen('rutasPanel')) {
        closeDrawer('rutasPanel');
        return;
    }

    openDrawer('rutasPanel');
    if (nodosData.length > 0 && document.getElementById('nodoOrigen').options.length === 1) {
        cargarNodosEnSelectores();
    }
}

/**
 * Carga los nodos en los selectores
 */
function cargarNodosEnSelectores() {
    const selectOrigen = document.getElementById('nodoOrigen');
    const selectDestino = document.getElementById('nodoDestino');
    
    // Limpiar selects
    selectOrigen.innerHTML = '<option value="">Seleccione...</option>';
    selectDestino.innerHTML = '<option value="">Seleccione...</option>';
    
    // Llenar con nodos
    nodosData.forEach(nodo => {
        const optionOrigen = document.createElement('option');
        optionOrigen.value = nodo.id;
        optionOrigen.textContent = `${nodo.nombre} (${nodo.id})`;
        selectOrigen.appendChild(optionOrigen);
        
        const optionDestino = document.createElement('option');
        optionDestino.value = nodo.id;
        optionDestino.textContent = `${nodo.nombre} (${nodo.id})`;
        selectDestino.appendChild(optionDestino);
    });
}

/**
 * Calcula las rutas entre dos nodos
 */
async function calcularRutasEntreNodos() {
    const origen = document.getElementById('nodoOrigen').value;
    const destino = document.getElementById('nodoDestino').value;
    
    if (!origen || !destino) {
        alert('⚠️ Por favor seleccione nodo de origen y destino');
        return;
    }
    
    if (origen === destino) {
        alert('⚠️ El nodo de origen y destino deben ser diferentes');
        return;
    }
    
    try {
        // Mostrar loading
        const loading = document.getElementById('loading');
        loading.innerHTML = `
            <div class="loading-spinner"></div>
            <p>Calculando rutas...</p>
        `;
        loading.style.display = 'flex';
        
        // Llamar a la API
        const response = await fetch(`${API_URL}/rutas?origen=${origen}&destino=${destino}`);
        rutasData = await response.json();
        
        // Ocultar loading
        loading.style.display = 'none';
        
        // Mostrar resultados
        mostrarResultadosRutas(rutasData);
        
    } catch (error) {
        console.error('Error al calcular rutas:', error);
        alert('❌ Error al calcular las rutas. Verifica que el servidor esté corriendo.');
        document.getElementById('loading').style.display = 'none';
    }
}

/**
 * Muestra los resultados de rutas en el modal
 */
function mostrarResultadosRutas(data) {
    const resultados = document.getElementById('rutasResultados');
    const rutaOptimaInfo = document.getElementById('rutaOptimaInfo');
    const rutasPosiblesList = document.getElementById('rutasPosiblesList');
    
    // Mostrar ruta óptima
    rutaOptimaInfo.innerHTML = crearHTMLRutaDetalle(data.rutaOptima, true);
    
    // Mostrar rutas posibles
    rutasPosiblesList.innerHTML = '';
    data.rutasPosibles.forEach((ruta, index) => {
        const rutaDiv = document.createElement('div');
        rutaDiv.className = 'ruta-detalle';
        rutaDiv.innerHTML = crearHTMLRutaDetalle(ruta, false, index + 1);
        
        // Agregar evento click para visualizar en el mapa
        rutaDiv.addEventListener('click', () => {
            visualizarRutaEnMapa(ruta);
            // Marcar como seleccionada
            document.querySelectorAll('.ruta-detalle').forEach(r => r.classList.remove('selected'));
            rutaDiv.classList.add('selected');
        });
        
        rutasPosiblesList.appendChild(rutaDiv);
    });
    
    // Mostrar sección de resultados
    resultados.style.display = 'block';
    
    // Visualizar ruta óptima automáticamente
    visualizarRutaEnMapa(data.rutaOptima);
}

/**
 * Crea el HTML para mostrar una ruta detallada
 */
function crearHTMLRutaDetalle(ruta, esOptima, numero = null) {
    const header = numero ? 
        `<div class="ruta-header">
            <span class="ruta-numero">Ruta ${numero}</span>
            <div class="ruta-stats">
                <div class="ruta-stat">
                    <strong>${ruta.distanciaTotal.toFixed(2)}</strong> km
                </div>
                <div class="ruta-stat">
                    <strong>${ruta.numeroSaltos}</strong> saltos
                </div>
            </div>
        </div>` :
        `<div class="ruta-stats" style="margin-bottom: 10px;">
            <div class="ruta-stat">
                <strong>Distancia:</strong> ${ruta.distanciaTotal.toFixed(2)} km
            </div>
            <div class="ruta-stat">
                <strong>Saltos:</strong> ${ruta.numeroSaltos}
            </div>
        </div>`;
    
    const path = `<div class="ruta-path">
        <strong>Ruta:</strong> ${ruta.nombresNodos.join(' → ')}
    </div>`;
    
    return header + path;
}

/**
 * Visualiza una ruta en el mapa
 */
function visualizarRutaEnMapa(ruta) {
    // Limpiar ruta anterior
    limpiarRutaVisualizada();
    
    // Crear un layer group para la ruta
    rutaSeleccionadaLayer = L.layerGroup();
    
    // Obtener coordenadas de los nodos
    const coordenadas = ruta.nodos.map(nodoId => {
        const nodo = nodosData.find(n => n.id === nodoId);
        return [nodo.latitud, nodo.longitud];
    });
    
    // Dibujar la línea de la ruta
    const rutaLine = L.polyline(coordenadas, estiloArista('ruta'));
    rutaSeleccionadaLayer.addLayer(rutaLine);
    
    // Agregar marcadores especiales para cada nodo de la ruta
    ruta.nodos.forEach((nodoId, index) => {
        const nodo = nodosData.find(n => n.id === nodoId);
        if (!nodo) return;
        
        let iconColor, label, iconHtml;
        
        if (index === 0) {
            // Nodo origen
            iconColor = MAP_STYLES.nodo.centro.fill;
            label = '🚩 ORIGEN';
            iconHtml = '<div style="background-color: #4CAF50; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 3px 10px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 16px;">🚩</div>';
        } else if (index === ruta.nodos.length - 1) {
            // Nodo destino
            iconColor = MAP_STYLES.nodo.diametro.fill;
            label = '🎯 DESTINO';
            iconHtml = '<div style="background-color: #F44336; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 3px 10px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 16px;">🎯</div>';
        } else {
            // Nodos intermedios
            iconColor = MAP_STYLES.nodo.radio.fill;
            label = `Paso ${index}`;
            iconHtml = `<div style="background-color: #FF9800; width: 25px; height: 25px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">${index}</div>`;
        }
        
        const customIcon = L.divIcon({
            html: iconHtml,
            className: 'custom-route-marker',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
        
        const marker = L.marker([nodo.latitud, nodo.longitud], {
            icon: customIcon,
            zIndexOffset: 1000
        });
        
        marker.bindPopup(`
            <div style="text-align: center;">
                <strong style="color: ${iconColor};">${label}</strong><br>
                <strong>${nodo.nombre}</strong><br>
                <small style="color: #666;">${nodo.id}</small>
            </div>
        `);
        
        rutaSeleccionadaLayer.addLayer(marker);
    });
    
    // Agregar el layer group al mapa
    rutaSeleccionadaLayer.addTo(map);
    
    // Ajustar vista del mapa
    map.fitBounds(rutaLine.getBounds(), {
        padding: [80, 80]
    });
}

/**
 * Limpia la ruta visualizada del mapa
 */
function limpiarRutaVisualizada() {
    if (rutaSeleccionadaLayer) {
        map.removeLayer(rutaSeleccionadaLayer);
        rutaSeleccionadaLayer = null;
    }
}

// =====================================
// Panel de Ciclos
// =====================================

let cicloSeleccionadoLayer = null;

/**
 * Inicializa el panel de ciclos
 */
function initCiclos() {
    document.getElementById('calcularCiclos').addEventListener('click', () => {
        const isOpen = isDrawerOpen('ciclosPanel');
        
        if (isOpen) {
            // Si está abierto, cerrarlo
            toggleCiclosPanel();
            actualizarBotonesActivos(null);
        } else {
            // Cerrar otros modales primero
            cerrarTodosLosModales();
            // Abrir este modal
            toggleCiclosPanel();
            actualizarBotonesActivos('calcularCiclos');
        }
    });
    
    document.getElementById('toggleCiclosPanel').addEventListener('click', toggleCiclosPanel);
    document.getElementById('btnCalcularCiclos').addEventListener('click', buscarCiclosDesdeNodo);
    document.getElementById('btnLimpiarCiclo').addEventListener('click', limpiarCicloVisualizado);
    
    // Filtro de búsqueda de nodos
    document.getElementById('filtroCicloNodo').addEventListener('input', filtrarNodosCiclo);
    
    // Cargar nodos en el selector
    cargarNodosEnSelectorCiclos();
}

/**
 * Toggle del panel de ciclos
 */
function toggleCiclosPanel() {
    if (isDrawerOpen('ciclosPanel')) {
        closeDrawer('ciclosPanel');
        return;
    }

    openDrawer('ciclosPanel');
    if (nodosData.length > 0 && document.getElementById('nodoInicioCiclo').options.length === 1) {
        cargarNodosEnSelectorCiclos();
    }
}

/**
 * Carga los nodos en el selector de ciclos
 */
function cargarNodosEnSelectorCiclos() {
    const selectInicio = document.getElementById('nodoInicioCiclo');
    
    // Limpiar opciones existentes (excepto la primera)
    selectInicio.innerHTML = '<option value="">Seleccione...</option>';
    
    // Agregar todos los nodos ordenados por nombre
    const nodosOrdenados = [...nodosData].sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    nodosOrdenados.forEach(nodo => {
        const option = document.createElement('option');
        option.value = nodo.id;
        option.textContent = `${nodo.id} - ${nodo.nombre}`;
        option.dataset.nombre = nodo.nombre.toLowerCase();
        option.dataset.id = nodo.id.toLowerCase();
        selectInicio.appendChild(option);
    });
}

/**
 * Filtra los nodos en el selector según el texto de búsqueda
 */
function filtrarNodosCiclo() {
    const filtro = document.getElementById('filtroCicloNodo').value.toLowerCase();
    const select = document.getElementById('nodoInicioCiclo');
    const opciones = select.querySelectorAll('option');
    
    let primeraVisible = null;
    
    opciones.forEach((opcion, index) => {
        if (index === 0) return; // Saltar la opción "Seleccione..."
        
        const nombre = opcion.dataset.nombre || '';
        const id = opcion.dataset.id || '';
        
        if (nombre.includes(filtro) || id.includes(filtro)) {
            opcion.style.display = '';
            if (!primeraVisible) primeraVisible = opcion;
        } else {
            opcion.style.display = 'none';
        }
    });
    
    // Si hay un filtro y hay opciones visibles, seleccionar la primera
    if (filtro && primeraVisible) {
        select.value = primeraVisible.value;
    }
}

/**
 * Busca ciclos desde un nodo específico
 */
async function buscarCiclosDesdeNodo() {
    const nodoInicio = document.getElementById('nodoInicioCiclo').value;
    
    if (!nodoInicio) {
        alert('Por favor seleccione un nodo inicial');
        return;
    }
    
    // Mostrar loading
    const loadingDiv = document.getElementById('loading');
    loadingDiv.style.display = 'flex';
    loadingDiv.innerHTML = '<div class="loading-spinner"></div><p>Buscando ciclos...</p>';
    
    try {
        const response = await fetch(`/api/grafos/ciclos?nodoInicio=${nodoInicio}`);
        const data = await response.json();
        
        console.log('Ciclos encontrados:', data);
        
        // Mostrar resultados
        mostrarCiclosEnPanel(data);
        
    } catch (error) {
        console.error('Error al buscar ciclos:', error);
        alert('Error al buscar ciclos');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

/**
 * Muestra los ciclos en el panel
 */
function mostrarCiclosEnPanel(data) {
    const resultadosDiv = document.getElementById('ciclosResultados');
    const ciclosSimplesCount = document.getElementById('ciclosSimplesCount');
    const ciclosGeneralesCount = document.getElementById('ciclosGeneralesCount');
    const ciclosSimplesList = document.getElementById('ciclosSimplesList');
    const ciclosGeneralesList = document.getElementById('ciclosGeneralesList');
    
    // Limpiar resultados anteriores
    ciclosSimplesList.innerHTML = '';
    ciclosGeneralesList.innerHTML = '';
    
    // Mostrar contadores
    ciclosSimplesCount.textContent = `${data.ciclosSimples.length} ciclos encontrados`;
    ciclosGeneralesCount.textContent = `${data.ciclosGenerales.length} ciclos encontrados`;
    
    // Mostrar ciclos simples
    data.ciclosSimples.forEach((ciclo, index) => {
        const cicloDiv = crearElementoCiclo(ciclo, index + 1, 'simple');
        ciclosSimplesList.appendChild(cicloDiv);
    });
    
    // Mostrar ciclos generales
    data.ciclosGenerales.forEach((ciclo, index) => {
        const cicloDiv = crearElementoCiclo(ciclo, index + 1, 'general');
        ciclosGeneralesList.appendChild(cicloDiv);
    });
    
    // Mostrar el div de resultados
    resultadosDiv.style.display = 'block';
}

/**
 * Crea el elemento HTML para mostrar un ciclo
 */
function crearElementoCiclo(ciclo, numero, tipo) {
    const div = document.createElement('div');
    div.className = 'ciclo-detalle';
    div.dataset.tipo = tipo;
    div.dataset.numero = numero;
    
    const header = document.createElement('div');
    header.className = 'ciclo-header';
    
    const numeroBadge = document.createElement('span');
    numeroBadge.className = 'ciclo-numero';
    numeroBadge.textContent = `Ciclo #${numero}`;
    
    const stats = document.createElement('div');
    stats.className = 'ciclo-stats';
    stats.innerHTML = `
        <span>⚡ ${ciclo.numeroSaltos} saltos</span>
        <span>📏 ${ciclo.distanciaTotal.toFixed(2)} km</span>
    `;
    
    header.appendChild(numeroBadge);
    header.appendChild(stats);
    
    const path = document.createElement('div');
    path.className = 'ciclo-path';
    path.textContent = ciclo.nombresNodos.join(' → ');
    
    div.appendChild(header);
    div.appendChild(path);
    
    // Hacer clic para visualizar en el mapa
    div.addEventListener('click', () => {
        visualizarCicloEnMapa(ciclo);
        
        // Marcar como seleccionado
        document.querySelectorAll('.ciclo-detalle').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
    });
    
    return div;
}

/**
 * Visualiza un ciclo en el mapa
 */
async function visualizarCicloEnMapa(ciclo) {
    // Limpiar ciclo anterior
    limpiarCicloVisualizado();
    
    const nodos = ciclo.nodos;
    const puntos = [];
    
    // Obtener coordenadas de cada nodo
    for (const nodoId of nodos) {
        const nodo = nodosData.find(n => n.id === nodoId);
        if (nodo) {
            puntos.push([nodo.latitud, nodo.longitud]);
        }
    }
    
    if (puntos.length === 0) return;
    
    // Crear capa de ruta
    const group = L.layerGroup();
    
    // Verificar el tipo de ruta
    const useRoadRoute = document.getElementById('roadRoute').checked;
    
    if (useRoadRoute) {
        // Usar OSRM para ruteo por carretera (segmento por segmento)
        for (let i = 0; i < puntos.length - 1; i++) {
            try {
                const coords = await obtenerRutaOSRM(puntos[i], puntos[i + 1]);
                if (coords && coords.length > 0) {
                    const polyline = L.polyline(coords, estiloArista('ciclo'));
                    group.addLayer(polyline);
                }
            } catch (error) {
                console.error('Error al obtener ruta OSRM:', error);
                // Fallback a línea recta
                const polyline = L.polyline([puntos[i], puntos[i + 1]], estiloArista('ciclo'));
                group.addLayer(polyline);
            }
        }
    } else {
        // Usar líneas rectas
        const polyline = L.polyline(puntos, estiloArista('ciclo'));
        group.addLayer(polyline);
    }
    
    // Agregar marcadores
    puntos.forEach((punto, index) => {
        const nodoId = nodos[index];
        const nodo = nodosData.find(n => n.id === nodoId);
        
        if (nodo) {
            const marker = L.circleMarker(punto, {
                radius: 8,
                fillColor: index === 0 || index === puntos.length - 1 ? '#047857' : '#10b981',
                color: 'white',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
            });
            
            marker.bindPopup(`
                <div class="popup-title">${index === 0 ? '🔵 Inicio/Fin' : `Paso ${index}`}</div>
                <div class="popup-info"><strong>ID:</strong> ${nodo.id}</div>
                <div class="popup-info"><strong>Nombre:</strong> ${nodo.nombre}</div>
            `);
            
            group.addLayer(marker);
        }
    });
    
    cicloSeleccionadoLayer = group;
    group.addTo(map);
    
    // Ajustar vista del mapa
    map.fitBounds(puntos);
}

/**
 * Limpia el ciclo visualizado del mapa
 */
function limpiarCicloVisualizado() {
    if (cicloSeleccionadoLayer) {
        map.removeLayer(cicloSeleccionadoLayer);
        cicloSeleccionadoLayer = null;
    }
    
    // Limpiar selección
    document.querySelectorAll('.ciclo-detalle').forEach(el => el.classList.remove('selected'));
}

/**
 * Inicializa la aplicación
 */
function init() {
    initMap();
    initDrawerUi();
    initNodePanelToggle();
    initBusqueda();
    initControlesVisibilidad();
    initCacheControls();
    initRouteTypeToggle();
    initExcentricidades();
    initRutas();
    initCiclos();
    cargarDatos();
}

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);
