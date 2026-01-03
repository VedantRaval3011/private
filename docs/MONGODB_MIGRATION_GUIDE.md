# MongoDB Cloud to Local Migration Guide

## 📋 Overview

This guide covers the complete migration of your **Formula Master** application from MongoDB Atlas (cloud) to a local MongoDB server for offline, LAN-accessible deployment.

**Current Setup:**
- Database: MongoDB Atlas (cloud)
- Application: Next.js 16 with Mongoose 9
- Collections: Formula, Batch, COA, Requisition, ProcessingLog

---

## Phase 1: Local MongoDB Installation

### Step 1.1: Download MongoDB Community Server

1. Visit: https://www.mongodb.com/try/download/community
2. Select:
   - Version: **Latest 8.x** (or 7.x for stability)
   - Platform: **Windows x64**
   - Package: **MSI**
3. Download and run the installer

### Step 1.2: Install MongoDB

During installation:
```
✅ Complete Installation
✅ Install MongoDB as a Windows Service
✅ Run service as Network Service user
✅ Service Name: MongoDB
✅ Data Directory: C:\Program Files\MongoDB\Server\8.0\data
✅ Log Directory: C:\Program Files\MongoDB\Server\8.0\log
⬜ Install MongoDB Compass (optional but recommended)
```

### Step 1.3: Configure MongoDB for Security

Create/edit the MongoDB configuration file:
**Location:** `C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg`

```yaml
# MongoDB Configuration File

systemLog:
  destination: file
  path: C:\Program Files\MongoDB\Server\8.0\log\mongod.log
  logAppend: true

storage:
  dbPath: C:\Program Files\MongoDB\Server\8.0\data
  journal:
    enabled: true

net:
  port: 27017
  # For localhost only (most secure):
  bindIp: 127.0.0.1
  # For LAN access (required if server PC hosts MongoDB):
  # bindIp: 0.0.0.0

security:
  # Enable after initial setup and user creation
  # authorization: enabled
```

### Step 1.4: Verify MongoDB Service

Open PowerShell as Administrator:

```powershell
# Check if MongoDB service is running
Get-Service MongoDB

# Start MongoDB service if not running
Start-Service MongoDB

# Verify connection
mongosh --eval "db.runCommand({connectionStatus:1})"
```

---

## Phase 2: MongoDB Tools Installation

### Step 2.1: Install MongoDB Database Tools

1. Visit: https://www.mongodb.com/try/download/database-tools
2. Download the MSI package for Windows x64
3. Install to default location
4. Add to PATH: `C:\Program Files\MongoDB\Tools\100\bin`

Verify installation:
```powershell
mongodump --version
mongorestore --version
```

---

## Phase 3: Data Export from MongoDB Atlas

### Step 3.1: Get Your Atlas Connection String

From your `.env.local` file, you have a connection string like:
```
mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>
```

### Step 3.2: Export Complete Database

Open PowerShell and run:

```powershell
# Create backup directory
mkdir C:\mongodb-backups\atlas-export

# Export using mongodump (preserves BSON types, indexes)
mongodump --uri="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>" --out="C:\mongodb-backups\atlas-export"

# Alternative with specific database name
mongodump --uri="mongodb+srv://<username>:<password>@<cluster>.mongodb.net" --db="formula-master" --out="C:\mongodb-backups\atlas-export"
```

### Step 3.3: Verify Export

```powershell
# List exported files
Get-ChildItem -Recurse "C:\mongodb-backups\atlas-export"

# Expected structure:
# atlas-export/
# └── formula-master/
#     ├── batches.bson
#     ├── batches.metadata.json
#     ├── coas.bson
#     ├── coas.metadata.json
#     ├── formulas.bson
#     ├── formulas.metadata.json
#     ├── processinglogs.bson
#     ├── processinglogs.metadata.json
#     ├── requisitions.bson
#     └── requisitions.metadata.json
```

---

## Phase 4: Data Import to Local MongoDB

### Step 4.1: Import Database

```powershell
# Import to local MongoDB
mongorestore --uri="mongodb://localhost:27017" --db="formula-master" "C:\mongodb-backups\atlas-export\formula-master"

# With verbose output to see progress
mongorestore --uri="mongodb://localhost:27017" --db="formula-master" --verbose "C:\mongodb-backups\atlas-export\formula-master"
```

### Step 4.2: Verify Import

