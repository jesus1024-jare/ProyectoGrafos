using System.Globalization;
using TeoriaGrafos.Api.Dto;
using TeoriaGrafos.Api.Models;

namespace TeoriaGrafos.Api.Services;

public class GrafoService
{
    private readonly ILogger<GrafoService> _logger;
    private readonly string _nodosPath;
    private readonly string? _conexionesPath;
    private readonly int _vecinosCercanos;
    private List<Nodo> _nodos = [];
    private List<Conexion> _conexiones = [];

    public GrafoService(IConfiguration configuration, IWebHostEnvironment environment, ILogger<GrafoService> logger)
    {
        _logger = logger;
        var contentRoot = environment.ContentRootPath;
        _nodosPath = Path.Combine(contentRoot, configuration["Graph:NodesFile"] ?? "Data/municipalities.csv");
        var conexionesRelativa = configuration["Graph:ConnectionsFile"];
        _conexionesPath = string.IsNullOrWhiteSpace(conexionesRelativa)
            ? null
            : Path.Combine(contentRoot, conexionesRelativa);
        _vecinosCercanos = Math.Max(1, configuration.GetValue("Graph:NearestNeighbors", 4));
        CargarDatos();
    }

    private void CargarDatos()
    {
        _logger.LogInformation("Cargando datos de grafos desde archivos CSV...");
        _nodos = CargarNodos();
        _conexiones = _conexionesPath is null
            ? GenerarConexionesPorProximidad()
            : CargarConexiones();
        _logger.LogInformation("Datos cargados: {Nodos} nodos, {Conexiones} conexiones", _nodos.Count, _conexiones.Count);
    }

