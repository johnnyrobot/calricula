# Task 3 Report: Pins and reproducible pinned CLI builds

## What was implemented

Exactly the four files specified in the brief, content taken verbatim from the brief:

- `connectors/pins.toml` — pin table for the four connectors (`laccd_class_search`, `laccd_courses`, `programmapper`, `assist`), each with `repo_path`, 40-hex `revision`, `module`, `binary`, `cmd_dir`, `env_prefix`, `default_rate_limit`, `local_patches`.
- `backend/app/connectors/pins.py` — `Pin(BaseModel)` + `load_pins(path) -> dict[str, Pin]`, parsing TOML via stdlib `tomllib`.
- `scripts/build_pinned_cli.sh` — for each pin: detached clone from the sibling repo path into a fresh `mktemp -d` workdir, checkout the pinned SHA (`--detach`), build inside `golang:1.26` via `docker run`, copy the binary + sha256 into `connectors/bin/` (gitignored), then `rm -rf` the temp workdir.
- `backend/tests/test_pins.py` — the two tests from the brief (four core pins present with full 40-hex SHAs and uppercase env prefixes; `assist` has no local patches while `laccd_class_search` lists `ccn-alternate-detection.json`).

No deviation from the brief's file structure or content was needed — no fallback (`GOTOOLCHAIN=auto`, alternate `mktemp` path) had to be applied.

## TDD evidence

**RED** — before `pins.py` existed://
```
cd backend && .venv/bin/python -m pytest tests/test_pins.py -q --no-cov
```
```
ERROR collecting tests/test_pins.py
ModuleNotFoundError: No module named 'app.connectors.pins'
```
Matches the brief's expected failure exactly.

**GREEN** — after writing `connectors/pins.toml` and `backend/app/connectors/pins.py`:
```
cd backend && .venv/bin/python -m pytest tests/test_pins.py -q --no-cov
```
```
..                                                                       [100%]
```
2 passed.

## Full backend test suite (coverage floor 70%)

```
cd backend && .venv/bin/python -m pytest
```
```
............                                                             [100%]
Name                          Stmts   Miss  Cover   Missing
-----------------------------------------------------------
app/__init__.py                   0      0   100%
app/connectors/__init__.py        0      0   100%
app/connectors/contracts.py      72      0   100%
app/connectors/pins.py           15      0   100%
app/core/__init__.py              0      0   100%
app/core/config.py               19      0   100%
app/main.py                       6      0   100%
-----------------------------------------------------------
TOTAL                           112      0   100%
Required test coverage of 70% reached. Total coverage: 100.00%
12 passed in 0.52s
```
`grep -i warning` over the full output: no matches — pristine, no warnings.

## Build run evidence

Command:
```
chmod +x scripts/build_pinned_cli.sh && ./scripts/build_pinned_cli.sh
```

- **Image**: `golang:1.26` (pulled fresh on this run; not previously cached locally). Docker engine reported `linux/aarch64` (Apple Silicon host under Docker Desktop 29.8).
- **GOTOOLCHAIN=auto fallback**: not needed for any connector, including `assist` (whose `go.mod` declares `go 1.26.5`). All four builds succeeded under the plain `docker run ... golang:1.26 go build ...` invocation from the brief with no `-e GOTOOLCHAIN` added. (Go's own default toolchain-selection mode is `auto` since Go 1.21, so `assist`'s go.mod likely triggered an automatic toolchain fetch inside the container — no script change was required either way.)
- **mktemp**: plain `mktemp -d` (`/var/folders/...` on macOS) worked for the bind mount in all four builds; the `TMPDIR`-relative fallback from the context notes was not needed.

Per-connector results:

| connector_id | binary | sha256 (first 16 hex) | file type |
|---|---|---|---|
| laccd_class_search | `laccd-class-search-pp-cli` | `d2d4e38407ac3ba5...` | ELF 64-bit LSB executable, ARM aarch64, statically linked, stripped |
| laccd_courses | `laccd-courses-pp-cli` | `6d2bc15332ad1ae9...` | ELF 64-bit LSB executable, ARM aarch64, statically linked, stripped |
| programmapper | `programmapper-cli` | `c64ac47877bd797d...` | ELF 64-bit LSB executable, ARM aarch64, statically linked, stripped |
| assist | `assist-pp-cli` | `3cc6a1bdede0886c...` | ELF 64-bit LSB executable, ARM aarch64, statically linked, stripped |

