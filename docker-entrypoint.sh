#!/bin/sh
# Run as whoever owns the data directory.
#
# The database lives on a bind mount, and who owns that directory is decided by
# the host, not by this image — which is why a fixed `USER` in the Dockerfile
# cannot be right everywhere:
#
#   - Linux, and any PaaS that deploys as root (Dokploy, Coolify, a plain
#     `docker compose up` on a server): Docker creates a missing ./data as
#     root:root, and a container that has already dropped to uid 1000 cannot
#     write it.
#   - macOS with Docker Desktop: the mount arrives owned by the first user,
#     uid 501, and uid 1000 cannot write that either.
#   - A named volume, or OrbStack: initialised from the image, already uid 1000.
#
# Each of those fails with SQLITE_CANTOPEN — "unable to open database file" —
# at the first request, which says nothing about ownership and sends people
# looking at the database instead. So the decision is made here, at start, when
# the directory can actually be looked at: adopt its uid, or claim it if nobody
# owns it yet. The same image then runs unprivileged on all of them.
set -e

DATA_DIR="$(dirname "${DATABASE_PATH:-/app/data/studio.db}")"

# Compose can pin the user with `user:`. Then this is not root, there is
# nothing it is allowed to fix, and the operator has said what they want.
if [ "$(id -u)" != '0' ]; then
  exec "$@"
fi

mkdir -p "$DATA_DIR"

dir_uid="$(stat -c %u "$DATA_DIR")"
dir_gid="$(stat -c %g "$DATA_DIR")"

# Owned by root means nobody has claimed it — a directory Docker made for us on
# a fresh deploy. Hand it to the image's own user rather than running as root.
#
# If that cannot be done — a read-only mount, a filesystem that does not carry
# ownership — then root is the only uid certain to be able to write the
# database, so it stays root and says so. Crashing here would trade a working
# install for a crash loop, and dropping to a uid that cannot write would
# reintroduce the exact error this script exists to prevent.
if [ "$dir_uid" = '0' ]; then
  if chown 1000:1000 "$DATA_DIR" 2>/dev/null; then
    dir_uid=1000
    dir_gid=1000
  else
    echo "archstudio: cannot take ownership of $DATA_DIR — running as root so the database stays writable." >&2
    exec "$@"
  fi
fi

# `-R` deliberately absent: the files inside are the database, and adopting the
# directory is enough to create and rewrite them. Recursing would rewrite the
# ownership of whatever an operator had deliberately placed there.
exec su-exec "$dir_uid:$dir_gid" "$@"
