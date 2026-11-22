# Expansion Builder: User Guide

This guide covers installing the app, connecting it to your MPC over Wi-Fi, building a kit, and getting
the finished expansion onto your MPC.

- [1. Install](#1-install)
- [2. Set up your MPC for Wi-Fi sending](#2-set-up-your-mpc-for-wi-fi-sending-optional)
- [3. A quick tour](#3-a-quick-tour)
- [4. Build your first kit](#4-build-your-first-kit)
- [5. MPCe pads (4 sounds per pad)](#5-mpce-pads-4-sounds-per-pad)
- [6. Shape the sound](#6-shape-the-sound)
- [7. Colours and mute groups](#7-colours-and-mute-groups)
- [8. Try it with the test sequencer](#8-try-it-with-the-test-sequencer)
- [9. Name it, add cover art, and save](#9-name-it-add-cover-art-and-save)
- [10. Get it onto your MPC](#10-get-it-onto-your-mpc)
- [11. MPC Bridge: copy songs from your MPC to your Mac](#11-mpc-bridge-copy-songs-from-your-mpc-to-your-mac)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)

---

## 1. Install

1. Download **Expansion-Builder-mac.zip** from the [Releases page](../../releases/latest).
2. Unzip it and drag **Expansion Builder** into your Applications folder.
3. Open it. The app isn't notarized by Apple, so macOS blocks it the first time:
   - Click **Done** on the warning.
   - Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to Expansion Builder.
   - Enter your password. From now on it opens normally.
4. If macOS asks whether Expansion Builder may access your Documents or Desktop folder, click **Allow**.
   The app needs this to read your samples.

You need macOS 13.4 or later. Apple Silicon and Intel Macs are both supported.

---

## 2. Set up your MPC for Wi-Fi sending (optional)

You can skip this section and copy expansions over with a USB stick instead (see [section 10](#10-get-it-onto-your-mpc)).
Wi-Fi sending is much quicker, though: one click and the expansion is on your MPC.

You need two things from the MPC: **developer mode switched on** and the MPC's **IP address**.
There's **no password to look up**: the MPC accepts the connection without one.

### Switch on developer mode

Developer mode turns on the MPC's SSH server, which the app uses to copy files across.

1. On the MPC, go to **Preferences → Info**.
2. Tap the **version** value **3 times**, then the **serial number** value **2 times**, then the
   **firmware version** value **once**.
3. Developer mode is now on. (On MPC OS 3.10 the setting is called **Developer Panel**. It turns on
   the MPC's SSH server, which is what the app connects to.)

> 🔒 **Safety:** developer mode lets anyone on the same network get full access to the MPC, with no
> password. Only use it on your own home network, and **switch it off** when you take the MPC anywhere
> else (gigs, studios, public Wi-Fi).

### Find the MPC's IP address

1. Connect the MPC to the **same Wi-Fi network as your Mac**: **Preferences → Wi-Fi**.
2. The same screen shows the MPC's **IP address**, which looks like `192.168.1.50`. Write it down.

Your router can give the MPC a new address after a restart. If sending stops working, check this number
again first.

### Enter it in the app

At the bottom of the left-hand **Export** panel, under **MPC over Wi-Fi**:

| Field | What to enter |
|---|---|
| **MPC address** | The IP address, e.g. `192.168.1.50` |
| **Drive** | `nvme` for the MPC's internal drive. For an SD card or USB drive, type its name as the MPC shows it. |
| **SSH password** | Leave it **blank** |

The app remembers these settings, so you only enter them once.

### Check the connection light

The header at the top of the window shows whether the app can reach your MPC:

- 🟢 **Connected to MPC …** — all set. It shows your MPC's model name.
- 🔴 **No Wi-Fi MPC connection** with a **Connect** button — click Connect to try again. If there's no address yet,
  or the MPC still can't be reached, MPC Bridge opens so you can enter or fix the IP address.

The light checks again every 30 seconds and whenever you switch back to the app.

---

## 3. A quick tour

The window is split into columns. Drag the thin gutters between them to resize, and click **‹ / ›** to fold
any panel down to a thin strip (click the strip to bring it back). To change the order, **drag a panel by its
header** (or a folded strip) left or right. The app remembers the order, widths and folds.

| Column | What it's for |
|---|---|
| **1 · Expansion / 5 · Export** (left) | Expansion name, author, description, cover art, and the Export / Send buttons |
| **2 · Kits** | Kit tabs, the kit name, 8 banks (A to H) of 16 pads |
| **3 · Pad details** | Everything about the selected pad: samples, layers, articulation, sound, colour, mute group |
| **4 · Expansion Samples** (folded by default) | The sounds you've added to this project |
| **Sample Library** (toggle at top right) | Your whole samples folder, sorted into categories automatically |
| **Test sequencer** (bottom) | A small pattern editor for hearing your kit; it isn't exported |

The small readout in the header shows the pitch of the last sound you played (for example, `D1 −13 ct`),
which is handy for tuning kicks and 808s.

---

## 4. Build your first kit

### Add sounds

Use whichever way is quickest for you:

- **Drag from Finder** onto a pad. Drop a **folder** to fill pads in order.
- **Use the Sample Library.** Click **Sample Library** at the top right. The first time, click **Folder…** to choose your
  samples folder (it defaults to `~/Documents/Samples`). Sounds are sorted into Kicks, Snares, Hi-Hats,
  Loops and so on. Click a sound to hear it, then **drag it onto a pad**, or press **Enter**
  (or double-click) to put it on the selected pad. The arrow keys move through the list.
- **Use Expansion Samples.** Drop sounds into it, then drag them onto pads. **Fill empty pads** puts every
  unused sound onto the empty pads, starting from the current bank.

### Work with pads

- **Click a pad** to play it and show its details.
- Play pads from your computer keyboard: **1 2 3 4 / Q W E R / A S D F / Z X C V**, laid out like the MPC's
  4×4 grid.
- **Drag a pad onto another** to swap them.
- Switch banks with the **A–H** buttons under the pads, or the **← →** arrow keys.
- Set how hard keyboard and mouse hits play with the **VEL** slider next to the kit name.

### More kits

Click **+ Kit** to add another kit. Each kit becomes its own drum track in the expansion. Click the kit
name in the green display to rename it.

---

## 5. MPCe pads (4 sounds per pad)

The MPC Live III's pads detect *where* you hit them. On an **MPCe pad** each of the 4 corners
(top-left, top-right, bottom-left, bottom-right) can play its own sound, so one bank gives you 64 sounds.

- New pads start in MPCe mode. **Option-click** a pad, press **M**, or use the switch at the top of the
  pad details to turn MPCe mode on or off.
- The **first** sound you drop on an empty MPCe pad is copied to all 4 corners. Drop more sounds on
  individual corners to replace them one at a time.
- Click a corner on the pad (or in the **Quadrant** box in pad details) to select and edit it.
- Each corner has a **LO** and a **HI** velocity layer: soft hits play LO and hard hits play HI.
- **XY mode:**
  - **Snap to quadrant** — each corner plays its own sound.
  - **Morph (blend)** — the four sounds blend depending on where your finger is.
- **Copy quadrant to all 4** copies the current corner's settings to the other three.

If you're building for MPCs without MPCe pads, switch MPCe off. Normal pads get up to 8 velocity layers.

---

## 6. Shape the sound

In the pad details for the selected pad (or corner):

- **Trigger:** **One Shot** plays the whole sample; **Note On** stops when you let go.
- **Mono** stops the previous hit when the pad is struck again.
- **Articulation** is one of 196 of the MPC's own flams, drags, rolls, buzzes and note repeats.
  Step through them with **‹ ›** or the **, .** keys, or click **Cycle all** to hear each one in turn.
- **Sound** has Level, Pan, Tune, Fine and Reverse for the selected layer.
- **The waveform** sets the start point. Click or drag to set it, **Shift**-drag for fine moves,
  scroll to zoom, and double-click to see the whole sample. This is great for trimming the silence
  off the front of a sample.

Click any slider's number to type an exact value. **Option-click** or double-click a slider to reset it.
**⌘Z** undoes and **⇧⌘Z** redoes.

---

## 7. Colours and mute groups

**Pad colour.** Choose a colour in pad details. **Apply to bank** colours every used pad in the bank.
The colours carry over to the MPC.

**Mute group.** Pads in the same mute group cut each other off, the classic example being an open hi-hat
silenced by a closed one. Set a pad's group in pad details, or let the app do it for you:

**Mute groups by colour** (the button above the kit name) goes through every pad from A01 to H16. The
first pad of each colour starts a new group (1, 2, 3, and so on), and every other pad of that colour,
in any bank, joins it. So:

1. Colour all your hi-hats yellow and all your 808s green.
2. Click **Mute groups by colour**.
3. Hi-hats choke each other, and so do 808s.

Pads left on the automatic colour are set to no mute group. Each pad shows its group next to its name
(e.g. `A01 MG1`).

---

## 8. Try it with the test sequencer

The bar at the bottom of the window is a small step sequencer for hearing your kit. Nothing in it is exported.

- Every pad (or MPCe corner) with a sound gets its own row.
- **Click a step** to add a note. **Drag sideways** to change its length, **drag up or down** to change
  its velocity, and click it again to remove it.
- **Space** plays and stops. Set the tempo in **BPM**.
- **M** and **S** on each row mute and solo it. Mute groups work here like they do on the MPC.
- **Drag the bar on its top edge** to make the sequencer taller or shorter (double-click the bar to reset it).
  Click **▾** or the header to fold it away. The app remembers both.

---

## 9. Name it, add cover art, and save

In the **Expansion** panel on the left:

- **Cover art:** drop a square image on the box (or click it to choose one).
- **Expansion name** (required), **Author**, and **Description**.
- **Advanced → Version** is just a label. You don't need to change it when you update an expansion.

**Save** your work with **Save** at the top right. A project is an `.ebproj` folder that keeps copies of
all its samples, so it still works if you move or delete the originals. Use **Open…** to come back to it later.

---

## 10. Get it onto your MPC

### Option A: Send to MPC (Wi-Fi)

1. Make sure developer mode is on and the Wi-Fi fields are filled in (see [section 2](#2-set-up-your-mpc-for-wi-fi-sending-optional)).
2. Click **📡 Send to MPC**.
3. On the MPC, open **Browse → Expansions**. Your expansion is there.

Sending again with the **same expansion name** replaces the copy on the MPC. If you rename the expansion,
you'll end up with two. Delete the old one from the **Expansions** tab in MPC Bridge ([section 11](#11-mpc-bridge-copy-songs-from-your-mpc-to-your-mac)).

### Option B: Export and copy by USB

1. Click **⬇ Export expansion** and choose a folder. The app makes the expansion folder and shows it in Finder.
2. Copy that folder into an **Expansions** folder at the top level of a USB stick or SD card (create the folder if it doesn't exist).
3. Plug the drive into the MPC and look in **Browse → Expansions**.

Export options:
- **Render kit preview audio** makes the short demo you hear when browsing kits on the MPC.
- **Also make a .zip** is handy for sharing the expansion.
- **Current kit only** exports just the selected kit as a drum track, without the expansion around it.

---

## 11. MPC Bridge: copy songs from your MPC to your Mac

**📡 MPC Bridge** (top right, next to the connection light) works the other way round from Send to MPC: it copies
things **from** your MPC to your Mac over Wi-Fi. It needs the same setup as [section 2](#2-set-up-your-mpc-for-wi-fi-sending-optional).

1. **Save** your song on the MPC. MPC Bridge copies the last saved version.
2. Click **📡 MPC Bridge**. It looks on all the MPC's drives (internal, SD card, USB) and lists what it finds:
   - **Projects** — your saved songs, newest first, with date and size. Each one is copied *complete*: the
     `.xpj` file plus its `_[ProjectData]` folder with all the samples, ready to open in the MPC desktop software
     or to copy back to an MPC later.
   - **Audio** — the newest WAV files on the MPC. Export a mixdown or stems on the MPC first, then press **⟳** and
     they appear here.
3. Tick what you want (or **Select all**).
4. **Save to:** click **Choose…** to pick a folder on your Mac. The app remembers it.
5. Click **⬇ Grab**. If something with the same name is already in that folder, you're asked before it's replaced.
   With **Show in Finder when done** ticked, the folder opens when it's finished.

Expansions, plugins, Splice downloads and the MPC's temporary recordings are left out of the lists.

It's also an easy way to back up all your projects: Select all, then Grab.

### Deleting expansions from the MPC

The **Expansions** tab lists every expansion installed on the MPC, with its maker and size. Tick the ones you
want to remove and click **🗑 Delete from MPC**. You're asked to confirm, and it can't be undone.

- Akai's own factory expansions are shown with a 🔒 and can't be deleted from here.
- The MPC may keep showing a deleted expansion in its browser until you restart it.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| 1–4, Q–R, A–F, Z–V | Play pads (4×4, like the MPC) |
| ← → | Previous / next bank |
| M | Toggle MPCe on the selected pad |
| , . | Previous / next articulation |
| Space | Play / stop the test sequencer |
| Esc | Stop all sound |
| ⌘Z / ⇧⌘Z | Undo / redo |
| Option-click pad | Toggle MPCe |

---

## Troubleshooting

**The header says "No Wi-Fi MPC connection"** — or **"Send to MPC failed"**
- Check that the MPC is on, connected to Wi-Fi, and on the **same network** as your Mac.
- Check the IP address again (Preferences → Wi-Fi on the MPC). It can change after a restart.
- Check that developer mode is still on.

**"No drive mounted at … on the MPC"**
The **Drive** field doesn't match a drive on the MPC. Use `nvme` for the internal drive, or the exact name
of the SD card or USB drive.

**The expansion doesn't appear on the MPC**
Leave **Browse → Expansions** and open it again. If it still isn't there, restart the MPC.

**macOS keeps asking for folder access**
Click **Allow**. If you want it never to ask, add Expansion Builder under System Settings →
Privacy & Security → **Full Disk Access**.

**The Sample Library is empty or out of date**
Click **Folder…** to point it at your samples folder, or **⟳** to rescan after adding new sounds.

---

*Expansion Builder is an independent, fan-made tool, not affiliated with or endorsed by Akai Professional or inMusic.*
