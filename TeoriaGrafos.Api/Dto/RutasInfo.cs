namespace TeoriaGrafos.Api.Dto;

public class RutasInfo
{
    public RutaDetalle? RutaOptima { get; set; }
    public List<RutaDetalle> RutasPosibles { get; set; } = [];
    public string NodoOrigen { get; set; } = string.Empty;
    public string NodoDestino { get; set; } = string.Empty;

    public class RutaDetalle
    {
        public List<string> Nodos { get; set; } = [];
        public List<string> NombresNodos { get; set; } = [];
        public double DistanciaTotal { get; set; }
        public int NumeroSaltos { get; set; }
    }
}
