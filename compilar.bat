@echo off
cd /d "%~dp0"
dotnet build TeoriaGrafos.Api\TeoriaGrafos.Api.csproj
if errorlevel 1 pause
exit /b %errorlevel%
