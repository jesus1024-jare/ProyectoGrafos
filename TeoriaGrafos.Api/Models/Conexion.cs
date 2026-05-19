namespace TeoriaGrafos.Api.Models;

public class Conexion
{
    public string Origen { get; set; } = string.Empty;
    public string Destino { get; set; } = string.Empty;
    public double DistanciaKm { get; set; }
}
