#!/usr/bin/env bash
set -euo pipefail

: "${DB_HOST:?DB_HOST requis}"
: "${DB_NAME:?DB_NAME requis}"
: "${DB_USER:?DB_USER requis}"
: "${DB_PASSWORD:?DB_PASSWORD requis}"

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
test_dir=$(mktemp -d)
port=${COURSQL_TEST_PORT:-8877}
display_name="Smoke-${RANDOM}-$$"
user_id=''
server_pid=''

cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi
  if [[ -n "$user_id" ]]; then
    MYSQL_PWD="$DB_PASSWORD" mysql --protocol=TCP -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" "$DB_NAME" \
      -e "DELETE FROM app_attempts WHERE user_id='$user_id'; DELETE FROM app_progress WHERE user_id='$user_id'; DELETE FROM app_users WHERE id='$user_id';" \
      >/dev/null
  fi
  rm -rf -- "$test_dir"
}
trap cleanup EXIT

cd "$repo_root"
COURSQL_PRIVATE_DIR="$repo_root/private_coursql" \
DB_HOST="$DB_HOST" DB_PORT="${DB_PORT:-3306}" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" \
php -S "127.0.0.1:$port" php/api/index.php >"$test_dir/server.log" 2>&1 &
server_pid=$!

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$port/api/health" >"$test_dir/health.json" 2>/dev/null; then break; fi
  sleep 0.1
done

curl -fsS -c "$test_dir/cookies" -H 'Content-Type: application/json' \
  -d "{\"display_name\":\"$display_name\"}" "http://127.0.0.1:$port/api/users" >"$test_dir/user.json"
user_id=$(node -e "const x=require(process.argv[1]); if(!x.user_id) process.exit(1); process.stdout.write(x.user_id)" "$test_dir/user.json")

curl -fsS -b "$test_dir/cookies" "http://127.0.0.1:$port/api/me" >"$test_dir/me.json"
curl -fsS -b "$test_dir/cookies" "http://127.0.0.1:$port/api/progress" >"$test_dir/progress.json"
curl -fsS -b "$test_dir/cookies" "http://127.0.0.1:$port/api/cards/C1" >"$test_dir/card-c1.json"
curl -fsS -b "$test_dir/cookies" -H 'Content-Type: application/json' -d '{"index":0}' \
  "http://127.0.0.1:$port/api/cards/C1/hint" >"$test_dir/hint-c1.json"
curl -fsS -b "$test_dir/cookies" -H 'Content-Type: application/json' -d '{}' \
  "http://127.0.0.1:$port/api/cards/C1/solution" >"$test_dir/solution-c1.json"
curl -fsS -b "$test_dir/cookies" "http://127.0.0.1:$port/api/progress" >"$test_dir/progress-after-solution.json"
node - "$test_dir/health.json" "$test_dir/me.json" "$test_dir/progress.json" "$display_name" <<'NODE'
const fs = require('fs');
const [healthPath, mePath, progressPath, displayName] = process.argv.slice(2);
const health = JSON.parse(fs.readFileSync(healthPath));
const me = JSON.parse(fs.readFileSync(mePath));
const progress = JSON.parse(fs.readFileSync(progressPath));
const cards = progress.modules.flatMap((module) => module.cards);
if (!health.ok || !health.version.startsWith('2.0.0')) throw new Error('health invalide');
if (me.user?.display_name !== displayName) throw new Error('session /me invalide');
if (cards.length !== 50) throw new Error(`50 cartes attendues, ${cards.length} reçues`);
if (cards[0].slug !== 'C1' || cards[0].status !== 'available') throw new Error('C1 doit être disponible');
if (cards[1].slug !== 'C2' || cards[1].status !== 'locked') throw new Error('C2 doit être verrouillée');
console.log(`Auth/progression OK : ${cards.length} cartes, C1=${cards[0].status}, C2=${cards[1].status}`);
NODE
node - "$test_dir/card-c1.json" "$test_dir/hint-c1.json" "$test_dir/solution-c1.json" "$test_dir/progress-after-solution.json" <<'NODE'
const fs = require('fs');
const [cardPath, hintPath, solutionPath, progressPath] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(cardPath));
const serialized = JSON.stringify(payload);
if (payload.card?.slug !== 'C1' || payload.status !== 'available') throw new Error('C1 non affichable');
for (const forbidden of ['solutionSql', 'expected', 'correctIndex', 'schemaSql', 'verifySql']) {
  if (serialized.includes(forbidden)) throw new Error(`champ privé exposé : ${forbidden}`);
}
const hint = JSON.parse(fs.readFileSync(hintPath));
if (!hint.hint_fr || hint.index !== 0) throw new Error('indice C1 invalide');
const solution = JSON.parse(fs.readFileSync(solutionPath));
if (solution.solution_sql !== null || !solution.explanation_fr) throw new Error('solution quiz invalide');
const cards = JSON.parse(fs.readFileSync(progressPath)).modules.flatMap((module) => module.cards);
if (cards[0].status === 'validated' || cards[0].status === 'validated_after_hint' || cards[1].status !== 'locked') {
  throw new Error('consulter la solution ne doit pas valider C1');
}
console.log('Cartes OK : C1 publique sans fuite, indice/solution sans validation');
NODE

logout_status=$(curl -sS -o /dev/null -w '%{http_code}' -b "$test_dir/cookies" -X DELETE \
  "http://127.0.0.1:$port/api/sessions/current")
[[ "$logout_status" == '204' ]]
curl -fsS -b "$test_dir/cookies" "http://127.0.0.1:$port/api/me" >"$test_dir/logged_out.json"
node -e "const x=require(process.argv[1]); if(x.user!==null) process.exit(1)" "$test_dir/logged_out.json"

curl -fsS -c "$test_dir/cookies-login" -H 'Content-Type: application/json' \
  -d "{\"display_name\":\"$display_name\"}" "http://127.0.0.1:$port/api/sessions" >"$test_dir/login.json"
curl -fsS -b "$test_dir/cookies-login" "http://127.0.0.1:$port/api/me" >"$test_dir/me-login.json"
node -e "const x=require(process.argv[1]); if(x.user?.display_name!==process.argv[2]) process.exit(1)" \
  "$test_dir/me-login.json" "$display_name"
echo 'Logout/login OK : 204, session détruite puis recréée'
