#!/usr/bin/env bash
# Passive recording of an explicitly selected owned cloud browser window.
# Run from the normal authorized desktop terminal; no browser launch or policy changes.
set -euo pipefail
cd "$(dirname "$0")/.."
window=${1:?Supply the verified current native browser window ID}
seconds=${2:?Supply duration in seconds}
name=${3:?Supply a new mp4 basename}
delay=${4:-0}
[[ "$window" =~ ^[0-9]+$ && "$seconds" =~ ^[0-9]+$ && "$delay" =~ ^[0-9]+$ ]] || exit 2
((seconds>=1 && seconds<=240 && delay<=30)) || exit 2
[[ "$name" =~ ^[a-z0-9_-]+\.mp4$ ]] || exit 2
: "${DISPLAY:?Run in the existing desktop display session}"
mkdir -p evidence/video
output="evidence/video/$name"
[[ ! -e "$output" ]] || { echo 'Output exists; inspect it, never overwrite an uncertain recording.' >&2; exit 2; }
log="${output%.mp4}.log"
printf 'scope=ACTUAL_CLOUD_BROWSER_WINDOW\nsource=synthetic_local_app\nwindow_id=%s\nrequested_duration_seconds=%s\nrequested_at_utc=%s\n' "$window" "$seconds" "$(date -u +%FT%TZ)" > "$log"
sleep "$delay"
printf 'capture_started_utc=%s\n' "$(date -u +%FT%TZ)" >> "$log"
# Pad one edge pixel where needed for yuv420p. No generated browser frames or audio.
/usr/bin/ffmpeg -hide_banner -nostdin -n -f x11grab -window_id "$window" -framerate 15 -draw_mouse 1 -i "$DISPLAY" -t "$seconds" -vf 'pad=ceil(iw/2)*2:ceil(ih/2)*2' -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -movflags +faststart "$output" >> "$log" 2>&1
printf 'capture_finished_utc=%s\n' "$(date -u +%FT%TZ)" >> "$log"
/usr/bin/ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,avg_frame_rate -of json "$output" > "${output%.mp4}-probe.json"
printf 'Recorded %s\n' "$output"
