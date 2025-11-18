# PostgreSQL Setup Guide for Molam Connect Testing

**Date**: 2025-11-12
**Issue**: PostgreSQL authentication required for test scripts

---

## 🔍 Problem Identified

The test scripts (`test-all-briques.ps1` and `test-all-briques.sh`) are hanging because PostgreSQL requires password authentication, but no password is configured in the environment.

**Symptoms**:
- Script hangs at "Creating test database..."
- `psql` commands hang waiting for password input
- PostgreSQL service is running (confirmed: `postgresql-x64-18` is RUNNING)

---

## ✅ Solution 1: Set PGPASSWORD Environment Variable (Recommended for Testing)

### Windows (PowerShell)

```powershell
# Set for current session
$env:PGPASSWORD = "your_postgres_password"

# Verify
echo $env:PGPASSWORD

# Now run the test
.\test-all-briques.ps1
```

### Windows (Persistent - System-wide)

```powershell
# Set permanently (requires admin)
[Environment]::SetEnvironmentVariable("PGPASSWORD", "your_postgres_password", "User")

# Restart PowerShell, then verify
echo $env:PGPASSWORD
```

### Linux/Mac (Bash)

```bash
# Set for current session
export PGPASSWORD="your_postgres_password"

# Or add to ~/.bashrc for persistence
echo 'export PGPASSWORD="your_postgres_password"' >> ~/.bashrc
source ~/.bashrc

# Now run the test
./test-all-briques.sh
```

---

## ✅ Solution 2: Configure Trust Authentication (Local Development Only)

⚠️ **WARNING**: Only use this for local development. NEVER use trust authentication in production.

### Steps:

1. **Find pg_hba.conf location**:

```bash
# Windows
psql -U postgres -c "SHOW hba_file;"

# Typical location on Windows:
# C:\Program Files\PostgreSQL\18\data\pg_hba.conf
```

2. **Edit pg_hba.conf**:

Open the file as Administrator and change:

```conf
# IPv4 local connections:
host    all             all             127.0.0.1/32            scram-sha-256
```

To:

```conf
# IPv4 local connections:
host    all             all             127.0.0.1/32            trust
```

Also change:

```conf
# Local connections:
local   all             all                                     scram-sha-256
```

To:

```conf
# Local connections:
local   all             all                                     trust
```

3. **Reload PostgreSQL**:

```powershell
# Windows
Restart-Service postgresql-x64-18

# Or
pg_ctl reload -D "C:\Program Files\PostgreSQL\18\data"
```

4. **Test connection**:

```bash
psql -U postgres -l
```

Should connect without password prompt.

---

## ✅ Solution 3: Use .pgpass File (Cross-platform)

### Windows

1. **Create file**: `%APPDATA%\postgresql\pgpass.conf`

```powershell
# Create directory if it doesn't exist
New-Item -ItemType Directory -Force -Path "$env:APPDATA\postgresql"

# Create pgpass.conf
@"
localhost:5432:*:postgres:your_postgres_password
"@ | Out-File -FilePath "$env:APPDATA\postgresql\pgpass.conf" -Encoding ASCII
```

2. **Set permissions**: Only current user should have access

```powershell
$file = "$env:APPDATA\postgresql\pgpass.conf"
$acl = Get-Acl $file
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($env:USERNAME, "FullControl", "Allow")
$acl.SetAccessRule($rule)
Set-Acl $file $acl
```

### Linux/Mac

1. **Create file**: `~/.pgpass`

```bash
echo "localhost:5432:*:postgres:your_postgres_password" > ~/.pgpass
chmod 0600 ~/.pgpass
```

2. **Test connection**:

```bash
psql -U postgres -l
```

---

## ✅ Solution 4: Improved Test Script with Password Prompt

I've created an improved version of the test script that handles authentication better.

### test-all-briques-interactive.ps1

```powershell
# Prompt for password if not set
if (-not $env:PGPASSWORD) {
    $securePassword = Read-Host "Enter PostgreSQL password for user 'postgres'" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $env:PGPASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

# Continue with test script...
```

---

## 🧪 Quick Test: Verify PostgreSQL Connection

### Test 1: Check Service Status

```powershell
# Windows
sc query postgresql-x64-18

# Expected: STATE: 4  RUNNING
```

### Test 2: Test Connection

```bash
# With PGPASSWORD set
psql -U postgres -c "SELECT version();"

# Expected: PostgreSQL version info
```

### Test 3: List Databases

```bash
psql -U postgres -l
```

### Test 4: Create/Drop Test Database

```bash
# Create
createdb -U postgres test_connection

# Verify
psql -U postgres -l | grep test_connection

# Drop
dropdb -U postgres test_connection
```

---

## 📝 Recommended Setup for Molam Connect Testing

1. **Set PGPASSWORD** (quickest):

```powershell
# Windows PowerShell
$env:PGPASSWORD = "your_password"
.\test-all-briques.ps1
```

2. **Or use .pgpass file** (more secure):

```powershell
# Windows
New-Item -ItemType Directory -Force -Path "$env:APPDATA\postgresql"
"localhost:5432:*:postgres:your_password" | Out-File "$env:APPDATA\postgresql\pgpass.conf" -Encoding ASCII
```

3. **Run the test**:

```powershell
.\test-all-briques.ps1
```

---

## 🔧 Current PostgreSQL Configuration

**Detected**:
- PostgreSQL Version: 18.0
- Service Name: `postgresql-x64-18`
- Service Status: **RUNNING** ✅
- Installation: Windows x64

**Issue**: Authentication method requires password, but no password configured in environment.

---

## 🎯 Next Steps

After configuring authentication, proceed with testing:

1. **Set authentication** (choose one of the 4 solutions above)
2. **Verify connection**: `psql -U postgres -l`
3. **Run test script**: `.\test-all-briques.ps1`
4. **Review results**: Check `test-results-*.json`

---

## 📚 Additional Resources

- [PostgreSQL Client Authentication](https://www.postgresql.org/docs/current/auth-pg-hba-conf.html)
- [PostgreSQL Environment Variables](https://www.postgresql.org/docs/current/libpq-envars.html)
- [PostgreSQL Password File](https://www.postgresql.org/docs/current/libpq-pgpass.html)

---

## 🐛 Troubleshooting

### Issue: "psql: error: connection to server on socket..."

**Solution**: PostgreSQL service not running

```powershell
# Start service
Start-Service postgresql-x64-18
```

### Issue: "psql: error: FATAL: password authentication failed"

**Solution**: Wrong password in PGPASSWORD or .pgpass

```powershell
# Reset password for postgres user
psql -U postgres
# Then: ALTER USER postgres WITH PASSWORD 'new_password';
```

### Issue: "peer authentication failed"

**Solution**: Using wrong authentication method, switch to md5 or scram-sha-256 in pg_hba.conf

---

**Last Updated**: 2025-11-12
**PostgreSQL Version**: 18.0
**Platform**: Windows

For immediate testing, use Solution 1 (PGPASSWORD). For long-term development, use Solution 3 (.pgpass file).
