# ============================================================
# Formula Master - Production Deployment Script
# ============================================================
#
# This script helps you deploy the Formula Master application
# for production use in a local network environment.
#
# Prerequisites:
#   - Node.js 18+ installed
#   - MongoDB 7+ running locally
#   - PM2 installed globally (npm install -g pm2)
#
# Usage:
#   .\scripts\start-production.ps1
#
# ============================================================

param(
    [switch]$Build,      # Force rebuild
    [switch]$Install,    # Force npm install
    [int]$Port = 3000    # Port to run on
)

$ErrorActionPreference = "Stop"

Write-Host "=========================================="
Write-Host "Formula Master Production Deployment"
Write-Host "=========================================="
Write-Host ""

# Configuration
$APP_DIR = "C:\Dev\private"
$MONGODB_URI = "mongodb://127.0.0.1:27017/formula-master"

# Step 1: Check prerequisites
Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Cyan

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "  ✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Node.js not found. Please install Node.js 18+" -ForegroundColor Red
    exit 1
}

# Check MongoDB
try {
    $mongoStatus = Get-Service MongoDB -ErrorAction Stop
    if ($mongoStatus.Status -eq "Running") {
        Write-Host "  ✅ MongoDB: Running" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  MongoDB service not running, attempting to start..." -ForegroundColor Yellow
        Start-Service MongoDB
        Write-Host "  ✅ MongoDB: Started" -ForegroundColor Green
    }
} catch {
    Write-Host "  ❌ MongoDB service not found. Please install MongoDB Community Server" -ForegroundColor Red
    exit 1
}

# Check PM2
try {
    $pm2Version = pm2 --version 2>&1
    Write-Host "  ✅ PM2: v$pm2Version" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️  PM2 not found, installing..." -ForegroundColor Yellow
    npm install -g pm2
    Write-Host "  ✅ PM2: Installed" -ForegroundColor Green
}

# Step 2: Install dependencies if needed
Write-Host ""
Write-Host "[2/6] Checking dependencies..." -ForegroundColor Cyan

Set-Location $APP_DIR

if ($Install -or !(Test-Path "node_modules")) {
    Write-Host "  Installing npm packages..."
    npm install
    Write-Host "  ✅ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "  ✅ Dependencies already installed" -ForegroundColor Green
}

# Step 3: Build production bundle
Write-Host ""
Write-Host "[3/6] Building production bundle..." -ForegroundColor Cyan

if ($Build -or !(Test-Path ".next")) {
    $env:MONGODB_URI = $MONGODB_URI
    npm run build
    Write-Host "  ✅ Production build complete" -ForegroundColor Green
} else {
    Write-Host "  ✅ Production build exists" -ForegroundColor Green
}

# Step 4: Configure firewall
Write-Host ""
Write-Host "[4/6] Configuring firewall..." -ForegroundColor Cyan

$firewallRule = Get-NetFirewallRule -DisplayName "Formula Master App" -ErrorAction SilentlyContinue
if (!$firewallRule) {
    try {
        New-NetFirewallRule -DisplayName "Formula Master App" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
        Write-Host "  ✅ Firewall rule created for port $Port" -ForegroundColor Green
    } catch {
        Write-Host "  ⚠️  Could not create firewall rule (run as Administrator)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✅ Firewall rule exists" -ForegroundColor Green
}

# Step 5: Start application with PM2
Write-Host ""
Write-Host "[5/6] Starting application..." -ForegroundColor Cyan

# Stop existing instance if running
$existingProcess = pm2 jlist | ConvertFrom-Json | Where-Object { $_.name -eq "formula-master" }
if ($existingProcess) {
    Write-Host "  Stopping existing instance..."
    pm2 stop formula-master 2>&1 | Out-Null
    pm2 delete formula-master 2>&1 | Out-Null
}

# Start with ecosystem config
pm2 start ecosystem.config.js
pm2 save

Write-Host "  ✅ Application started" -ForegroundColor Green

# Step 6: Display status
Write-Host ""
Write-Host "[6/6] Deployment complete!" -ForegroundColor Cyan
Write-Host ""

# Get local IP addresses
$ipAddresses = Get-NetIPAddress | Where-Object { 
    $_.AddressFamily -eq "IPv4" -and 
    $_.PrefixOrigin -eq "Dhcp" -and
    $_.IPAddress -notlike "169.*"
} | Select-Object -ExpandProperty IPAddress

Write-Host "=========================================="
Write-Host "ACCESS INFORMATION" -ForegroundColor Green
Write-Host "=========================================="
Write-Host ""
Write-Host "Local access:" -ForegroundColor Yellow
Write-Host "  http://localhost:$Port"
Write-Host ""
Write-Host "Network access (for other computers on LAN):" -ForegroundColor Yellow
foreach ($ip in $ipAddresses) {
    Write-Host "  http://${ip}:$Port"
}
Write-Host ""
Write-Host "=========================================="
Write-Host "MANAGEMENT COMMANDS" -ForegroundColor Green
Write-Host "=========================================="
Write-Host ""
Write-Host "View status:     pm2 status"
Write-Host "View logs:       pm2 logs formula-master"
Write-Host "Restart app:     pm2 restart formula-master"
Write-Host "Stop app:        pm2 stop formula-master"
Write-Host ""
Write-Host "=========================================="