Connect to MongoDB and verify:

```powershell
# Open MongoDB shell
mongosh "mongodb://localhost:27017/formula-master"
```

Run these queries in the shell:

```javascript
// List all collections
show collections

// Count documents in each collection
db.formulas.countDocuments()
db.batches.countDocuments()
db.coas.countDocuments()
db.requisitions.countDocuments()
db.processinglogs.countDocuments()

// Verify indexes
db.formulas.getIndexes()
db.batches.getIndexes()
db.coas.getIndexes()
db.requisitions.getIndexes()

// Sample document check
db.formulas.findOne()
db.batches.findOne()
```

### Step 4.3: Create Comparison Report

Run this script in mongosh to compare counts (you'll need the online counts):

```javascript
print("=== Collection Statistics ===")
const collections = ["formulas", "batches", "coas", "requisitions", "processinglogs"];

for (const coll of collections) {
    const count = db.getCollection(coll).countDocuments();
    const indexes = db.getCollection(coll).getIndexes().length;
    print(`${coll}: ${count} documents, ${indexes} indexes`);
}
```

---

## Phase 5: Application Configuration

### Step 5.1: Update Environment Variables

Modify your `.env.local` file:

```bash
# OLD (Cloud)
# MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/formula-master

# NEW (Local)
MONGODB_URI=mongodb://localhost:27017/formula-master
```

### Step 5.2: For LAN Access (MongoDB on same server as app)

If MongoDB and the app are on the **SAME server** (recommended):
```bash
MONGODB_URI=mongodb://127.0.0.1:27017/formula-master
```

If MongoDB is on a **DIFFERENT server** within LAN:
```bash
MONGODB_URI=mongodb://192.168.1.100:27017/formula-master
```
*(Replace with actual MongoDB server IP)*

### Step 5.3: Production Build

```powershell
cd C:\Dev\private

# Install dependencies (if not already)
npm install

# Create production build
npm run build

# Test locally first
npm run start
```

---

## Phase 6: Multi-User LAN Setup

### Step 6.1: Configure Next.js for Network Access

Create or modify `next.config.ts`:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable production optimizations
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
```

### Step 6.2: Start Server with Network Binding

```powershell
# Production mode with network access
$env:NODE_ENV = "production"
$env:MONGODB_URI = "mongodb://127.0.0.1:27017/formula-master"

# Start on all interfaces (allows LAN access)
npx next start -H 0.0.0.0 -p 3000
```

### Step 6.3: Configure Windows Firewall

Open PowerShell as Administrator:

```powershell
# Allow Next.js app through firewall
New-NetFirewallRule -DisplayName "Formula Master App" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow

# If MongoDB needs network access (if on separate server)
New-NetFirewallRule -DisplayName "MongoDB Server" -Direction Inbound -Protocol TCP -LocalPort 27017 -Action Allow
```

### Step 6.4: Find Server IP Address

```powershell
# Get the LAN IP address
Get-NetIPAddress | Where-Object {$_.AddressFamily -eq "IPv4" -and $_.PrefixOrigin -eq "Dhcp"} | Select-Object IPAddress

# Or simpler
ipconfig | findstr "IPv4"
```

### Step 6.5: User Access

Users on the network can access the application at:
```
http://<server-ip>:3000
```

Example:
```
http://192.168.1.50:3000
```

---

## Phase 7: Run as Windows Service (Recommended)

### Step 7.1: Install PM2 for Process Management

```powershell
# Install PM2 globally
npm install -g pm2
npm install -g pm2-windows-startup

# Configure PM2 for Windows startup
pm2-startup install
```

### Step 7.2: Create PM2 Configuration

Create `ecosystem.config.js` in your project root:

```javascript
module.exports = {
  apps: [{
    name: 'formula-master',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -H 0.0.0.0 -p 3000',
    cwd: 'C:\\Dev\\private',
    env: {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/formula-master'
    },
    // Restart on failure
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    // Logging
    log_file: 'C:\\Dev\\private\\logs\\app.log',
    error_file: 'C:\\Dev\\private\\logs\\error.log',
    out_file: 'C:\\Dev\\private\\logs\\out.log',
    time: true
  }]
};
```

### Step 7.3: Start and Save

```powershell
# Create logs directory
mkdir C:\Dev\private\logs

# Start the application
pm2 start ecosystem.config.js

# Save process list
pm2 save

# Check status
pm2 status
```

---

## Phase 8: Performance Optimization

### Step 8.1: Create Database Indexes

Connect to MongoDB and create optimized indexes:

```javascript
// Connect to database
use formula-master

// Formulas collection indexes
db.formulas.createIndex({ "productCode": 1 }, { unique: true })
db.formulas.createIndex({ "productName": 1 })
db.formulas.createIndex({ "genericName": 1 })
db.formulas.createIndex({ "createdAt": -1 })

// Batches collection indexes
db.batches.createIndex({ "batchNumber": 1 }, { unique: true })
db.batches.createIndex({ "productCode": 1 })
db.batches.createIndex({ "itemCode": 1 })
db.batches.createIndex({ "mfgDate": -1 })
db.batches.createIndex({ "expDate": 1 })
db.batches.createIndex({ "status": 1 })

// COA collection indexes
db.coas.createIndex({ "batchNumber": 1 })
db.coas.createIndex({ "productCode": 1 })
db.coas.createIndex({ "analysisDate": -1 })

// Requisitions collection indexes
db.requisitions.createIndex({ "requisitionNumber": 1 })
db.requisitions.createIndex({ "batchNumber": 1 })
db.requisitions.createIndex({ "createdAt": -1 })

// Processing logs indexes
db.processinglogs.createIndex({ "processedAt": -1 })
db.processinglogs.createIndex({ "status": 1 })
db.processinglogs.createIndex({ "type": 1 })

// Verify all indexes
db.formulas.getIndexes()
db.batches.getIndexes()
db.coas.getIndexes()
db.requisitions.getIndexes()
db.processinglogs.getIndexes()
```

### Step 8.2: MongoDB Memory Optimization

Edit `mongod.cfg` to optimize for your server:

```yaml
storage:
  wiredTiger:
    engineConfig:
      cacheSizeGB: 2  # Adjust based on available RAM (typically 50% of RAM)
```

---

## Phase 9: Automated Backup Strategy

### Step 9.1: Create Backup Script

Create `C:\mongodb-backups\backup-script.ps1`:

```powershell
# MongoDB Automated Backup Script
# Schedule this to run daily via Windows Task Scheduler

$DATE = Get-Date -Format "yyyy-MM-dd_HH-mm"
$BACKUP_DIR = "C:\mongodb-backups\daily"
$BACKUP_PATH = "$BACKUP_DIR\backup_$DATE"
$SECONDARY_DRIVE = "D:\mongodb-backups"  # Change to your external/secondary drive
$MAX_BACKUPS = 7  # Keep 7 days of backups

# Create backup directories if not exist
if (!(Test-Path $BACKUP_DIR)) { New-Item -ItemType Directory -Path $BACKUP_DIR }
if (!(Test-Path $SECONDARY_DRIVE)) { New-Item -ItemType Directory -Path $SECONDARY_DRIVE }

# Perform backup
Write-Host "Starting backup at $DATE"
mongodump --uri="mongodb://localhost:27017" --db="formula-master" --out="$BACKUP_PATH"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Backup successful: $BACKUP_PATH"
    
    # Compress backup
    $zipPath = "$BACKUP_PATH.zip"
    Compress-Archive -Path $BACKUP_PATH -DestinationPath $zipPath
    Remove-Item -Recurse -Force $BACKUP_PATH
    
    # Copy to secondary drive
    Copy-Item $zipPath -Destination "$SECONDARY_DRIVE\backup_$DATE.zip"
    Write-Host "Backup copied to secondary drive"
    
    # Cleanup old backups (keep last 7 days)
    Get-ChildItem $BACKUP_DIR -Filter "*.zip" | 
        Sort-Object CreationTime -Descending | 
        Select-Object -Skip $MAX_BACKUPS | 
        Remove-Item -Force
    
    Get-ChildItem $SECONDARY_DRIVE -Filter "*.zip" | 
        Sort-Object CreationTime -Descending | 
        Select-Object -Skip $MAX_BACKUPS | 
        Remove-Item -Force
        
    Write-Host "Old backups cleaned up"
} else {
    Write-Host "Backup FAILED!" -ForegroundColor Red
    # Add email notification here if needed
}
```

### Step 9.2: Schedule Daily Backup

Open PowerShell as Administrator:

```powershell
# Create scheduled task for daily backup at 2 AM
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -File C:\mongodb-backups\backup-script.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 2am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName "MongoDB Daily Backup" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Daily backup of Formula Master database"
```

### Step 9.3: Manual Backup Command

For on-demand backups:

```powershell
mongodump --uri="mongodb://localhost:27017" --db="formula-master" --out="C:\mongodb-backups\manual\backup_$(Get-Date -Format 'yyyy-MM-dd_HH-mm')"
```

---

## Phase 10: Validation & Testing Checklist

### Pre-Migration Checklist

- [ ] MongoDB Community Server installed
- [ ] MongoDB Database Tools installed
- [ ] MongoDB service running
- [ ] Backup of Atlas database completed
- [ ] Export files verified

### Post-Migration Checklist

- [ ] All collections imported
- [ ] Document counts match Atlas
- [ ] Indexes restored/created
- [ ] Sample data verified
- [ ] Application .env.local updated
- [ ] Production build successful
- [ ] Application starts without errors

### Functional Testing

- [ ] **Login/Authentication** (if applicable)
- [ ] **Formula Management**
  - [ ] View formulas list
  - [ ] View formula details
  - [ ] Upload new formula XML
- [ ] **Batch Management**
  - [ ] View batches list
  - [ ] Filter batches
  - [ ] View batch details
- [ ] **COA Management**
  - [ ] View COAs
  - [ ] Upload COA
  - [ ] Generate reports
- [ ] **Requisition Management**
  - [ ] Create requisitions
  - [ ] View requisition list
- [ ] **Reports**
  - [ ] Reconciliation reports
  - [ ] Duplicate batch reports
- [ ] **Data Validation**
  - [ ] Material validation
  - [ ] Data integrity checks

### Network Access Testing

- [ ] Access from server PC: `http://localhost:3000`
- [ ] Access from LAN PC: `http://<server-ip>:3000`
- [ ] Multiple simultaneous users
- [ ] Internet disconnected - app still works

