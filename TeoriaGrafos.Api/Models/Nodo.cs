namespace TeoriaGrafos.Api.Models;

public class Nodo
{
    public string Id { get; set; } = string.Empty;
    public string Nombre { get; set; } = string.Empty;
    public double Latitud { get; set; }
    public double Longitud { get; set; }
}