    private List<Nodo> CargarNodos()
    {
        var listaNodos = new List<Nodo>();
        try
        {
            var lines = File.ReadAllLines(_nodosPath);
            if (lines.Length < 2) return listaNodos;

            var delimiter = DetectDelimiter(lines[0]);
            var headers = ParseCsvLine(lines[0], delimiter);
            var idIdx = IndexOfHeader(headers, "ID", "place_id");
            var nombreIdx = IndexOfHeader(headers, "Nombre", "name");
            var latIdx = IndexOfHeader(headers, "Latitud", "lat");
            var lonIdx = IndexOfHeader(headers, "Longitud", "lon");

            if (idIdx < 0 || nombreIdx < 0 || latIdx < 0 || lonIdx < 0)
            {
                _logger.LogError(
                    "El archivo de nodos no tiene las columnas esperadas (ID/place_id, Nombre/name, Latitud/lat, Longitud/lon)");
                return listaNodos;
            }

            for (var i = 1; i < lines.Length; i++)
            {
                if (string.IsNullOrWhiteSpace(lines[i])) continue;
                var cols = ParseCsvLine(lines[i], delimiter);
                if (cols.Count <= Math.Max(idIdx, Math.Max(nombreIdx, Math.Max(latIdx, lonIdx)))) continue;

                listaNodos.Add(new Nodo
                {
                    Id = cols[idIdx].Trim(),
                    Nombre = cols[nombreIdx].Trim(),
                    Latitud = ParseDouble(cols[latIdx]),
                    Longitud = ParseDouble(cols[lonIdx])
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al cargar nodos desde {Ruta}", _nodosPath);
        }

        return listaNodos;
    }

    private List<Conexion> CargarConexiones()
    {
        var listaConexiones = new List<Conexion>();
        if (_conexionesPath is null) return listaConexiones;

        try
        {
            var lines = File.ReadAllLines(_conexionesPath);
            if (lines.Length < 2) return listaConexiones;

            var delimiter = DetectDelimiter(lines[0]);
            var headers = ParseCsvLine(lines[0], delimiter);
            var origenIdx = IndexOfHeader(headers, "origen");
            var destinoIdx = IndexOfHeader(headers, "destino");

            if (origenIdx < 0 || destinoIdx < 0)
            {
                _logger.LogError("El archivo de conexiones no tiene las columnas origen y destino");
                return listaConexiones;
            }

            for (var i = 1; i < lines.Length; i++)
            {
                if (string.IsNullOrWhiteSpace(lines[i])) continue;
                var cols = ParseCsvLine(lines[i], delimiter);
                if (cols.Count <= Math.Max(origenIdx, destinoIdx)) continue;

                var origen = cols[origenIdx].Trim();
                var destino = cols[destinoIdx].Trim();
                var distancia = CalcularDistanciaEntreNodos(origen, destino);

                listaConexiones.Add(new Conexion
                {
                    Origen = origen,
                    Destino = destino,
                    DistanciaKm = distancia
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al cargar conexiones desde {Ruta}", _conexionesPath);
        }

        return listaConexiones;
    }

    private List<Conexion> GenerarConexionesPorProximidad()
    {
        var aristas = new HashSet<string>(StringComparer.Ordinal);
        var listaConexiones = new List<Conexion>();

        foreach (var nodo in _nodos)
        {
            var vecinos = _nodos
                .Where(n => n.Id != nodo.Id)
                .Select(n => new
                {
                    Nodo = n,
                    Distancia = CalcularDistanciaHaversine(
                        nodo.Latitud, nodo.Longitud, n.Latitud, n.Longitud)
                })
                .OrderBy(x => x.Distancia)
                .Take(_vecinosCercanos);

            foreach (var vecino in vecinos)
            {
                var clave = string.Compare(nodo.Id, vecino.Nodo.Id, StringComparison.Ordinal) < 0
                    ? $"{nodo.Id}|{vecino.Nodo.Id}"
                    : $"{vecino.Nodo.Id}|{nodo.Id}";

                if (!aristas.Add(clave)) continue;

                listaConexiones.Add(new Conexion
                {
                    Origen = nodo.Id,
                    Destino = vecino.Nodo.Id,
                    DistanciaKm = vecino.Distancia
                });
            }
        }

        _logger.LogInformation(
            "Conexiones generadas por proximidad ({Vecinos} vecinos por municipio): {Total}",
            _vecinosCercanos,
            listaConexiones.Count);

        return listaConexiones;
    }

    private static char DetectDelimiter(string headerLine) =>
        headerLine.Contains(';') ? ';' : ',';

    private static List<string> ParseCsvLine(string line, char delimiter) =>
        line.Split(delimiter).Select(c => c.Trim()).ToList();

    private static int IndexOfHeader(List<string> headers, params string[] names) =>
        headers.FindIndex(h => names.Any(n => h.Equals(n, StringComparison.OrdinalIgnoreCase)));

    private static double ParseDouble(string value) =>
        double.Parse(value.Replace(',', '.'), CultureInfo.InvariantCulture);

    private double CalcularDistanciaEntreNodos(string idOrigen, string idDestino)
    {
        var nodoOrigen = ObtenerNodoPorId(idOrigen);
        var nodoDestino = ObtenerNodoPorId(idDestino);

        if (nodoOrigen is null || nodoDestino is null)
        {
            _logger.LogWarning("No se pudo calcular distancia entre {Origen} y {Destino}", idOrigen, idDestino);
            return 0.0;
        }

        return CalcularDistanciaHaversine(
            nodoOrigen.Latitud, nodoOrigen.Longitud,
            nodoDestino.Latitud, nodoDestino.Longitud);
    }

    private static double CalcularDistanciaHaversine(double lat1, double lon1, double lat2, double lon2)
    {
        const int radioTierraKm = 6371;

        var lat1Rad = lat1 * Math.PI / 180.0;
        var lat2Rad = lat2 * Math.PI / 180.0;
        var deltaLatRad = (lat2 - lat1) * Math.PI / 180.0;
        var deltaLonRad = (lon2 - lon1) * Math.PI / 180.0;

        var a = Math.Sin(deltaLatRad / 2) * Math.Sin(deltaLatRad / 2) +
                Math.Cos(lat1Rad) * Math.Cos(lat2Rad) *
                Math.Sin(deltaLonRad / 2) * Math.Sin(deltaLonRad / 2);

        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        var distancia = radioTierraKm * c;

        return Math.Round(distancia * 100.0) / 100.0;
    }

    public GrafoData ObtenerGrafoCompleto() =>
        new() { Nodos = ObtenerNodosConectados(), Conexiones = _conexiones };

    public List<Nodo> ObtenerNodos() => ObtenerNodosConectados();

    private List<Nodo> ObtenerNodosConectados()
    {
        var idsConectados = new HashSet<string>();
        foreach (var conexion in _conexiones)
        {
            idsConectados.Add(conexion.Origen);
            idsConectados.Add(conexion.Destino);
        }

        return _nodos
            .Where(n => idsConectados.Contains(n.Id))
            .OrderBy(n => n.Nombre, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public List<Conexion> ObtenerConexiones() => _conexiones;

    public Nodo? ObtenerNodoPorId(string id) =>
        _nodos.FirstOrDefault(n => n.Id == id);

    public List<ExcentricidadInfo> CalcularExcentricidades()
    {
        var resultados = new List<ExcentricidadInfo>();
        var grafoAdyacencia = ConstruirGrafoAdyacencia();

        foreach (var nodo in ObtenerNodosConectados())
        {
            var detalle = CalcularExcentricidadConCamino(nodo.Id, grafoAdyacencia);
            resultados.Add(detalle);
        }

        return resultados
            .OrderBy(e => e.Excentricidad)
            .ThenBy(e => e.NodoNombre, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public ExcentricidadesCompletas CalcularExcentricidadesCompletas()
    {
        var grafoAdyacencia = ConstruirGrafoAdyacencia();
        var excentricidades = CalcularExcentricidades();

        if (excentricidades.Count == 0)
        {
            return new ExcentricidadesCompletas();
        }

        var radio = excentricidades[0].Excentricidad;
        var diametro = excentricidades[^1].Excentricidad;

        var top3Excentricidades = excentricidades
            .Select(e => e.Excentricidad)
            .Distinct()
            .OrderBy(e => e)
            .Take(3)
            .ToList();

        var centrosInfo = excentricidades
            .Where(e => top3Excentricidades.Contains(e.Excentricidad))
            .OrderBy(e => e.NodoNombre, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var nodosRadioInfo = excentricidades
            .Where(e => Math.Abs(e.Excentricidad - radio) < 0.0001)
            .OrderBy(e => e.NodoNombre, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var nodosDiametroInfo = excentricidades
            .Where(e => Math.Abs(e.Excentricidad - diametro) < 0.0001)
            .OrderBy(e => e.NodoNombre, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var caminoDiametro = CalcularCaminoDiametro(grafoAdyacencia);
        var origenDiametro = caminoDiametro.Count > 0 ? caminoDiametro[0] : string.Empty;
        var destinoDiametro = caminoDiametro.Count > 0 ? caminoDiametro[^1] : string.Empty;

        return new ExcentricidadesCompletas
        {
            Excentricidades = excentricidades,
            Radio = radio,
            Diametro = diametro,
            Centros = centrosInfo.Select(e => e.NodoId).ToList(),
            NodosRadio = nodosRadioInfo.Select(e => e.NodoId).ToList(),
            NodosDiametro = nodosDiametroInfo.Select(e => e.NodoId).ToList(),
            CentrosNombres = centrosInfo.Select(e => e.NodoNombre).ToList(),
            NodosRadioNombres = nodosRadioInfo.Select(e => e.NodoNombre).ToList(),
            NodosDiametroNombres = nodosDiametroInfo.Select(e => e.NodoNombre).ToList(),
            CaminoDiametroIds = caminoDiametro,
            CaminoDiametroNombres = caminoDiametro.Select(id => ObtenerNombreNodo(id)).ToList(),
            DiametroOrigenId = origenDiametro,
            DiametroDestinoId = destinoDiametro,
            DiametroOrigenNombre = ObtenerNombreNodo(origenDiametro),
            DiametroDestinoNombre = ObtenerNombreNodo(destinoDiametro)
        };
    }

    private string ObtenerNombreNodo(string id) =>
        _nodos.FirstOrDefault(n => n.Id == id)?.Nombre ?? id;

    private Dictionary<string, List<Conexion>> ConstruirGrafoAdyacencia()
    {
        var grafo = new Dictionary<string, List<Conexion>>();

        foreach (var nodo in _nodos)
        {
            grafo[nodo.Id] = [];
        }

        foreach (var conexion in _conexiones)
        {
            if (!grafo.TryGetValue(conexion.Origen, out var origenList))
            {
                Console.Error.WriteLine($"ERROR: El nodo origen '{conexion.Origen}' en conexiones no existe en el archivo de nodos");
                continue;
            }

            if (!grafo.TryGetValue(conexion.Destino, out var destinoList))
            {
                Console.Error.WriteLine($"ERROR: El nodo destino '{conexion.Destino}' en conexiones no existe en el archivo de nodos");
                continue;
            }

            origenList.Add(conexion);
            destinoList.Add(new Conexion
            {
                Origen = conexion.Destino,
                Destino = conexion.Origen,
                DistanciaKm = conexion.DistanciaKm
            });
        }

        return grafo;
    }

    private ExcentricidadInfo CalcularExcentricidadConCamino(string nodoId, Dictionary<string, List<Conexion>> grafoAdyacencia)
    {
        var (saltos, padres) = BfsConPadres(nodoId, grafoAdyacencia);
        var maxSaltos = 0;

        foreach (var numSaltos in saltos.Values)
        {
            if (numSaltos != int.MaxValue && numSaltos > maxSaltos)
            {
                maxSaltos = numSaltos;
            }
        }

        if (maxSaltos == 0)
        {
            return new ExcentricidadInfo
            {
                NodoId = nodoId,
                NodoNombre = ObtenerNombreNodo(nodoId),
                Excentricidad = 0,
                DestinoMasLejanoId = nodoId,
                DestinoMasLejanoNombre = ObtenerNombreNodo(nodoId),
                CaminoIds = [nodoId],
                CaminoNombres = [ObtenerNombreNodo(nodoId)]
            };
        }

        var destinoId = saltos
            .Where(kv => kv.Value == maxSaltos)
            .Select(kv => kv.Key)
            .OrderBy(id => ObtenerNombreNodo(id), StringComparer.OrdinalIgnoreCase)
            .First();

        var caminoIds = ReconstruirCamino(destinoId, nodoId, padres);

        return new ExcentricidadInfo
        {
            NodoId = nodoId,
            NodoNombre = ObtenerNombreNodo(nodoId),
            Excentricidad = maxSaltos,
            DestinoMasLejanoId = destinoId,
            DestinoMasLejanoNombre = ObtenerNombreNodo(destinoId),
            CaminoIds = caminoIds,
            CaminoNombres = caminoIds.Select(ObtenerNombreNodo).ToList()
        };
    }

    private List<string> CalcularCaminoDiametro(Dictionary<string, List<Conexion>> grafoAdyacencia)
    {
        var conectados = ObtenerNodosConectados();
        if (conectados.Count == 0)
        {
            return [];
        }

        var inicio = conectados[0].Id;
        var (saltos1, _) = BfsConPadres(inicio, grafoAdyacencia);
        var extremoA = saltos1
            .Where(kv => kv.Value != int.MaxValue)
            .OrderByDescending(kv => kv.Value)
            .ThenBy(kv => ObtenerNombreNodo(kv.Key), StringComparer.OrdinalIgnoreCase)
            .First().Key;

        var (saltos2, padres2) = BfsConPadres(extremoA, grafoAdyacencia);
        var extremoB = saltos2
            .Where(kv => kv.Value != int.MaxValue)
            .OrderByDescending(kv => kv.Value)
            .ThenBy(kv => ObtenerNombreNodo(kv.Key), StringComparer.OrdinalIgnoreCase)
            .First().Key;

        return ReconstruirCamino(extremoB, extremoA, padres2);
    }

    private static List<string> ReconstruirCamino(string destino, string origen, Dictionary<string, string?> padres)
    {
        var camino = new List<string>();
        var actual = destino;

        while (actual != null)
        {
            camino.Add(actual);
            if (actual == origen)
            {
                break;
            }

            actual = padres.GetValueOrDefault(actual);
        }

        camino.Reverse();
        return camino;
    }

    private static (Dictionary<string, int> Saltos, Dictionary<string, string?> Padres) BfsConPadres(
        string origen,
        Dictionary<string, List<Conexion>> grafo)
    {
        var saltos = grafo.Keys.ToDictionary(k => k, _ => int.MaxValue);
        var padres = grafo.Keys.ToDictionary(k => k, _ => (string?)null);
        var visitados = new HashSet<string>();
        var cola = new Queue<string>();

        saltos[origen] = 0;
        cola.Enqueue(origen);
        visitados.Add(origen);

        while (cola.Count > 0)
        {
            var nodoActual = cola.Dequeue();
            var saltosActuales = saltos[nodoActual];

            if (!grafo.TryGetValue(nodoActual, out var vecinos))
            {
                continue;
            }

            foreach (var vecino in vecinos.Select(c => c.Destino))
            {
                if (visitados.Contains(vecino))
                {
                    continue;
                }

                visitados.Add(vecino);
                saltos[vecino] = saltosActuales + 1;
                padres[vecino] = nodoActual;
                cola.Enqueue(vecino);
            }
        }

        return (saltos, padres);
    }

    public List<ExcentricidadInfo> ObtenerNodosCentro()
    {
        var excentricidades = CalcularExcentricidades();
        if (excentricidades.Count == 0) return [];

        var nodosConectados = excentricidades.Where(e => e.Excentricidad > 0).ToList();
        if (nodosConectados.Count == 0) return [];

        var radio = nodosConectados[0].Excentricidad;
        var centros = nodosConectados
            .Where(e => Math.Abs(e.Excentricidad - radio) < 0.01)
            .ToList();

        if (centros.Count < 5)
        {
            var excentricidadesUnicas = nodosConectados.Select(e => e.Excentricidad).Distinct().Count();
            if (excentricidadesUnicas > 1)
            {
                var segundaMenor = nodosConectados
                    .Where(e => e.Excentricidad > radio)
                    .Min(e => e.Excentricidad);

                var segundoNivel = nodosConectados
                    .Where(e => Math.Abs(e.Excentricidad - segundaMenor) < 0.01)
                    .ToList();

                centros.AddRange(segundoNivel);
            }
        }

        return centros;
    }

    public RutasInfo CalcularRutas(string origen, string destino)
    {
        var grafo = ConstruirGrafoAdyacencia();
        var rutaOptima = CalcularRutaOptima(origen, destino, grafo);
        var rutasPosibles = EncontrarTodasLasRutas(origen, destino, grafo);

        return new RutasInfo
        {
            RutaOptima = rutaOptima,
            RutasPosibles = rutasPosibles,
            NodoOrigen = origen,
            NodoDestino = destino
        };
    }

    private RutasInfo.RutaDetalle CalcularRutaOptima(string origen, string destino, Dictionary<string, List<Conexion>> grafo)
    {
        var distancias = new Dictionary<string, double>();
        var predecesores = new Dictionary<string, string?>();
        var cola = new PriorityQueue<string, double>();
        var visitados = new HashSet<string>();

        foreach (var nodoId in grafo.Keys)
        {
            distancias[nodoId] = double.PositiveInfinity;
            predecesores[nodoId] = null;
        }

        distancias[origen] = 0;
        cola.Enqueue(origen, 0);

        while (cola.Count > 0)
        {
            var nodoActual = cola.Dequeue();
            if (visitados.Contains(nodoActual)) continue;
            visitados.Add(nodoActual);

            if (nodoActual == destino) break;

            foreach (var conexion in grafo.GetValueOrDefault(nodoActual, []))
            {
                var vecino = conexion.Destino;
                var nuevaDistancia = distancias[nodoActual] + conexion.DistanciaKm;

                if (nuevaDistancia < distancias.GetValueOrDefault(vecino, double.PositiveInfinity))
                {
                    distancias[vecino] = nuevaDistancia;
                    predecesores[vecino] = nodoActual;
                    cola.Enqueue(vecino, nuevaDistancia);
                }
            }
        }

        var ruta = new List<string>();
        string? nodo = destino;
        while (nodo is not null)
        {
            ruta.Insert(0, nodo);
            nodo = predecesores.GetValueOrDefault(nodo);
        }

        return CrearRutaDetalle(ruta, distancias.GetValueOrDefault(destino, 0));
    }

    private List<RutasInfo.RutaDetalle> EncontrarTodasLasRutas(string origen, string destino, Dictionary<string, List<Conexion>> grafo)
    {
        var todasLasRutas = new List<RutasInfo.RutaDetalle>();
        var rutaActual = new List<string>();
        var visitados = new HashSet<string>();

        _logger.LogInformation("Buscando todas las rutas entre {Origen} y {Destino}", origen, destino);
        DfsRutas(origen, destino, grafo, rutaActual, visitados, todasLasRutas);

        var rutasUnicas = new HashSet<string>();
        var rutasSinDuplicados = new List<RutasInfo.RutaDetalle>();

        foreach (var ruta in todasLasRutas)
        {
            var clave = string.Join("->", ruta.Nodos);
            if (rutasUnicas.Add(clave))
            {
                rutasSinDuplicados.Add(ruta);
            }
        }

        return rutasSinDuplicados
            .OrderBy(r => r.DistanciaTotal)
            .Take(30)
            .ToList();
    }

    private void DfsRutas(
        string actual,
        string destino,
        Dictionary<string, List<Conexion>> grafo,
        List<string> rutaActual,
        HashSet<string> visitados,
        List<RutasInfo.RutaDetalle> todasLasRutas)
    {
        rutaActual.Add(actual);
        visitados.Add(actual);

        if (actual == destino)
        {
            todasLasRutas.Add(CrearRutaDetalleDesdeCamino(rutaActual, grafo));
        }
        else if (todasLasRutas.Count < 100)
        {
            foreach (var conexion in grafo.GetValueOrDefault(actual, []))
            {
                if (!visitados.Contains(conexion.Destino) && rutaActual.Count < 40)
                {
                    DfsRutas(conexion.Destino, destino, grafo, rutaActual, visitados, todasLasRutas);
                }
            }
        }

        rutaActual.RemoveAt(rutaActual.Count - 1);
        visitados.Remove(actual);
    }

    private RutasInfo.RutaDetalle CrearRutaDetalle(List<string> ruta, double distanciaTotal)
    {
        var nombres = ruta
            .Select(id => _nodos.FirstOrDefault(n => n.Id == id)?.Nombre ?? id)
            .ToList();

        return new RutasInfo.RutaDetalle
        {
            Nodos = ruta,
            NombresNodos = nombres,
            DistanciaTotal = distanciaTotal,
            NumeroSaltos = Math.Max(0, ruta.Count - 1)
        };
    }

    private RutasInfo.RutaDetalle CrearRutaDetalleDesdeCamino(List<string> camino, Dictionary<string, List<Conexion>> grafo)
    {
        var distanciaTotal = 0.0;

        for (var i = 0; i < camino.Count - 1; i++)
        {
            var nodoOrigen = camino[i];
            var nodoDestino = camino[i + 1];

            foreach (var c in grafo.GetValueOrDefault(nodoOrigen, []))
            {
                if (c.Destino == nodoDestino)
                {
                    distanciaTotal += c.DistanciaKm;
                    break;
                }
            }
        }

        return CrearRutaDetalle([.. camino], distanciaTotal);
    }

    public CiclosInfo EncontrarCiclos(string nodoInicio)
    {
        var grafo = ConstruirGrafoAdyacencia();
        _logger.LogInformation("Buscando ciclos desde el nodo {NodoInicio}", nodoInicio);

        return new CiclosInfo
        {
            NodoInicio = nodoInicio,
            CiclosSimples = EncontrarCiclosSimples(nodoInicio, grafo),
            CiclosGenerales = EncontrarCiclosGenerales(nodoInicio, grafo)
        };
    }

    private List<CiclosInfo.CicloDetalle> EncontrarCiclosSimples(string nodoInicio, Dictionary<string, List<Conexion>> grafo)
    {
        var ciclos = new List<CiclosInfo.CicloDetalle>();
        var caminoActual = new List<string>();
        var visitados = new HashSet<string>();

        DfsCiclosSimples(nodoInicio, nodoInicio, grafo, caminoActual, visitados, ciclos, true);

        var ciclosUnicos = new HashSet<string>();
        var ciclosSinDuplicados = new List<CiclosInfo.CicloDetalle>();

        foreach (var ciclo in ciclos)
        {
            var clave = GenerarClaveCiclo(ciclo.Nodos);
            if (ciclosUnicos.Add(clave))
            {
                ciclosSinDuplicados.Add(ciclo);
            }
        }

        return ciclosSinDuplicados
            .OrderBy(c => c.NumeroSaltos)
            .Take(50)
            .ToList();
    }

    private void DfsCiclosSimples(
        string nodoInicio,
        string actual,
        Dictionary<string, List<Conexion>> grafo,
        List<string> caminoActual,
        HashSet<string> visitados,
        List<CiclosInfo.CicloDetalle> ciclos,
        bool primerNodo)
    {
        if (!primerNodo && actual == nodoInicio && caminoActual.Count >= 3)
        {
            AgregarCiclo(caminoActual, ciclos, grafo);
            return;
        }

        if (visitados.Contains(actual)) return;
        if (caminoActual.Count >= 15) return;

        caminoActual.Add(actual);
        visitados.Add(actual);

        foreach (var conexion in grafo.GetValueOrDefault(actual, []))
        {
            var vecino = conexion.Destino;

            if (vecino == nodoInicio && caminoActual.Count >= 3)
            {
                caminoActual.Add(vecino);
                AgregarCiclo(caminoActual, ciclos, grafo);
                caminoActual.RemoveAt(caminoActual.Count - 1);
            }
            else if (!visitados.Contains(vecino))
            {
                DfsCiclosSimples(nodoInicio, vecino, grafo, caminoActual, visitados, ciclos, false);
            }
        }

        caminoActual.RemoveAt(caminoActual.Count - 1);
        visitados.Remove(actual);
    }

    private List<CiclosInfo.CicloDetalle> EncontrarCiclosGenerales(string nodoInicio, Dictionary<string, List<Conexion>> grafo)
    {
        var ciclos = new List<CiclosInfo.CicloDetalle>();
        var caminoActual = new List<string>();

        DfsCiclosGenerales(nodoInicio, nodoInicio, grafo, caminoActual, ciclos, true);

        var ciclosUnicos = new HashSet<string>();
        var ciclosSinDuplicados = new List<CiclosInfo.CicloDetalle>();

        foreach (var ciclo in ciclos)
        {
            var clave = string.Join("->", ciclo.Nodos);
            if (ciclosUnicos.Add(clave))
            {
                ciclosSinDuplicados.Add(ciclo);
            }
        }

        return ciclosSinDuplicados
            .OrderBy(c => c.NumeroSaltos)
            .Take(50)
            .ToList();
    }

    private void DfsCiclosGenerales(
        string nodoInicio,
        string actual,
        Dictionary<string, List<Conexion>> grafo,
        List<string> caminoActual,
        List<CiclosInfo.CicloDetalle> ciclos,
        bool primerNodo)
    {
        if (!primerNodo && actual == nodoInicio && caminoActual.Count >= 3)
        {
            AgregarCiclo(caminoActual, ciclos, grafo);
            return;
        }

        if (caminoActual.Count >= 20) return;
        if (ciclos.Count >= 100) return;

        caminoActual.Add(actual);

        foreach (var conexion in grafo.GetValueOrDefault(actual, []))
        {
            var vecino = conexion.Destino;

            if (vecino == nodoInicio && caminoActual.Count >= 3)
            {
                caminoActual.Add(vecino);
                AgregarCiclo(caminoActual, ciclos, grafo);
                caminoActual.RemoveAt(caminoActual.Count - 1);
            }
            else
            {
                var contadorNodo = caminoActual.Count(n => n == vecino);
                if (contadorNodo < 2)
                {
                    DfsCiclosGenerales(nodoInicio, vecino, grafo, caminoActual, ciclos, false);
                }
            }
        }

        caminoActual.RemoveAt(caminoActual.Count - 1);
    }

    private void AgregarCiclo(
        List<string> camino,
        List<CiclosInfo.CicloDetalle> ciclos,
        Dictionary<string, List<Conexion>> grafo)
    {
        var distanciaTotal = 0.0;

        for (var i = 0; i < camino.Count - 1; i++)
        {
            var origen = camino[i];
            var destino = camino[i + 1];

            foreach (var c in grafo.GetValueOrDefault(origen, []))
            {
                if (c.Destino == destino)
                {
                    distanciaTotal += c.DistanciaKm;
                    break;
                }
            }
        }

        var nombres = camino
            .Select(id => _nodos.FirstOrDefault(n => n.Id == id)?.Nombre ?? id)
            .ToList();

        ciclos.Add(new CiclosInfo.CicloDetalle
        {
            Nodos = [.. camino],
            NombresNodos = nombres,
            DistanciaTotal = distanciaTotal,
            NumeroSaltos = camino.Count - 1
        });
    }

    private static string GenerarClaveCiclo(List<string> nodos)
    {
        if (nodos.Count == 0) return string.Empty;

        var nodosNormalizados = new List<string>(nodos);
        if (nodosNormalizados.Count > 1 &&
            nodosNormalizados[0] == nodosNormalizados[^1])
        {
            nodosNormalizados.RemoveAt(nodosNormalizados.Count - 1);
        }

        var nodoMin = nodosNormalizados.Min() ?? string.Empty;
        var indexMin = nodosNormalizados.IndexOf(nodoMin);

        var rotado = new List<string>();
        for (var i = 0; i < nodosNormalizados.Count; i++)
        {
            rotado.Add(nodosNormalizados[(indexMin + i) % nodosNormalizados.Count]);
        }

        var reversa = rotado.ToList();
        reversa.Reverse();

        var claveNormal = string.Join("->", rotado);
        var claveReversa = string.Join("->", reversa);

        return string.Compare(claveNormal, claveReversa, StringComparison.Ordinal) <= 0
            ? claveNormal
            : claveReversa;
    }
}