### Backup Testing

- [ ] Backup script runs successfully
- [ ] Backup files created
- [ ] Restore from backup works

---

## Troubleshooting

### Common Issues

#### MongoDB Connection Failed
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution:**
```powershell
# Check MongoDB service
Get-Service MongoDB
Start-Service MongoDB
```

#### Access Denied from Network
```
Error: connection refused from 192.168.x.x
```
**Solution:**
1. Check `mongod.cfg` has `bindIp: 0.0.0.0`
2. Check Windows Firewall rules
3. Restart MongoDB service

#### Application Not Accessible from LAN
**Solution:**
1. Verify server is running with `-H 0.0.0.0`
2. Check firewall rule for port 3000
3. Verify IP address is correct

#### Slow Performance
**Solution:**
1. Verify indexes are created
2. Check MongoDB cache size in config
3. Monitor with `db.serverStatus()`

---

## Maintenance Commands Reference

```powershell
# MongoDB Service Management
Start-Service MongoDB
Stop-Service MongoDB
Restart-Service MongoDB

# Application Management (PM2)
pm2 status
pm2 restart formula-master
pm2 stop formula-master
pm2 logs formula-master

# Manual Backup
mongodump --uri="mongodb://localhost:27017" --db="formula-master" --out="C:\mongodb-backups\manual\$(Get-Date -Format 'yyyyMMdd')"

# Restore from Backup
mongorestore --uri="mongodb://localhost:27017" --db="formula-master" "C:\mongodb-backups\manual\20260103\formula-master"

# MongoDB Shell
mongosh "mongodb://localhost:27017/formula-master"
```

---

## Quick Reference Card

| Component | Location/Command |
|-----------|-----------------|
| MongoDB Data | `C:\Program Files\MongoDB\Server\8.0\data` |
| MongoDB Logs | `C:\Program Files\MongoDB\Server\8.0\log` |
| MongoDB Config | `C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg` |
| App Location | `C:\Dev\private` |
| Backups | `C:\mongodb-backups` |
| Start App | `pm2 start formula-master` |
| User Access | `http://<server-ip>:3000` |

---

## Support Contacts

- MongoDB Documentation: https://www.mongodb.com/docs/
- Next.js Documentation: https://nextjs.org/docs
- PM2 Documentation: https://pm2.keymetrics.io/docs/

---

*Document Version: 1.0*
*Last Updated: January 3, 2026*
