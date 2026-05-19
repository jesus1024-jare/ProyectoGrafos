# ProyectoGrafos — Teoría de Grafos sobre municipios de Colombia

Aplicación web para visualizar y analizar un **grafo de municipios colombianos**: mapa interactivo, cálculo de **excentricidades** (radio, diámetro, centros), **rutas óptimas** y **ciclos**, con backend en **ASP.NET Core** y frontend en **HTML/CSS/JavaScript** con **Leaflet**.

Réplica en C# del proyecto original en Java/Spring Boot, con API REST compatible y mejoras en la interfaz (panel de excentricidades, rutas en el mapa, caché de rutas por carretera).

**Repositorio:** [github.com/jesus1024-jare/ProyectoGrafos](https://github.com/jesus1024-jare/ProyectoGrafos)

---

## Tabla de contenidos

1. [Características principales](#características-principales)
2. [Requisitos](#requisitos)
3. [Instalación y ejecución](#instalación-y-ejecución)
4. [Estructura del proyecto](#estructura-del-proyecto)
5. [Configuración](#configuración)
6. [Datos: archivos CSV y JSON](#datos-archivos-csv-y-json)
7. [Cómo se construye el grafo](#cómo-se-construye-el-grafo)
8. [Algoritmos implementados](#algoritmos-implementados)
9. [Conceptos: radio, diámetro, centros y excentricidad](#conceptos-radio-diámetro-centros-y-excentricidad)
10. [API REST](#api-rest)
11. [Interfaz del mapa](#interfaz-del-mapa)
12. [Scripts auxiliares](#scripts-auxiliares)
13. [Diferencias con la versión Java](#diferencias-con-la-versión-java)
14. [Limitaciones importantes](#limitaciones-importantes)
15. [Solución de problemas](#solución-de-problemas)

---

## Características principales

| Área | Descripción |
|------|-------------|
| **Mapa** | Municipios como nodos sobre OpenStreetMap; aristas del grafo visibles; vista inicial centrada en Bogotá |
| **Grafo** | Nodos desde CSV; aristas por archivo de conexiones **o** generación automática por proximidad geográfica |
| **Excentricidades** | BFS por saltos; radio, diámetro, nodos centro/radio/diámetro; rutas hacia el nodo más lejano y ruta del diámetro |
| **Rutas** | Dijkstra (distancia mínima en km del grafo) + DFS para rutas alternativas (hasta 30) |
| **Ciclos** | Ciclos simples y generales desde un nodo de inicio (DFS) |
| **Visualización vial** | Aristas “por carretera” vía OSRM (servicio externo); caché en `localStorage` del navegador |
| **API** | REST JSON en `/api/grafos`; misma forma que el proyecto Java |

---

## Requisitos

### Obligatorio

| Requisito | Detalle |
|-----------|---------|
| **[.NET SDK 10.0](https://dotnet.microsoft.com/download)** | El proyecto usa `net10.0` en `TeoriaGrafos.Api.csproj` |
| **Navegador moderno** | Chrome, Edge o Firefox (recomendado) |

Comprobar instalación:

```powershell
dotnet --version
```

Debe mostrar `10.x`. Con SDK 8 u 9 solamente, hay que instalar .NET 10 o cambiar el `TargetFramework` del `.csproj`.

### No necesitas

- Node.js / npm (el frontend es estático en `wwwroot/`)
- Base de datos (SQL Server, PostgreSQL, etc.)
- Docker

### Recomendado

- **Conexión a internet** para: tiles de OpenStreetMap, CDN de Leaflet, iconos Flaticon, fuentes Google y API **OSRM** al dibujar aristas tipo carretera o rutas puntuales en el mapa.

---

## Instalación y ejecución

### Clonar el repositorio

```powershell
git clone https://github.com/jesus1024-jare/ProyectoGrafos.git
cd ProyectoGrafos
```

### Opción A — Script `ejecutar.bat` (Windows)

Desde la raíz del repositorio:

```powershell
.\ejecutar.bat
```

### Opción B — Línea de comandos

```powershell
cd TeoriaGrafos.Api
dotnet restore
dotnet run
```

### Compilar sin ejecutar

```powershell
.\compilar.bat
```

o:

```powershell
dotnet build TeoriaGrafos.Api\TeoriaGrafos.Api.csproj
```

### Abrir la aplicación

Navegador: **http://localhost:8081/mapa.html**

El puerto **8081** está definido en `TeoriaGrafos.Api/Properties/launchSettings.json` para no chocar con el proyecto Java (puerto 8080).

---

## Estructura del proyecto

```
ProyectoGrafos/
├── README.md                    # Este archivo
├── ProyectoGrafos.slnx          # Solución
├── compilar.bat                 # Compila el API
├── ejecutar.bat                 # Ejecuta el API
└── TeoriaGrafos.Api/
    ├── Program.cs               # Arranque ASP.NET Core, CORS, archivos estáticos
    ├── appsettings.json         # Configuración del grafo (CSV, vecinos)
    ├── Controllers/
    │   └── GrafosController.cs  # Endpoints REST
    ├── Services/
    │   └── GrafoService.cs      # Carga de datos y algoritmos
    ├── Models/
    │   ├── Nodo.cs
    │   └── Conexion.cs
    ├── Dto/                     # Respuestas de la API
    ├── Data/
    │   ├── municipalities.csv           # Nodos por defecto (~112 municipios)
    │   ├── municipalitiesfull.csv       # Conjunto ampliado (~536)
    │   ├── diametro-camino.json           # Referencia del camino del diámetro
    │   └── excentricidades-verificacion.json
    ├── scripts/
    │   └── exportar-excentricidades.ps1
    └── wwwroot/
        ├── mapa.html
        ├── css/mapa.css
        └── js/mapa.js
```

Al compartir o subir a GitHub, **no incluyas** las carpetas `bin/` ni `obj/` (ya están en `.gitignore`).

---

## Configuración

Archivo: `TeoriaGrafos.Api/appsettings.json`

```json
{
  "Graph": {
    "NodesFile": "Data/municipalities.csv",
    "ConnectionsFile": "",
    "NearestNeighbors": 4
  }
}
```

| Clave | Descripción |
|-------|-------------|
| `NodesFile` | Ruta al CSV de municipios (relativa a la carpeta del proyecto) |
| `ConnectionsFile` | CSV de aristas `origen,destino`. Si está **vacío**, se generan aristas automáticamente |
| `NearestNeighbors` | Cuántos vecinos geográficos más cercanos conectar por municipio (solo si no hay archivo de conexiones) |

**Ejemplo con conexiones manuales:**

```json
"ConnectionsFile": "Data/connections.csv"
```

**Ejemplo con más municipios:**

```json
"NodesFile": "Data/municipalitiesfull.csv"
```

Tras cambiar `appsettings.json`, reinicia la aplicación (`dotnet run`).

---

## Datos: archivos CSV y JSON

### `municipalities.csv` (nodos)

Formato esperado (cabecera flexible en español o inglés):

| Columna aceptada | Alternativa |
|------------------|-------------|
| `place_id` | `ID` |
| `name` | `Nombre` |
| `lat` | `Latitud` |
| `lon` | `Longitud` |

Ejemplo:

```csv
place_id,name,place_type,lat,lon
1283541719,Villa Rica,town,3.1765241,-76.4637676
703168627,Funza,town,4.7177471,-74.2031547
```

Delimitador: coma `,` o punto y coma `;` (se detecta automáticamente).

### `connections.csv` (opcional)

```csv
origen,destino
1283541719,703168627
```

Los IDs deben existir en el archivo de nodos. La distancia en km se calcula con **Haversine** entre coordenadas.

### Archivos JSON en `Data/`

| Archivo | Uso |
|---------|-----|
| `diametro-camino.json` | Documentación / verificación del camino más largo en saltos |
| `excentricidades-verificacion.json` | Salida del script de exportación (no lo lee la app al arrancar) |

---

## Cómo se construye el grafo

1. **Carga de nodos** desde el CSV configurado.
2. **Aristas:**
   - Si `ConnectionsFile` tiene valor → se leen del CSV.
   - Si está vacío → por cada municipio se enlazan los **`NearestNeighbors`** municipios más cercanos en línea recta (Haversine), sin duplicar la misma arista.
3. El grafo es **no dirigido**: cada conexión A→B genera también B→A en la lista de adyacencia.
4. El peso de una arista para Dijkstra es **`DistanciaKm`** (kilómetros geográficos entre coordenadas, no tiempo de viaje ni distancia por carretera del grafo).

> **Importante:** Las excentricidades (radio, diámetro, centros) usan **número de saltos** (BFS), no kilómetros. Una ruta de excentricidad es el camino en el grafo de vecinos, no una ruta OSRM.

---

## Algoritmos implementados

| Algoritmo | Uso en el proyecto |
|-----------|-------------------|
| **Haversine** | Distancia en km entre dos coordenadas (peso de aristas y totales de rutas) |
| **BFS** | Excentricidad de cada nodo (máximo de saltos al nodo más lejano alcanzable) |
| **BFS doble** | Camino aproximado del **diámetro** del grafo (dos BFS desde un extremo) |
| **Dijkstra** | Ruta óptima en **distancia total (km)** entre origen y destino |
| **DFS** | Todas las rutas simples origen–destino (máx. 30 devueltas) y búsqueda de **ciclos** |

Implementación principal: `TeoriaGrafos.Api/Services/GrafoService.cs`.

---

## Conceptos: radio, diámetro, centros y excentricidad

Definiciones sobre el **grafo cargado** (componente conexa principal):

| Concepto | Definición en este proyecto |
|----------|----------------------------|
| **Excentricidad** de un nodo *v* | Mayor cantidad de **saltos** desde *v* hasta cualquier nodo alcanzable (BFS) |
| **Radio** | Mínima excentricidad entre todos los nodos |
| **Diámetro** | Máxima excentricidad entre todos los nodos |
| **Centro** | Nodos cuya excentricidad está entre las **3 menores distintas** (no solo los 3 municipios con menor valor único) |
| **Nodos radio** | Todos los que empatan en la excentricidad mínima |
| **Nodos diámetro** | Todos los que empatan en la excentricidad máxima |

### Colores en el mapa (tras calcular excentricidades)

| Color | Significado |
|-------|-------------|
| Azul | Municipio normal |
| Naranja | Pertenece al **radio** (excentricidad mínima) |
| Verde | **Centro** del grafo (top 3 excentricidades distintas más bajas) |
| Rojo | **Diámetro** (excentricidad máxima; pueden ser muchos nodos si empatan) |

En el panel de excentricidades puedes:

- Filtrar por texto y por tipo (Todos / Radio / Centro / Diámetro).
- Hacer clic en una fila para ver la **ruta en saltos** hacia el municipio más lejano.
- Pulsar **“Ver ruta del diámetro”** para el camino más largo del grafo (línea morada en el mapa).

---

## API REST

Base: `http://localhost:8081/api/grafos`

Todas las respuestas JSON usan **camelCase** (`nodoId`, `caminoNombres`, etc.).

### Resumen de endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/grafos` | Grafo completo: nodos + conexiones |
| `GET` | `/api/grafos/nodos` | Lista de nodos conectados |
| `GET` | `/api/grafos/nodos/{id}` | Un nodo por ID |
| `GET` | `/api/grafos/conexiones` | Lista de aristas |
| `GET` | `/api/grafos/excentricidades` | Lista de excentricidades por nodo |
| `GET` | `/api/grafos/excentricidades-completas` | Excentricidades + radio, diámetro, centros, caminos |
| `GET` | `/api/grafos/nodos-centro` | Solo nodos centro |
| `GET` | `/api/grafos/rutas?origen={id}&destino={id}` | Ruta óptima y alternativas |
| `GET` | `/api/grafos/ciclos?nodoInicio={id}` | Ciclos desde un nodo |

### Ejemplos

**Grafo completo:**

```http
GET /api/grafos
```

**Excentricidades completas (usado por el mapa):**

```http
GET /api/grafos/excentricidades-completas
```

Fragmento de respuesta:

```json
{
  "excentricidades": [
    {
      "nodoId": "703168627",
      "nodoNombre": "Funza",
      "excentricidad": 12,
      "destinoMasLejanoId": "...",
      "destinoMasLejanoNombre": "San Juanito",
      "caminoIds": ["703168627", "..."],
      "caminoNombres": ["Funza", "..."]
    }
  ],
  "radio": 10,
  "diametro": 17,
  "centros": ["..."],
  "caminoDiametroIds": ["..."],
  "caminoDiametroNombres": ["Villa Rica", "..."],
  "diametroOrigenNombre": "Villa Rica",
  "diametroDestinoNombre": "San Juanito"
}
```

**Rutas entre dos municipios:**

```http
GET /api/grafos/rutas?origen=703168627&destino=1283541719
```

**Ciclos:**

```http
GET /api/grafos/ciclos?nodoInicio=703168627
```

### Probar con PowerShell

```powershell
Invoke-RestMethod -Uri "http://localhost:8081/api/grafos/excentricidades-completas"
```

---

## Interfaz del mapa

Archivo principal: `wwwroot/mapa.html` + `wwwroot/js/mapa.js`.

### Barra lateral

- Búsqueda de municipios.
- Contadores de nodos y aristas.
- Capas: nodos, conexiones, etiquetas.
- Tipo de arista en el mapa:
  - **Carretera:** geometría real vía [OSRM](https://router.project-osrm.org/) (requiere internet).
  - **Línea recta:** segmento directo entre coordenadas.
- Caché de rutas OSRM en el navegador (evita recalcular todas las aristas en cada visita).

### Paneles (cajones)

| Panel | Función |
|-------|---------|
| **Excentricidades** | Calcular y mostrar tabla, filtros, chips de centros, rutas de excentricidad y del diámetro |
| **Rutas** | Elegir origen/destino; ruta óptima del grafo y alternativas; visualización en mapa |
| **Ciclos** | Buscar ciclos simples y generales desde un nodo |

### Vista inicial

Centro en **Bogotá** (zoom 9). Tras cargar datos no se hace zoom global automático a todos los municipios.

---

## Scripts auxiliares

### `TeoriaGrafos.Api/scripts/exportar-excentricidades.ps1`

Con la API en ejecución, exporta el resultado de excentricidades a JSON y valida consistencia (radio ≤ diámetro, conteos, etc.).

```powershell
cd TeoriaGrafos.Api
.\scripts\exportar-excentricidades.ps1
.\scripts\exportar-excentricidades.ps1 -BaseUrl http://localhost:8081 -Salida Data/excentricidades-verificacion.json
```

---

## Diferencias con la versión Java

| Aspecto | Java (Spring Boot) | C# (ASP.NET Core) |
|---------|-------------------|-------------------|
| Puerto por defecto | 8080 | 8081 |
| API | `/api/grafos/...` | Igual |
| Frontend | Similar | Badge .NET, panel ECC ampliado, rutas de excentricidad en mapa |
| URL API en JS | Relativa `/api/grafos` | Igual (sin puerto fijo en código) |

---

## Limitaciones importantes

1. **Grafo sintético sin `connections.csv`:** las aristas unen los *N* vecinos más cercanos en el mapa, no carreteras reales. Los resultados de teoría de grafos describen **ese** grafo, no la red vial nacional.
2. **Excentricidad en saltos** vs **Dijkstra en km:** son métricas distintas; no confundir la ruta morada de excentricidad con la ruta “óptima” del panel de rutas.
3. **OSRM** es un servicio público con límites de uso; no es parte del backend .NET.
4. **DFS de rutas alternativas** puede ser costoso en grafos densos; la API devuelve como máximo **30** rutas.
5. Solo se consideran nodos en la **componente conexa** al calcular excentricidades (nodos aislados quedan fuera).

---

## Solución de problemas

| Problema | Posible solución |
|----------|------------------|
| `dotnet run` falla por versión | Instalar [.NET 10 SDK](https://dotnet.microsoft.com/download) o ajustar `TargetFramework` |
| Puerto 8081 en uso | Cerrar otra instancia de la API o cambiar `applicationUrl` en `launchSettings.json` |
| Mapa en blanco / sin tiles | Revisar conexión a internet (OpenStreetMap) |
| Aristas “carretera” no cargan | OSRM no disponible o límite de peticiones; usar “línea recta” o limpiar caché y reintentar |
| `0 nodos` al iniciar | Revisar ruta y columnas del CSV en `appsettings.json` |
| Cambios en CSV no se ven | Reiniciar `dotnet run` (datos se cargan al arrancar) |
| Error al compilar: archivo bloqueado | Detener la API que sigue ejecutándose y volver a compilar |

---

## Licencia y autor

Proyecto académico de **Teoría de Grafos**.  
Repositorio: [jesus1024-jare/ProyectoGrafos](https://github.com/jesus1024-jare/ProyectoGrafos)

Si usas o modificas el proyecto, mantén la referencia al repositorio y documenta los cambios en los CSV o en `appsettings.json` que afecten los resultados del grafo.