Full sha256 files (`connectors/bin/*.sha256`):
```
3cc6a1bdede0886cab8d535f0ee610a0e23037ba7cb7792d38480f583a0015bb  assist-pp-cli
d2d4e38407ac3ba5d5975a3a174a3acd6854befe298141f5b7139bcd947287a8  laccd-class-search-pp-cli
6d2bc15332ad1ae977338bc5527d8aaf8ba4f41c1dfdf3aae25a28a6672c74ec  laccd-courses-pp-cli
c64ac47877bd797d4990ba57e93da0df608a2442256d12adc80f5a8e1c746f72  programmapper-cli
```

`ls -la connectors/bin`:
```
-rwxr-xr-x@ 1 laccd  staff  12976290 Sep 17 23:25 assist-pp-cli
-rw-r--r--@ 1 laccd  staff        80 Sep 17 23:25 assist-pp-cli.sha256
-rwxr-xr-x@ 1 laccd  staff  13172898 Sep 17 23:23 laccd-class-search-pp-cli
-rw-r--r--@ 1 laccd  staff        92 Sep 17 23:23 laccd-class-search-pp-cli.sha256
-rwxr-xr-x@ 1 laccd  staff  12320930 Sep 17 23:23 laccd-courses-pp-cli
-rw-r--r--@ 1 laccd  staff        87 Sep 17 23:23 laccd-courses-pp-cli.sha256
-rwxr-xr-x@ 1 laccd  staff  42139810 Sep 17 23:25 programmapper-cli
-rw-r--r--@ 1 laccd  staff        84 Sep 17 23:25 programmapper-cli.sha256
```

