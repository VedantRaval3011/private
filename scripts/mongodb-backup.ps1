# ============================================================
# MongoDB Automated Backup Script for Formula Master
# ============================================================
# 
# Purpose: Daily automated backup of the Formula Master database
# Schedule: Run via Windows Task Scheduler at 2:00 AM daily
#
# To schedule this script:
# 1. Open Windows Task Scheduler
# 2. Create Basic Task
# 3. Trigger: Daily at 2:00 AM
# 4. Action: Start a program
#    - Program: PowerShell.exe
#    - Arguments: -ExecutionPolicy Bypass -File "C:\Dev\private\scripts\mongodb-backup.ps1"
# 
# Or run this in PowerShell (Admin):
# $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -File C:\Dev\private\scripts\mongodb-backup.ps1"
# $trigger = New-ScheduledTaskTrigger -Daily -At 2am
# Register-ScheduledTask -TaskName "MongoDB Daily Backup" -Action $action -Trigger $trigger -RunLevel Highest
#
# ============================================================

# Configuration
$MONGODB_URI = "mongodb://localhost:27017"
$DATABASE_NAME = "formula-master"
$PRIMARY_BACKUP_DIR = "C:\mongodb-backups\daily"
$SECONDARY_BACKUP_DIR = "D:\mongodb-backups"  # Secondary drive (external/NAS)
$MAX_BACKUPS = 7  # Number of backups to retain
$LOG_FILE = "C:\mongodb-backups\backup.log"

# Timestamp
$TIMESTAMP = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$DATE_ONLY = Get-Date -Format "yyyy-MM-dd"

# Functions
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $logEntry = "[$TIMESTAMP] [$Level] $Message"
    Add-Content -Path $LOG_FILE -Value $logEntry
    if ($Level -eq "ERROR") {
        Write-Host $logEntry -ForegroundColor Red
    } elseif ($Level -eq "SUCCESS") {
        Write-Host $logEntry -ForegroundColor Green
    } else {
        Write-Host $logEntry
    }
}

function Test-MongoDBConnection {
    try {
        $result = mongosh $MONGODB_URI --eval "db.runCommand({ping:1})" --quiet 2>&1
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Cleanup-OldBackups {
    param([string]$Directory, [int]$KeepCount)
    
    if (Test-Path $Directory) {
        $oldBackups = Get-ChildItem $Directory -Filter "*.zip" | 
            Sort-Object CreationTime -Descending | 
            Select-Object -Skip $KeepCount
        
        foreach ($backup in $oldBackups) {
            Remove-Item $backup.FullName -Force
            Write-Log "Removed old backup: $($backup.Name)"
        }
    }
}

# ============================================================
# Main Backup Process
# ============================================================

Write-Log "=========================================="
Write-Log "Starting MongoDB Backup"
Write-Log "=========================================="
Write-Log "Database: $DATABASE_NAME"
Write-Log "Timestamp: $TIMESTAMP"

# Step 1: Create directories
Write-Log "Creating backup directories..."
if (!(Test-Path $PRIMARY_BACKUP_DIR)) { 
    New-Item -ItemType Directory -Path $PRIMARY_BACKUP_DIR -Force | Out-Null
}
if (!(Test-Path (Split-Path $LOG_FILE))) {
    New-Item -ItemType Directory -Path (Split-Path $LOG_FILE) -Force | Out-Null
}

# Step 2: Test MongoDB connection
Write-Log "Testing MongoDB connection..."
if (!(Test-MongoDBConnection)) {
    Write-Log "Cannot connect to MongoDB at $MONGODB_URI" "ERROR"
    exit 1
}
Write-Log "MongoDB connection successful" "SUCCESS"

# Step 3: Perform backup
$BACKUP_PATH = "$PRIMARY_BACKUP_DIR\backup_$TIMESTAMP"
Write-Log "Running mongodump to $BACKUP_PATH..."

try {
    $dumpOutput = mongodump --uri="$MONGODB_URI" --db="$DATABASE_NAME" --out="$BACKUP_PATH" 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Log "mongodump failed with exit code $LASTEXITCODE" "ERROR"
        Write-Log "Output: $dumpOutput" "ERROR"
        exit 1
    }
    
    Write-Log "mongodump completed successfully" "SUCCESS"
} catch {
    Write-Log "Exception during mongodump: $_" "ERROR"
    exit 1
}

# Step 4: Verify backup files exist
$backupFiles = Get-ChildItem -Path "$BACKUP_PATH\$DATABASE_NAME" -Recurse -File
$fileCount = $backupFiles.Count
$totalSize = ($backupFiles | Measure-Object -Property Length -Sum).Sum / 1MB

if ($fileCount -eq 0) {
    Write-Log "No backup files created - backup may have failed" "ERROR"
    exit 1
}

Write-Log "Backup contains $fileCount files, total size: $([math]::Round($totalSize, 2)) MB"

# Step 5: Compress backup
$ZIP_PATH = "$PRIMARY_BACKUP_DIR\backup_$TIMESTAMP.zip"
Write-Log "Compressing backup to $ZIP_PATH..."

try {
    Compress-Archive -Path $BACKUP_PATH -DestinationPath $ZIP_PATH -CompressionLevel Optimal
    
    # Remove uncompressed folder
    Remove-Item -Recurse -Force $BACKUP_PATH
    
    $zipSize = (Get-Item $ZIP_PATH).Length / 1MB
    Write-Log "Compression complete: $([math]::Round($zipSize, 2)) MB" "SUCCESS"
} catch {
    Write-Log "Compression failed: $_" "ERROR"
    # Keep uncompressed backup if compression fails
}

# Step 6: Copy to secondary drive (if available)
if (Test-Path (Split-Path $SECONDARY_BACKUP_DIR -Qualifier)) {
    Write-Log "Copying backup to secondary drive..."
    
    if (!(Test-Path $SECONDARY_BACKUP_DIR)) {
        New-Item -ItemType Directory -Path $SECONDARY_BACKUP_DIR -Force | Out-Null
    }
    
    try {
        Copy-Item $ZIP_PATH -Destination "$SECONDARY_BACKUP_DIR\backup_$TIMESTAMP.zip" -Force
        Write-Log "Backup copied to secondary drive" "SUCCESS"
    } catch {
        Write-Log "Failed to copy to secondary drive: $_" "ERROR"
    }
} else {
    Write-Log "Secondary drive not available, skipping copy"
}

# Step 7: Cleanup old backups
Write-Log "Cleaning up old backups (keeping last $MAX_BACKUPS)..."
Cleanup-OldBackups -Directory $PRIMARY_BACKUP_DIR -KeepCount $MAX_BACKUPS

if (Test-Path $SECONDARY_BACKUP_DIR) {
    Cleanup-OldBackups -Directory $SECONDARY_BACKUP_DIR -KeepCount $MAX_BACKUPS
}

# Step 8: Summary
Write-Log "=========================================="
Write-Log "Backup Summary" "SUCCESS"
Write-Log "=========================================="
Write-Log "Primary backup: $ZIP_PATH"
Write-Log "Backup size: $([math]::Round($zipSize, 2)) MB"

# List current backups
$currentBackups = Get-ChildItem $PRIMARY_BACKUP_DIR -Filter "*.zip" | Sort-Object CreationTime -Descending
Write-Log "Current backups in rotation:"
foreach ($backup in $currentBackups) {
    Write-Log "  - $($backup.Name) ($([math]::Round($backup.Length / 1MB, 2)) MB)"
}

Write-Log "=========================================="
Write-Log "Backup completed successfully!" "SUCCESS"
Write-Log "=========================================="

exit 0
