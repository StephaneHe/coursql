# coursSQL startup — run at Windows logon by the scheduled task "startup-task".
#
# Booting the WSL distro triggers the host init config [boot] "service docker start", which starts the
# Docker daemon; the coursSQL containers then come back on their own (restart: unless-stopped).
# This script is a belt-and-suspenders safety net: it wakes WSL, waits for the daemon, and runs
# docker-compose up -d (idempotent — does nothing if everything is already up).

$ErrorActionPreference = 'Continue'
$distro = 'linux-host'

# Wait up to ~120s for the Docker daemon (started by the [boot] command), then ensure the stack.
$cmd = 'for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done; cd /mnt/i/Dev/coursSQL && docker-compose up -d'

& wsl.exe -d $distro -e bash -lc $cmd
exit $LASTEXITCODE
