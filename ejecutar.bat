@echo off
cd /d "%~dp0TeoriaGrafos.Api"
echo Iniciando aplicacion .NET en http://localhost:8081
echo Abre http://localhost:8081/mapa.html
echo (El proyecto Java usa el puerto 8080)
dotnet run
pause
