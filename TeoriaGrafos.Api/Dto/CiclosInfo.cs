namespace TeoriaGrafos.Api.Dto;

public class CiclosInfo
{
    public string NodoInicio { get; set; } = string.Empty;
    public List<CicloDetalle> CiclosSimples { get; set; } = [];
    public List<CicloDetalle> CiclosGenerales { get; set; } = [];

    public class CicloDetalle
    {
        public List<string> Nodos { get; set; } = [];
        public List<string> NombresNodos { get; set; } = [];
        public double DistanciaTotal { get; set; }
        public int NumeroSaltos { get; set; }
    }
}
