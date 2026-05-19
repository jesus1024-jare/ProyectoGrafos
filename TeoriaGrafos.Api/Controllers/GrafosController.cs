using Microsoft.AspNetCore.Mvc;
using TeoriaGrafos.Api.Dto;
using TeoriaGrafos.Api.Models;
using TeoriaGrafos.Api.Services;

namespace TeoriaGrafos.Api.Controllers;

[ApiController]
[Route("api/grafos")]
public class GrafosController : ControllerBase
{
    private readonly GrafoService _grafoService;

    public GrafosController(GrafoService grafoService)
    {
        _grafoService = grafoService;
    }

    [HttpGet]
    public ActionResult<GrafoData> ObtenerGrafoCompleto() =>
        Ok(_grafoService.ObtenerGrafoCompleto());

    [HttpGet("nodos")]
    public ActionResult<List<Nodo>> ObtenerNodos() =>
        Ok(_grafoService.ObtenerNodos());

    [HttpGet("nodos/{id}")]
    public ActionResult<Nodo> ObtenerNodoPorId(string id)
    {
        var nodo = _grafoService.ObtenerNodoPorId(id);
        return nodo is null ? NotFound() : Ok(nodo);
    }

    [HttpGet("conexiones")]
    public ActionResult<List<Conexion>> ObtenerConexiones() =>
        Ok(_grafoService.ObtenerConexiones());

    [HttpGet("excentricidades")]
    public ActionResult<List<ExcentricidadInfo>> ObtenerExcentricidades() =>
        Ok(_grafoService.CalcularExcentricidades());

    [HttpGet("excentricidades-completas")]
    public ActionResult<ExcentricidadesCompletas> ObtenerExcentricidadesCompletas() =>
        Ok(_grafoService.CalcularExcentricidadesCompletas());

    [HttpGet("nodos-centro")]
    public ActionResult<List<ExcentricidadInfo>> ObtenerNodosCentro() =>
        Ok(_grafoService.ObtenerNodosCentro());

    [HttpGet("rutas")]
    public ActionResult<RutasInfo> CalcularRutas([FromQuery] string origen, [FromQuery] string destino) =>
        Ok(_grafoService.CalcularRutas(origen, destino));

    [HttpGet("ciclos")]
    public ActionResult<CiclosInfo> EncontrarCiclos([FromQuery] string nodoInicio) =>
        Ok(_grafoService.EncontrarCiclos(nodoInicio));
}
