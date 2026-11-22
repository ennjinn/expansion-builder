# Expansion Builder

A Mac app for building your own **MPC expansions**, including **MPCe** kits for the MPC Live III's
expressive pads: every pad corner gets its own samples, velocity layers, articulation, tune and start point.

Drop samples on pads, colour them, audition them with the built-in test sequencer, then export the
expansion to a folder or send it straight to your MPC over Wi-Fi.

## Download

Get the latest `Expansion-Builder-mac.zip` from **[Releases](../../releases)**, unzip it, and move
**Expansion Builder** to Applications.

The app isn't notarized by Apple, so macOS blocks it the first time you open it. To allow it:

1. Open the app once. When macOS says it can't verify it, click **Done**.
2. Go to System Settings → Privacy & Security, scroll down, and click **Open Anyway** next to Expansion Builder.
3. Confirm with your password. After that it opens normally.

(On macOS 14 and earlier you can instead right-click the app → **Open**.)

Requires macOS 13.4 or later (Apple Silicon or Intel). Windows support is planned.

## Features

- **Kits, 8 banks × 16 pads.** Drop sounds or whole folders onto pads, or drag pads around to swap them.
- **MPCe pads** (on by default; Option-click or **M** toggles). There are 4 corners per pad, each with
  velocity layers, its own articulation (196 of the MPC's flams, rolls and drags), tune, start and reverse.
  Choose snap-to-corner or morph.
- **Pad details.** One-shot / note-on, mono, mute groups, pad colours, and a large waveform for setting start points.
- **Mute groups by colour.** One click gives every pad of the same colour (across all 8 banks) the same mute group.
- **Sample browser.** Indexes your samples folder and sorts it into categories (kicks, snares, hats, loops, …)
  automatically. A built-in tuner shows the pitch of the sound you just played.
- **Test sequencer.** Program a quick pattern to hear the kit. It's for previewing only and isn't exported.
- **Export** writes a ready-to-use expansion folder, with optional preview audio and a .zip.
- **Send to MPC** copies the expansion straight into `Expansions` on your MPC over Wi-Fi.

## Send to MPC over Wi-Fi

This needs SSH access to your MPC. Fill in the **MPC over Wi-Fi** fields in the Export panel:

| Field | What to enter |
|---|---|
| MPC address | The MPC's IP address (on the MPC: Preferences → Wi-Fi) |
| Drive | `nvme` for the internal drive, or the name of an SD card or USB drive |
| SSH password | Your MPC's root password |

Sending an expansion with the same name replaces the copy on the MPC. If it doesn't show up straight
away, re-open Browse → Expansions on the MPC.

## What gets exported

```
My Expansion/
  Expansion.xml
  <identifier>.jpg                 cover art
  My Expansion/
    Kit 1.xtd                      MPC 3.x drum track
    Kit 1_[TrackData]/*.wav
    [Previews]/Kit 1.xtd.wav
```

This is the same layout as Akai's "MPCe Expressive Kits". Kits are MPC 3.x drum tracks (`.xtd`), not legacy `.xpm`
programs. Tested on an MPC Live III running MPC OS 3.10.1.

## Building from source

Needs Xcode's command-line tools (`xcode-select --install`).

    ./build.sh --open           # builds "Expansion Builder.app" and launches it
    swift mac/make_icon.swift   # redraws the app icon

The interface is plain HTML/JS in `web/`. `mac/main.swift` is a small WebKit shell that provides file
access, folder pickers, zipping and the SSH send.

Dev aids:
- `node tools/test_export.mjs` builds a test `.xtd` without the app.
- `"Expansion Builder.app/Contents/MacOS/ExpansionBuilder" --snapshot out.png --script s.js [--wait 30]`
  renders the UI after running a script (`app._t` exposes test hooks).

Format notes are at the top of `web/export.js`. `web/template.json.gz`, `web/articulations.js` and
`web/floatkeys.js` come from MPC OS 3.10.1 (Akai's "64 Pad Layout" template and articulation tables).

## Disclaimer

An independent, fan-made tool. Not affiliated with or endorsed by Akai Professional or inMusic.
MPC and MPCe are trademarks of their respective owners.
