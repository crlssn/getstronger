#!/usr/bin/env bash
set -euo pipefail

# Writes the local environment files for the current checkout so that several
# worktrees can run the stack at the same time without sharing ports, Docker
# containers, or databases. That includes .claude/launch.json: the browser
# preview tool reads a fixed port from it, so it is rendered from the tracked
# .claude/launch.json.example rather than tracked itself.
#
# The main checkout keeps the documented defaults. Every other worktree is
# assigned a slot: a contiguous block of ports starting at 20000 + slot * 20,
# and containers named after the worktree and its slot.
#
# A slot is taken by claim rather than by observation. Every worktree records
# its slot in mise.local.toml, and every container publishes a port inside its
# slot's block, so a slot stays readable while nothing of its worktree is
# running. Probing the ports alone cannot see that: it hands a stopped
# worktree's slot to the next one, which then silently shares its database. The
# probe stays as a second check for whatever the claims do not record.

readonly SLOT_BASE=20000
readonly SLOT_WIDTH=20
readonly SLOT_COUNT=99
readonly SLOT_PORTS=14

die() {
  echo "❌  $1" >&2
  exit 1
}

if ! root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  die "No working tree here, so there is nothing to configure.
'git rev-parse --show-toplevel' failed. In a checkout that plainly has files the
usual cause is core.bare = true in the shared .git/config, which every worktree
reads at once; 'git config --worktree core.bare false' fixes this checkout."
fi

# Git and the filesystem can spell one directory two ways — /var against
# /private/var on macOS — and a worktree that does not recognise its own path
# among the claims renumbers itself on every run.
resolve() {
  (cd "$1" 2>/dev/null && pwd -P) || printf '%s\n' "$1"
}

root="$(resolve "$root")"
name="$(basename "$root")"
local_toml="$root/mise.local.toml"

# Renders the preview tool's launch configuration for a given web dev port.
# Vite binds WEB_DEV_PORT with strictPort, so a launch.json naming any other
# port makes the preview fail to start.
write_launch_json() {
  sed "s/\"port\": [0-9]*/\"port\": $1/" \
    "$root/.claude/launch.json.example" >"$root/.claude/launch.json"
}

# Git keeps core.bare in the shared config that every worktree reads, so one
# tool writing bare = true there breaks all of them at once — this script
# included, since it can no longer find a working tree. With
# extensions.worktreeConfig on, Git wants the key per worktree instead, which
# is also the only place this checkout can state the fact it just proved.
pin_core_bare() {
  [[ "$(git config --get extensions.worktreeConfig 2>/dev/null || true)" == "true" ]] || return 0
  git config --worktree core.bare false 2>/dev/null || true
}

# The main checkout has a .git directory; worktrees have a .git file.
if [[ -d "$root/.git" ]]; then
  pin_core_bare
  if [[ "$(git config --get extensions.worktreeConfig 2>/dev/null || true)" == "true" ]] &&
    git config --file "$root/.git/config" --get core.bare >/dev/null 2>&1; then
    git config --file "$root/.git/config" --unset-all core.bare
    echo "Moved core.bare out of the shared .git/config and into this checkout's config.worktree."
  fi
  write_launch_json 5173
  echo "Main checkout detected, keeping the default ports."
  exit 0
fi

pin_core_bare

# Two agents can create worktrees at the same moment. Without a lock both read
# the same claims, both find the same lowest free slot, and neither sees the
# other write it down.
lock="$(git rev-parse --path-format=absolute --git-common-dir)/worktree-slot.lock"
for _ in $(seq 1 50); do
  if mkdir "$lock" 2>/dev/null; then
    # shellcheck disable=SC2064 # $lock is deliberately expanded now.
    trap "rmdir '$lock' 2>/dev/null || true" EXIT
    break
  fi
  sleep 0.2
done

port_in_use() {
  nc -z 127.0.0.1 "$1" >/dev/null 2>&1
}

slot_is_free() {
  local base=$((SLOT_BASE + $1 * SLOT_WIDTH)) index
  for ((index = 0; index < SLOT_PORTS; index++)); do
    if port_in_use $((base + index)); then
      return 1
    fi
  done
  return 0
}

