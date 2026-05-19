namespace TeoriaGrafos.Api.Dto;

public class ExcentricidadInfo
{
    public string NodoId { get; set; } = string.Empty;
    public string NodoNombre { get; set; } = string.Empty;
    public double Excentricidad { get; set; }
    public string DestinoMasLejanoId { get; set; } = string.Empty;
    public string DestinoMasLejanoNombre { get; set; } = string.Empty;
    public List<string> CaminoIds { get; set; } = [];
    public List<string> CaminoNombres { get; set; } = [];
}
