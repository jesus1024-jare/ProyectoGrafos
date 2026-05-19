namespace TeoriaGrafos.Api.Dto;

public class ExcentricidadesCompletas
{
    public List<ExcentricidadInfo> Excentricidades { get; set; } = [];
    public double Radio { get; set; }
    public double Diametro { get; set; }
    public List<string> Centros { get; set; } = [];
    public List<string> NodosRadio { get; set; } = [];
    public List<string> NodosDiametro { get; set; } = [];
    public List<string> CentrosNombres { get; set; } = [];
    public List<string> NodosRadioNombres { get; set; } = [];
    public List<string> NodosDiametroNombres { get; set; } = [];
    public List<string> CaminoDiametroIds { get; set; } = [];
    public List<string> CaminoDiametroNombres { get; set; } = [];
    public string DiametroOrigenId { get; set; } = string.Empty;
    public string DiametroDestinoId { get; set; } = string.Empty;
    public string DiametroOrigenNombre { get; set; } = string.Empty;
    public string DiametroDestinoNombre { get; set; } = string.Empty;
}
