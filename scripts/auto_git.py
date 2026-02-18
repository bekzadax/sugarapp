#!/usr/bin/env python3
import datetime
import os
import subprocess
import time

INTERVAL = int(os.getenv("AUTO_GIT_INTERVAL", "30"))
MESSAGE = os.getenv("AUTO_GIT_MESSAGE", "")


def run(cmd):
    return subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def has_conflicts():
    r = run(["git", "diff", "--name-only", "--diff-filter=U"])
    return bool(r.stdout.strip())


def has_changes():
    r = run(["git", "status", "--porcelain"])
    return bool(r.stdout.strip())


def staged_changes():
    r = run(["git", "diff", "--cached", "--name-only"])
    return bool(r.stdout.strip())


def commit_message():
    if MESSAGE:
        return MESSAGE
    ts = datetime.datetime.now().isoformat(timespec="seconds")
    return f"Auto update {ts}"


def main():
    print(f"Auto git running every {INTERVAL}s. Ctrl+C to stop.")
    while True:
        if has_conflicts():
            print("Merge conflicts detected; skipping until resolved.")
            time.sleep(INTERVAL)
            continue

        if has_changes():
            run(["git", "add", "-A"])
            if staged_changes():
                msg = commit_message()
                c = run(["git", "commit", "-m", msg])
                if c.returncode != 0:
                    print(c.stderr.strip() or c.stdout.strip())
                p = run(["git", "push"])
                if p.returncode != 0:
                    print(p.stderr.strip() or p.stdout.strip())
        time.sleep(INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Stopping auto git.")

