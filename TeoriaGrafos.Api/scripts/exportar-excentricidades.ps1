# Exporta excentricidades desde la API a JSON con comprobaciones de consistencia.
# Uso: .\scripts\exportar-excentricidades.ps1
#      .\scripts\exportar-excentricidades.ps1 -BaseUrl http://localhost:8081

param(
    [string]$BaseUrl = "http://localhost:8081",
    [string]$Salida = "Data/excentricidades-verificacion.json"
)

$ErrorActionPreference = "Stop"
$uri = "$BaseUrl/api/grafos/excentricidades-completas"
Write-Host "Consultando $uri ..."

$data = Invoke-RestMethod -Uri $uri -Method Get
$lista = @($data.excentricidades)

$porValor = @{}
foreach ($e in $lista) {
    $k = [string]$e.excentricidad
    if (-not $porValor.ContainsKey($k)) { $porValor[$k] = 0 }
    $porValor[$k]++
}

$minExc = ($lista | Measure-Object -Property excentricidad -Minimum).Minimum
$maxExc = ($lista | Measure-Object -Property excentricidad -Maximum).Maximum

$reporte = [ordered]@{
    generadoEn          = (Get-Date).ToString("o")
    fuenteApi           = $uri
    configuracion       = [ordered]@{
        nodesFile         = "Data/municipalities.csv"
        connectionsFile   = "(vacío = 4 vecinos geográficos más cercanos)"
        nearestNeighbors  = 4
    }
    resumen             = [ordered]@{
        totalMunicipios   = $lista.Count
        radioSaltos       = $data.radio
        diametroSaltos    = $data.diametro
        municipiosRadio   = @($data.nodosRadio).Count
        municipiosCentro  = @($data.centros).Count
        municipiosDiametro = @($data.nodosDiametro).Count
        distribucionPorExcentricidad = $porValor
    }
    comprobaciones      = [ordered]@{
        radioCoincideConMinimo    = ($data.radio -eq $minExc)
        diametroCoincideConMaximo = ($data.diametro -eq $maxExc)
        todosLosRadioEnLista      = (@($data.nodosRadio | Where-Object { $eid = $_; -not ($lista | Where-Object { $_.nodoId -eq $eid -and $_.excentricidad -eq $data.radio }) })).Count -eq 0
        todosLosDiametroEnLista   = (@($data.nodosDiametro | Where-Object { $eid = $_; -not ($lista | Where-Object { $_.nodoId -eq $eid -and $_.excentricidad -eq $data.diametro }) })).Count -eq 0
        explicacionColores       = [ordered]@{
            naranja = "excentricidad = radio ($($data.radio))"
            verde   = "excentricidad entre las 3 menores distintas"
            rojo    = "excentricidad = diametro ($($data.diametro))"
            azul    = "resto de municipios"
        }
    }
    nodosRadio          = [ordered]@{
        ids    = $data.nodosRadio
        nombres = $data.nodosRadioNombres
    }
    nodosDiametro       = [ordered]@{
        ids    = $data.nodosDiametro
        nombres = $data.nodosDiametroNombres
    }
    nodosCentro         = [ordered]@{
        ids    = $data.centros
        nombres = $data.centrosNombres
    }
    excentricidades     = $lista | ForEach-Object {
        $tipo = "normal"
        if ($data.nodosRadio -contains $_.nodoId) { $tipo = "radio" }
        elseif ($data.centros -contains $_.nodoId) { $tipo = "centro" }
        elseif ($data.nodosDiametro -contains $_.nodoId) { $tipo = "diametro" }
        [ordered]@{
            nodoId        = $_.nodoId
            nodoNombre    = $_.nodoNombre
            excentricidad = $_.excentricidad
            tipoEnMapa    = $tipo
        }
    }
}

$json = $reporte | ConvertTo-Json -Depth 8
$outPath = Join-Path (Split-Path $PSScriptRoot -Parent) $Salida
$json | Set-Content -Path $outPath -Encoding utf8
Write-Host "Guardado: $outPath"
Write-Host "Radio=$($data.radio) | Diametro=$($data.diametro) | Rojos=$(@($data.nodosDiametro).Count) | Verificacion OK=$($reporte.comprobaciones.diametroCoincideConMaximo)"
