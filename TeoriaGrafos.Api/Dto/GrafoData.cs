using TeoriaGrafos.Api.Models;

namespace TeoriaGrafos.Api.Dto;

public class GrafoData
{
    public List<Nodo> Nodos { get; set; } = [];
    public List<Conexion> Conexiones { get; set; } = [];
}