# Empty for a checkout that has never been configured, which is not a failure.
recorded_slot() {
  awk -F'"' '/^WORKTREE_SLOT =/ { print $2 }' "$1/mise.local.toml" 2>/dev/null || true
}

# Every checkout whose recorded slot has to be honoured: the registered
# worktrees, plus any directory still sitting beside this one. A worktree
# removed with 'git worktree remove' leaves the second kind behind.
checkout_paths() {
  git worktree list --porcelain 2>/dev/null | awk '/^worktree /{ print substr($0, 10) }'
  local sibling
  for sibling in "$(dirname "$root")"/*; do
    if [[ -d "$sibling" ]]; then
      printf '%s\n' "$sibling"
    fi
  done
}

claimed_by_checkouts() {
  local path slot
  while read -r path; do
    path="$(resolve "$path")"
    if [[ "$path" != "$root" ]]; then
      slot="$(recorded_slot "$path")"
      if [[ -n "$slot" ]]; then
        printf '%s\n' "$slot"
      fi
    fi
  done < <(checkout_paths)
}

is_own_container() {
  case "$1" in
  "getstronger-$name" | "getstronger-mailhog-$name") return 0 ;;
  "getstronger-$name-"* | "getstronger-mailhog-$name-"*)
    [[ "${1##*-}" =~ ^[0-9]+$ ]] && return 0
    ;;
  esac
  return 1
}

# A container publishing into a slot's port block claims that slot even when
# the worktree that created it is gone: Docker holds the host port the moment
# the container starts, and an orphan's database is not this worktree's to
# adopt. 'mise run worktree:prune' is how those are given back.
claimed_by_containers() {
  local container ports port slot
  while IFS=$'\t' read -r container ports; do
    if [[ -z "$container" ]] || is_own_container "$container"; then
      continue
    fi
    for port in $(printf '%s' "$ports" | tr ',' '\n' | sed -n 's/.*:\([0-9][0-9]*\)->.*/\1/p'); do
      slot=$(((port - SLOT_BASE) / SLOT_WIDTH))
      if ((port >= SLOT_BASE && slot >= 1 && slot <= SLOT_COUNT)); then
        printf '%s\n' "$slot"
      fi
    done
  done <<<"$containers"
}

set_env() {
  local file=$1 key=$2 value=$3 tmp
  tmp="$(mktemp)"
  if grep -q "^${key}=" "$file"; then
    awk -v key="$key" -v value="$value" -F= \
      '$1 == key { print key "=" value; next } { print }' "$file" >"$tmp"
    mv "$tmp" "$file"
  else
    rm -f "$tmp"
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

containers="$(docker ps -a --format '{{.Names}}'$'\t''{{.Ports}}' 2>/dev/null || true)"
claimed="$({
  claimed_by_checkouts
  claimed_by_containers
} | sort -un)"

is_claimed() {
  printf '%s\n' "$claimed" | grep -qx "$1"
}

slot="$(recorded_slot "$root")"
if [[ -n "$slot" ]] && is_claimed "$slot"; then
  echo "⚠️  Slot $slot is claimed by another worktree or by its containers. Renumbering this worktree."
  slot=""
fi

if [[ -z "$slot" ]]; then
  for candidate in $(seq 1 $SLOT_COUNT); do
    if ! is_claimed "$candidate" && slot_is_free "$candidate"; then
      slot="$candidate"
      break
    fi
  done
fi

[[ -n "$slot" ]] || die "All $SLOT_COUNT port slots are claimed, so this worktree cannot be
given one of its own. Containers left behind by removed worktrees hold slots
nothing will use again: 'mise run worktree:prune' lists them and
'mise run worktree:prune -- --force' removes them."

base=$((SLOT_BASE + slot * SLOT_WIDTH))
db_port=$((base + 0))
server_port=$((base + 1))
sse_port=$((base + 2))
web_port=$((base + 3))
e2e_web_port=$((base + 4))
e2e_server_port=$((base + 5))
e2e_sse_port=$((base + 6))
mailhog_smtp_port=$((base + 7))
mailhog_http_port=$((base + 8))
screenshot_web_port=$((base + 9))
screenshot_server_port=$((base + 10))
screenshot_sse_port=$((base + 11))
playwright_report_port=$((base + 12))
playwright_ui_port=$((base + 13))