**Version output**: attempted `connectors/bin/<binary> version --agent` and `--version` for all four binaries directly on the host. Each failed with `exec format error`. This is expected, not a defect: the binaries were built by `go build` inside the `golang:1.26` container without any `GOOS`/`GOARCH` override (exactly as the brief's script specifies), so they inherit the container engine's native target — `linux/arm64` on this Apple-Silicon Docker Desktop host — confirmed via `file`: `ELF 64-bit LSB executable, ARM aarch64 ... statically linked`. macOS cannot execute a Linux ELF directly outside a container. Per the brief's own fallback ("failing that, just `ls -la connectors/bin`"), the `ls -la` listing above was captured instead. No network-touching subcommand (`sync`, `search`, `doctor`, etc.) was ever run against any binary, and `PRINTING_PRESS_DOGFOOD`/`PRINTING_PRESS_VERIFY`/`PRINTING_PRESS_VERIFY_LIVE_HTTP` were never set.

## Sibling repos: clone/read-only confirmation

Dirty-status line counts (`git -C <sibling> status --short | wc -l`), captured before the build script ran and again after:

| sibling repo | before | after |
|---|---|---|
| laccd-class-search-cli | 6 | 6 |
| laccd-courses-pp-cli | 8 | 8 |
| programmapper-cli | 4 | 4 |
| assist-pp-cli | 0 | 0 |

Unchanged in all four cases. The only git operations performed against the sibling paths were `git clone --no-checkout` (reads committed objects only) plus the earlier read-only `git cat-file -t <sha>` checks used to confirm the pinned SHAs exist before writing `pins.toml`. No `stash`, `reset`, `checkout` (on the sibling itself), `pull`, or `clean` was ever run against a sibling repo.

## Files changed / committed

```
create mode 100644 backend/app/connectors/pins.py
create mode 100644 backend/tests/test_pins.py
create mode 100644 connectors/pins.toml
create mode 100755 scripts/build_pinned_cli.sh
```
(`connectors/bin/*` is a build artifact, covered by the existing `bin/` gitignore pattern, and was correctly left untracked — `git status --short` showed only the four files above before commit.)

Commit: `099a1cc feat(connectors): pin clean CLI revisions and build them from detached clones` on `main`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Not pushed; no branch created.

## Self-review

- **Completeness**: all four files match the brief verbatim; both brief tests pass; build produced all four binaries + sha256 files; full backend suite (12 tests, 100% coverage, zero warnings) passes; commit message/trailer exact.
- **Quality**: no logic deviated from the brief. `Pin` field patterns (`revision` 40-hex, `env_prefix` uppercase) enforced by pydantic `Field(pattern=...)` as specified.
- **Discipline**: only the four brief-specified files were staged and committed; no extra files, no docs, no README added. `connectors/bin/` correctly stayed untracked.
- **Testing**: both test functions in `test_pins.py` assert real properties (SHA length/hex-ness, uppercase env prefix, exact local_patches membership) — no placeholder assertions.

## Concerns

- None blocking. Two informational notes only (both anticipated by the brief and context, not defects):
  1. Built binaries are Linux/ARM64 ELF and cannot run directly on the macOS host outside Docker — expected given the brief's build script targets the container's native OS/arch and does not cross-compile. Verified via `file`, not via failed execution alone.
  2. `GOTOOLCHAIN=auto` fallback was not required for `assist` despite its `go 1.26.5` `go.mod` directive — Go's own default toolchain mode already handled it under plain `golang:1.26`. The script was left unmodified (matches the brief unless-needed condition).

---

## Fix report: cross-compile for the host platform

**Trigger**: coordinator flagged that the concern noted above ("binaries can't run directly on the macOS host") is load-bearing — later tasks run `<binary> agent-context --json` via subprocess on this same macOS host, so Linux ELF output is unacceptable.

**What changed** (`scripts/build_pinned_cli.sh`): still builds inside the pinned `golang:1.26` container with `CGO_ENABLED=0 -trimpath` (pinned-source guarantee unchanged), but now cross-compiles for the host instead of the container's native OS/arch:

- `GOOS` derived from `uname -s` (`Darwin`→`darwin`, `Linux`→`linux`); `GOARCH` derived from `uname -m` (`arm64`/`aarch64`→`arm64`, `x86_64`→`amd64`). Unknown values fail fast with a clear error.
- Both overridable via `AX_GOOS` / `AX_GOARCH` env vars.
- Passed to the build container as `-e GOOS="$GOOS" -e GOARCH="$GOARCH"` on the existing `docker run` line.
- Added a comment explaining why: the broker invokes these binaries via subprocess on this host, so they must run natively where the broker runs.
- No other line in the script changed.

**Rebuild**: `rm -f connectors/bin/* && ./scripts/build_pinned_cli.sh` — all four connectors built successfully (laccd_class_search, laccd_courses, programmapper, assist), no `AX_GOOS`/`AX_GOARCH` override needed since the derived host values (darwin/arm64) were correct on this machine.

**`file connectors/bin/*` after rebuild**:
```
assist-pp-cli:                    Mach-O 64-bit executable arm64
laccd-class-search-pp-cli:        Mach-O 64-bit executable arm64
laccd-courses-pp-cli:             Mach-O 64-bit executable arm64
programmapper-cli:                Mach-O 64-bit executable arm64
```
All four are now native Mach-O arm64 executables, matching the host (Darwin/arm64), not Linux ELF.

**New sha256 sums** (binaries changed because they were rebuilt for a different target platform; the pinned source revisions are unchanged):
```
d7b1d28df9d1e03b302cd4938de66a76c5e2414bd041eb755d441e39a6980046  assist-pp-cli
95ddaaecaffe6bdb07a4ec8ba112cf6a96662b45eef748aa305c60a12c9cc1eb  laccd-class-search-pp-cli
dc38e0caaf5cc52b9cb80837d57e65cb9cc188cc5983b789ae93df082625e773  laccd-courses-pp-cli
5d53379c2415aa56c56a560b90d7e5337e214cd620fdfd1e6d3573e00cd2f79b  programmapper-cli
```

**Offline version output** (no network-touching subcommand run against any binary; `PRINTING_PRESS_DOGFOOD`/`PRINTING_PRESS_VERIFY`/`PRINTING_PRESS_VERIFY_LIVE_HTTP` were never set):
```
assist-pp-cli version --agent          -> assist-pp-cli 1.0.2-0.20260816024116-35224ece2a19
assist-pp-cli --version                -> assist-pp-cli 1.0.2-0.20260816024116-35224ece2a19
laccd-class-search-pp-cli version --agent -> laccd-class-search-pp-cli 1.0.0
laccd-class-search-pp-cli --version       -> laccd-class-search-pp-cli 1.0.0
laccd-courses-pp-cli version --agent      -> laccd-courses-pp-cli 1.0.0
laccd-courses-pp-cli --version            -> laccd-courses-pp-cli 1.0.0
programmapper-cli version --agent         -> programmapper-cli 1.0.0
programmapper-cli --version               -> programmapper-cli 1.0.0
```
All four now execute natively on the host and report a version (previously all four failed with `exec format error`).

**Sibling repos**: dirty-status line counts re-checked before and after the rebuild — unchanged at 6 / 8 / 4 / 0 for `laccd-class-search-cli` / `laccd-courses-pp-cli` / `programmapper-cli` / `assist-pp-cli` respectively. Only `git clone --no-checkout` was run against them, same as before.

**Full backend test suite** (re-run after the fix):
```
cd backend && .venv/bin/python -m pytest
............                                                             [100%]
Required test coverage of 70% reached. Total coverage: 100.00%
12 passed in 0.49s
```
No warnings in the output.

**Commit**: `b40bd76 fix(connectors): cross-compile pinned CLIs for the host platform` on `main`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Only `scripts/build_pinned_cli.sh` was staged/committed (`connectors/bin/*` remains untracked/gitignored, as before).

**Concerns**: none. The original concern is resolved; no new issues surfaced.

---

## Fix report: clean up temp clones when a pinned build fails

**Trigger**: review finding (Important, plan-mandated) — `work="$(mktemp -d)"` was only removed by the trailing `rm -rf "$work"` at the end of each loop iteration. Under `set -euo pipefail`, a failure in `git clone`, `git checkout`, `docker run`, `cp`, or the `shasum` subshell aborts the iteration before that cleanup line runs, leaking the temp clone.

**What changed** (`scripts/build_pinned_cli.sh`): each loop iteration's body now runs inside its own subshell `( ... )`, with `trap 'rm -rf "$work"' EXIT` installed immediately after `work="$(mktemp -d)"`. The trailing explicit `rm -rf "$work"` was removed (the trap now covers both the success and failure paths). Added a short comment above the `python3 | while` pipeline explaining that each iteration's body runs in a subshell so the trap can guarantee cleanup. Every other line — including the `GOOS`/`GOARCH` cross-compile block from the previous fix round — is unchanged.

**Verification**:

1. `bash -n scripts/build_pinned_cli.sh` → passed (no syntax errors).
2. Failure-path test: ran `AX_GOARCH=notreal ./scripts/build_pinned_cli.sh` (an unsupported `GOOS/GOARCH` pair, so `go build` fails inside the container on the very first connector). Counted directories matching `tmp.*` or `ax-*` directly under `$TMPDIR` before and after:
   - Before: `0`
   - Script exit code: `2` (non-zero, confirming the failure propagated through `set -e`/`pipefail` rather than being swallowed)
   - After: `0`
   - No leaked temp clone directory was left behind.
3. Rebuilt normally afterward (`rm -f connectors/bin/* && ./scripts/build_pinned_cli.sh`) — all four connectors built successfully again. `file connectors/bin/*` (excluding `.sha256` files):
   ```
   assist-pp-cli:                    Mach-O 64-bit executable arm64
   laccd-class-search-pp-cli:        Mach-O 64-bit executable arm64
   laccd-courses-pp-cli:             Mach-O 64-bit executable arm64
   programmapper-cli:                Mach-O 64-bit executable arm64
   ```
   `connectors/bin/` is left in the good host-native state.
4. Full backend suite re-run:
   ```
   cd backend && .venv/bin/python -m pytest
   ............                                                             [100%]
   Required test coverage of 70% reached. Total coverage: 100.00%
   12 passed in 0.52s
   ```
   No warnings.

**Sibling repos**: dirty-status line counts re-checked before/after this round — unchanged at 6 / 8 / 4 / 0 for `laccd-class-search-cli` / `laccd-courses-pp-cli` / `programmapper-cli` / `assist-pp-cli`. No `PRINTING_PRESS_*` variables were ever set; no write operation touched any sibling working tree.

**Commit**: `5928355 fix(connectors): clean up temp clones when a pinned build fails` on `main`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Only `scripts/build_pinned_cli.sh` was staged/committed.

**Concerns**: none. Finding resolved; no new issues surfaced.