# The slot is in the container names because the worktree name is not unique:
# two worktrees in different directories can share a basename, and would then
# share one database container whatever their ports.
db_container="getstronger-$name-$slot"
mailhog_container="getstronger-mailhog-$name-$slot"

cat >"$local_toml" <<TOML
# Generated by 'mise run worktree:env'. Not tracked by Git.
[env]
WORKTREE_SLOT = "$slot"
DB_CONTAINER = "$db_container"
MAILHOG_CONTAINER = "$mailhog_container"
MAILHOG_SMTP_PORT = "$mailhog_smtp_port"
MAILHOG_HTTP_PORT = "$mailhog_http_port"
WEB_DEV_PORT = "$web_port"
E2E_WEB_PORT = "$e2e_web_port"
E2E_SERVER_PORT = "$e2e_server_port"
E2E_SSE_PORT = "$e2e_sse_port"
SCREENSHOT_WEB_PORT = "$screenshot_web_port"
SCREENSHOT_SERVER_PORT = "$screenshot_server_port"
SCREENSHOT_SSE_PORT = "$screenshot_sse_port"
PLAYWRIGHT_REPORT_PORT = "$playwright_report_port"
PLAYWRIGHT_UI_PORT = "$playwright_ui_port"
TOML

test -f "$root/.env" || cp "$root/.env.example" "$root/.env"
test -f "$root/web/.env" || cp "$root/web/.env.example" "$root/web/.env"

set_env "$root/.env" DB_PORT "$db_port"
set_env "$root/.env" SERVER_PORT "$server_port"
set_env "$root/.env" SSE_PORT "$sse_port"
# The capacitor origins keep the native apps' streaming calls working against
# a worktree backend; see the native mobile apps section in the README.
set_env "$root/.env" CORS_ALLOWED_ORIGIN "http://localhost:$web_port,capacitor://localhost,http://localhost"
# The backend reads .env rather than the mise environment, so it needs its own
# copy of the port this worktree's MailHog publishes.
set_env "$root/.env" MAILHOG_SMTP_PORT "$mailhog_smtp_port"
set_env "$root/web/.env" VITE_API_URL "http://localhost:$server_port"

write_launch_json "$web_port"

# Seed node_modules from the main checkout so the first lint, test, or pre-push
# run works without a full 'bun install'. cp -c clones via APFS copy-on-write,
# so the copy is nearly instant; other filesystems fall back to a plain copy.
main_root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
for dir in . web mobile; do
  src="$main_root/$dir/node_modules"
  dst="$root/$dir/node_modules"
  if [[ -d "$src" && ! -d "$dst" ]]; then
    echo "Seeding $dir/node_modules from the main checkout..."
    if ! cp -Rc "$src" "$dst" 2>/dev/null; then
      rm -rf "$dst"
      cp -R "$src" "$dst"
    fi
  fi
done

# A renumbered worktree, or one configured before the slot was part of the
# container names, leaves its old containers behind holding another slot.
stale="$(
  while IFS=$'\t' read -r container _; do
    if [[ -n "$container" ]] && is_own_container "$container" &&
      [[ "$container" != "$db_container" && "$container" != "$mailhog_container" ]]; then
      printf '  %s\n' "$container"
    fi
  done <<<"$containers"
)"

cat <<SUMMARY
✅  Configured worktree '$name' as slot $slot

  database      $db_port (container $db_container)
  backend       $server_port
  sse           $sse_port
  web           http://localhost:$web_port
  mailhog       http://localhost:$mailhog_http_port
  e2e web       $e2e_web_port
  e2e backend   $e2e_server_port
  screenshots   $screenshot_web_port (web) and $screenshot_server_port (backend)

Run 'mise run db:init && mise run db:migrate && mise run db:seed' to create this
worktree's database.
SUMMARY

if [[ -n "$stale" ]]; then
  cat <<STALE

⚠️  This worktree's earlier containers are still there under their old names:

$stale
They keep the ports they were created with, so either hand the database above
the data it already holds with 'docker rename <old> $db_container', or throw it
away with 'docker rm -f <old>' and run 'mise run db:init'.
STALE
fi
