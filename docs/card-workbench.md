# The card workbench: a design for approval

Status: a proposal for John. Nothing here is built. The open questions at the
end are his to decide, the size bound and the stack first among them.

The Viewer already runs the whole machine and already reads and writes the
card. What it lacks is an interface: the card tools sit at the bottom of a
long page, one drive and one file at a time, and copying a file resets the
machine. This design turns the page into a single-page application, the
emulated TEC-1G in the middle and the card on a workbench beside it, built
in stages that each ship and pass the same gates as today.

## Decisions already made

These came from John through the TEC-OS session and are not reopened here.

1. A card is a plain sector image: TEC-OS's container from block 0, the
   `TECOSVOL` header, its volume table and CP/M volumes, as TEC-OS's
   `docs/container-format.md` describes. No FAT32, no ROM change.
2. The main use is the round trip: read a card used on the board, get at its
   files on the PC, put them back, write the card back. Building cards
   matters, but less.
3. The Viewer is the workbench, because it can run the card as well as edit
   it.
4. The browser cannot reach an SD card's sectors. Card to PC needs a native
   tool, `tecvol read`; PC to card can use `tecvol install` or a common
   imager. `tecvol` lives in this repository, copies only the container's
   length from its header, and needs administrator rights, as imagers do.
5. The card format library stays in TEC-OS: `tools/lib/container.mjs`,
   `cpmfs.mjs`, `format.mjs`, `recipe.mjs` and `format/format.json`, used
   here through the `tec-os` submodule. Anything new it must do is a TEC-OS
   release.
6. The 155,026-byte bound on the page's module stands until John sets
   another. Today's page is 154,938 bytes, 88 under.

## Principles

**The card is either in the machine or on the bench, never both.** TEC-OS
and the PC must never change the same card at once, and TEC-OS holds
unwritten blocks in its cache and programs hold unclosed files, so a card
the machine is running can be looked at but not changed. Changing it means
taking it out first, as on the board: *Eject* waits for the machine to be
idle at the prompt with no pending blocks, then stops it, and the card goes
to the bench. *Insert* powers the machine on with the card. This replaces
today's Copy, which writes behind a running machine and then resets it, and
it makes the rule structural instead of a warning.

**Every change is undoable.** Before a write to a card, the workbench keeps
the card as it was. A card is 14 MiB, so the number kept is a setting and
the storage it takes is shown.

**One keyboard.** Every key on the page goes to the matrix except in the
serial pane, the phone keyboard and the page's controls. The menus, panels
and dialogs are controls, so keys work there as they do in any page; the
workbench takes no key from the machine (see "Keys").

**One format library.** The workbench edits cards only through TEC-OS's
library, so a card the workbench writes is one `tecvol verify` passes and
the ROM mounts.

## A. Functions

Each function says where it comes from: *today* (the page has it),
*library* (TEC-OS's library has it), *compose* (built here from library
calls) or *TEC-OS* (needs a library release, listed under "What the design
needs from TEC-OS"). The stage is in the migration plan (section D).

### A1. Cards as a library

| Function | Source | Stage |
| --- | --- | --- |
| A list of the cards the workbench knows, each with a name, when it was last used, its size, where it came from (the starter, a file opened, a card read from hardware, a copy) and where it lives (browser storage, or a file on disk) | new | 3 |
| Open a card from the list into the machine or onto the bench | today, for one card | 3 |
| New starter card | today | 1 |
| Open image (a file picker), Download image | today | 1 |
| Duplicate, rename, delete and export a card | new | 3 |
| Keep a copy before a risky change, list the copies, restore one | new | 3 |
| Today's single browser card becomes the first card in the list, named "Browser card" | migration | 3 |

Each card's record: an id, its name, origin, created and last-used times,
size, SHA-256 of the last saved bytes, its location (browser, or a file
handle) and its kept copies. CP/M 2.2 has no file dates, so the dates are
the workbench's, not the card's.

### A2. A card's structure

| Function | Source | Stage |
| --- | --- | --- |
| Volumes: label, geometry, read-only flag, drive mount, free space, file count | library (`parseContainer`, `CpmVolume.freeBytes`, `list`) | 2 |
| The drives the card asks for (format 1.1), and the live mounts after `cd` while it runs | library, today (`liveDrives`) | 2 |
| Check the card, as `tecvol verify` does, and report each problem | compose now, TEC-OS for one shared `verifyContainer` | 2 |
| Relabel a volume, set or clear its read-only flag, change mounts and the drives field | TEC-OS (`editVolume`) | 5 |
| New card from a recipe, or by hand: volumes, geometries, labels, mounts | library (`createContainer`, `buildRecipe`) | 5 |
| Add or remove a volume | TEC-OS (`rebuildContainer`) | 5 |
| "Resize" a volume: the format has two fixed geometries, G1M and G8M, so this is a new volume of the other geometry with the files copied across, refused if they don't fit | compose on `rebuildContainer` | 5 |

### A3. Files

| Function | Source | Stage |
| --- | --- | --- |
| List per volume and user area: name, size, read-only and system attributes, extents | library (`list` gives entries, records, attributes) | 2 |
| Select several (click, Shift and Ctrl or Command click, a select-all box) | new | 2 |
| Download one; download several as a `.zip` | today for one; new for `.zip` | 2 |
| Upload by picker or by drag and drop, folders included | today for files; new for drop and folders | 2 |
| Delete, with read-only files refused unless confirmed, as `tecvol era --force` | library (`erase`) | 2 |
| Rename, and set or clear read-only and system | TEC-OS (`rename`, `setAttributes`), or compose from `read`, `write`, `erase` | 2 |
| Copy and move between volumes and user areas | compose (`read`, `write`, `erase`) | 2 |
| Text conversion both ways: CR LF and `^Z` on the card, LF on the PC, by file or forced | today (`text.mjs`) | 2 |
| View a file as text or hex in place | new | 2 |
| Edit a text file in the browser | new; open question 6 | later |

The `.zip` writer needs no library: a zip of stored or deflated entries is a
few hundred bytes of code over the browser's own `CompressionStream`.

### A4. The machine and the card together

| Function | Source | Stage |
| --- | --- | --- |
| Which card the machine is running, by name, in the status bar | new | 1 |
| Eject: wait until the machine is at a prompt with no pending blocks, then stop it and put the card on the bench; offer Force, which loses the pending blocks as pulling the card would, if they don't clear | new | 2 |
| Insert: power on with the bench card | new (today's Power cycle) | 2 |
| Look at a running card's files, read-only, marked "as the card is now; TEC-OS may still be writing" | today | 2 |
| Reset, Power cycle, Pause, Display, Columns | today | 1 |
| The guest-cache status: pending blocks, and the card image and browser copy as separate stages | today | 1 |

### A5. Files on disk

| Browser | Card files | Folders | Browser copies |
| --- | --- | --- | --- |
| Chrome, Edge (Chromium) | Open a `card.img` and save back to the same file through the File System Access API; the handle kept in IndexedDB, permission asked again in a later session, with a click | Extract a volume to a folder, and add a folder's files, through `showDirectoryPicker` | IndexedDB |
| Firefox, Safari | Open by file picker, save by download, as today | Upload a folder by `<input webkitdirectory>`; extract as a `.zip` | IndexedDB; Safari may delete them after seven days without a visit, so the interface says to keep an exported copy |

Saving to a file on disk writes through `createWritable`, which Chromium
writes to a temporary file and moves into place when it closes, so a failed
save leaves the old file. The interface names the fallback where a browser
lacks a feature ("Save writes a download in this browser"), not hiding it.

### A6. The hardware round trip

A Help page and the File menu's "Read a card from an SD card" and "Write to
an SD card" screens walk through it:

1. Find the device. `diskutil list` on macOS, `lsblk` on Linux, `get-disk` in
   PowerShell on Windows. The screen shows how an SD card looks in each and
   warns that the wrong device destroys its contents.
2. Read the card: `sudo node tools/tecvol.mjs read /dev/disk4 card.img`. It
   will read block 0, refuses anything without the `TECOSVOL` header, and copies
   the container's length from it, 14 MiB on the starter card.
3. Open `card.img` in the workbench, work on it, save it.
4. Write it back: `sudo node tools/tecvol.mjs install card.img /dev/disk4`,
   which will show the device's size and name and want `--yes`; or write
   `card.img` with Raspberry Pi Imager ("Use custom") or balenaEtcher.

`tecvol` will refuse a device holding a mounted file system unless told,
and one smaller than the container. On Windows the device is
`\\.\PhysicalDriveN`, run from an administrator shell.

### A7. Safety

| Function | Stage |
| --- | --- |
| Confirm before anything destructive: delete, overwrite, remove a volume, Force eject, replace a card | 2 |
| Keep a copy before each write; restore from the list | 3 |
| Verify after each structural change, and refuse to save a card that fails; report every problem | 2, 5 |
| Storage used and available (`navigator.storage.estimate`), and a request for persistent storage (`navigator.storage.persist`), with its answer shown | 3 |

### Left out, and why

| Function | Why |
| --- | --- |
| FAT32 on the card, or a FAT32 hybrid | Decided: too much ROM for FAT32, nothing gained by the hybrid |
| Reading or writing an SD card from the browser | No web API reaches its sectors; WebUSB refuses mass-storage devices |
| Changing a card while the machine runs it | TEC-OS and the PC would change it at once; Eject and Insert replace this |
| Resizing a volume in place | The format has two fixed geometries; a new volume and a copy stands in |
| Several cards in the machine at once | The TEC-1G has one SD slot; the bench can hold another card |
| File dates | CP/M 2.2 has none on the card |
| Other CP/M disk formats (cpmtools definitions) | Cards are TEC-OS containers; cpmtools reads a volume already, with the definitions in `container-format.md` |
| Sync to a cloud service | Outside the Viewer; a card is a file the user can put anywhere |

## B. Information architecture and interface

### Menus

| Menu | Items |
| --- | --- |
| **File** | New starter card · New card… · Open image… · Open from disk… (Chromium) · Recent ▸ · Save · Save as… · Download image · Card library… · Read a card from an SD card… · Write to an SD card… |
| **Card** | Eject / Insert · Properties… · Volumes and mounts… · Check card · Keep a copy now · Restore a copy… · Duplicate · Rename… |
| **Files** | Upload… · Upload a folder… · Download · Download as .zip · Extract to a folder… (Chromium) · Delete · Rename… · Copy to… · Move to… · Attributes… · View · Text conversion ▸ |
| **Machine** | Run / Pause · Reset · Power cycle · Display ▸ · Columns ▸ |
| **View** | Front panel · Serial console · Workbench · Layout ▸ (machine first, workbench first) |
| **Help** | Keys · The round trip to an SD card · The card format · Build details |

### Layout

The machine's screen stays central and never scrolls away. The workbench is
a panel beside it with three tabs, Files, Card and Library; dialogs hold the
rare tasks (new card, volumes, round trip). The front panel (LCD, digits,
LEDs, GLCD) and the serial console fold under the screen. A status bar names
the card and its state.

Wide screens, 1280 pixels and up (the sketches' figures are illustrative):

```text
+- TEC-OS   File  Card  Files  Machine  View  Help ---------- [Running] [Keys: TEC-1G] -+
|                                            | Files | Card | Library                   |
|                                            | Drive A: SYSTEM v   User 0 v   [Upload]   |
|         PICO9918 screen, 4:3               | [ ] Name          Bytes  R S              |
|                                            | [x] SHELL.SVC      3,584  . .             |
|                                            | [ ] TED.COM       16,256  . .             |
|                                            | [x] TIMES.BAS      1,024  . .             |
|                                            | 2 selected  [Download] [Copy to] [...]    |
+--------------------------------------------+ 12 files, 6.9 MiB free                    |
| > Front panel: LCD, digits, LEDs, GLCD     |                                           |
| > Serial console, 4800 baud                |                                           |
+--------------------------------------------+-------------------------------------------+
| Starter card . in the machine . browser copy saved 14:02 . 0 pending blocks . 41 MiB  |
+---------------------------------------------------------------------------------------+
```

The Card tab, with the card on the bench:

```text
| Files | Card | Library                                        |
| Starter card, 14 MiB, format 1.1, 3 drives      [Check card]  |
| Vol  Label   Geometry  Drive  R/O  Files  Free                |
|  1   SYSTEM  G1M       A:     .      14   0.3 MiB             |
|  2   WORK    G8M       B:     .       0   8.0 MiB             |
|  3   ASM     G1M       -      .       9   0.6 MiB             |
| [Volumes and mounts...]  [Insert into the machine]            |
```

Narrow screens and phones: one column, the screen on top with the touch keys
under it, the workbench in tabs along the bottom.

```text
+- = TEC-OS ------- [Running] -+
|                              |
|      PICO9918 screen         |
|                              |
| [Ctrl][Esc][Tab][<][^][v][>] |
+------------------------------+
|  (the open tab's content)    |
|                              |
+------------------------------+
| Machine | Files | Card | ... |
+------------------------------+
```

The menu bar becomes the "=" menu. Dialogs fill the screen. Drag and drop
gives way to the picker, which phones handle well.

### Keys

The one-keyboard rule stays. The page's key handler already leaves keys to
buttons, inputs, selects and links; the menu bar, the workbench's table and
its dialogs are made of those, so once one has focus the keys work there:
arrows move through a menu, Enter chooses, Escape closes. Reaching the menus
from the machine is a click or a tap. The design takes no global shortcut,
because every key and chord a browser delivers (Ctrl, Option and Shift with
letters, the F-keys, Escape, Tab) already means something on the matrix, and
Command is the browser's. A chip in the menu bar, "Keys: TEC-1G" or "Keys:
page", shows where keys are going. Open question 4 asks whether to reserve
one.

### The Eject and Insert states

```text
 In the machine --Eject--> waiting for an idle prompt and 0 pending blocks
       ^                        |  clears           | doesn't clear
       |                        v                   v
       +------Insert------ On the bench <--- Force eject (loses N blocks)
```

On the bench the machine is off, the screens say "No card", and every Files
and Card function is enabled. In the machine, the Files tab is read-only and
says why.

## C. Technology

### What the stack costs

Each figure is esbuild's minified output with the page's settings, for a
menu bar, a dialog, a drop-down menu and tabs, before any workbench code:

| Stack | Minified | Gzip | Against today's 155,026 |
| --- | ---: | ---: | --- |
| shadcn/ui's base: React 18 and Radix | 236,045 | 75,115 | 1.5 times the whole page, on its own |
| Preact with the same Radix parts | 111,549 | 37,522 | 0.7 times the page |
| The browser's own `<dialog>` and popover, and a small menu bar script | 741 | 333 | under 1 KB |
| Tailwind CSS for a sample of the layout above | 10,160 | 2,901 | CSS, outside the module bound |

A full shadcn/ui set (toasts, tooltips, selects, context menus, scroll areas)
adds more Radix packages to the first row. The workbench's own code, on any
stack, should come to 20 to 40 KB: tables, dialogs, the zip writer, the card
library and the File System Access paths.

### Options

1. **shadcn/ui as suggested**: React, Radix and Tailwind. The richest kit, and
   the most to carry: about 250 to 300 KB before the workbench's code,
   against 155 KB for the whole page today.
2. **Preact with Radix**: shadcn/ui's components run through `preact/compat`
   at about half the size, with some risk at the edges of compatibility.
3. **No framework**: the browser's `<dialog>` and popover for dialogs and
   menus, now in Chrome, Edge, Firefox and Safari; a small module for the menu
   bar and the table's selection; Tailwind for styling, with shadcn/ui's
   design tokens, so it looks like shadcn/ui without its code. The smallest
   and the least to go wrong with the page's own key handling and frame loop.

My recommendation is option 3. The workbench has a small fixed set of
controls, the browser's own elements now cover them, and the page's real
work is the emulator, which needs the main thread at 4 MHz. Option 1 is
right if John wants the shadcn/ui components themselves rather than their
look.

### The size bound

Whatever the stack, the page grows. The bound measures one module today. I
propose two bounds: the machine's module, the emulator, keys, screens and
persistence, held under today's 155,026 bytes; and the workbench's own
module under a second bound John sets once the stack is chosen. They load as
two modules from the one page. Open questions 1 and 2.

### The build and the page

- esbuild stays. Tailwind's command-line build adds one step to
  `tools/build.mjs`. The Viewer gets a `package.json` dependency for the
  first time, `tailwindcss`, and `npm ci` in this repository as well as in
  `tec-os/`.
- `tools/page.mjs` still inlines everything into one standalone
  `tec-os-viewer.html`, so `gh-pages` keeps one `index.html` and
  `build-info.json`, with `tbg-preview/`, `LICENSE.txt` and `.nojekyll` as
  they are.

### What carries over

| Code | Carries over |
| --- | --- |
| The machine lifecycle, run loop and rendering in `main.mjs` | Unchanged, moved into the machine module |
| `keys.mjs`, the one keyboard and the phone keyboard | Unchanged; the menus are controls, which it already leaves alone |
| `persistence.mjs`, `store.mjs` | Persistence keeps its commit protocol; the store goes from one `current` record to a card library (IndexedDB version 2, which moves `current` into the library as its first card) |
| `guest-cache.mjs` | Unchanged; Eject reads its pending count |
| `text.mjs` | Unchanged |
| `tms.mjs`, `lcd.mjs`, `lcd-a00.mjs` | Unchanged |
| `index.html`, `style.css` | Rewritten for the new layout |

### Tests, memory and the strict runs

- The strict runs stay as they are: one fresh process per file, under
  `mem-guard` at 1024 MB, two complete runs at the final head before `main`.
- Browser tests find the page's controls by id. Today 22 of its ids carry tests
  (`#tms` 16 files, `#serial` 10, `#glcd` 7, the card controls 1 to 4 each).
  Where a control keeps its meaning it keeps its id, so most tests move with
  it; the tests of the card section are rewritten in stage 2.
- Each browser test file launches one Chromium, now in three processes
  (about 350 MB for a page). The workbench adds renderer memory, not
  processes; peaks are measured each stage, against today's 768 to 812 MB.

## D. Migration in stages

Each stage ships on its own: a branch, two complete strict runs and
`test/tbg` at its final head, a fast-forward of `main`, one publish to
`gh-pages`. The live demo keeps working between stages.

| Stage | What ships | Depends on |
| --- | --- | --- |
| 0 | This design approved; the stack and the bound chosen; TEC-OS's library requests filed | John |
| 1 | The shell: menu bar, layout, status bar, panels, phone layout. Every function of today moves into it and works as before, Copy file included | the stack |
| 2 | Eject and Insert, and the Files and Card tabs: several files at once, delete, rename, attributes, copy and move, folders and drag and drop, `.zip`, view as text or hex, check the card. Copy no longer resets the machine | TEC-OS `rename`, `setAttributes`, `verifyContainer`, or composed versions first |
| 3 | The card library: several cards, their records, duplicate, rename, delete, export, kept copies and restore, storage use and persistence | |
| 4 | Files on disk in Chromium: open and save the same file, handles kept, permission asked again; extract to a folder; every fallback named | |
| 5 | Card structure: properties, relabel, read-only, mounts and drives, new card from a recipe or by hand, add and remove volumes, change a volume's geometry | TEC-OS `editVolume`, `rebuildContainer` |
| 6 | The hardware round trip: `tools/tecvol.mjs read` and `install` in this repository, and the Help screens | TEC-OS's device code moved into its library |

The books describe the Viewer, so the Books agent hears of each stage that
changes the interface before it is published.

## E. Test plan

**Card operations in Node, no browser.** Every compose operation (rename,
attributes, copy and move, the zip writer, the card library's records, the
IndexedDB version 2 migration) gets a test that runs it on the starter card
and checks the result with `parseContainer`, `CpmVolume.verify` and a read
back. These are fast and light; most new tests belong here.

**The workbench in Chromium, one browser per file.**

- Eject waits for 0 pending blocks, Force eject warns and loses them, Insert
  powers on, and nothing in Files or Card can change a card in the machine.
- Several files at once: download as `.zip` and unpack it, delete, copy and
  move between volumes and user areas, with read-only files refused.
- Drag and drop and folder upload through Playwright's file chooser and
  drop events.
- The menus by mouse and by keys once focused; no key reaches the matrix
  while a menu or dialog has focus, and every key does when the screen has
  it.
- The phone layout at a phone's viewport, touch keys included.

**File System Access.** Chromium's pickers need a person's click, so tests
put a stand-in for `showOpenFilePicker` and `showSaveFilePicker` into the
page, backed by the origin private file system, which is real storage. The
test then reloads and checks that the handle comes back and asks for
permission. A second set deletes the pickers first and checks each fallback:
download for Save, `webkitdirectory` for folders, a `.zip` for Extract.

**Other browsers.** Playwright's Firefox and WebKit aren't installed here.
Open question 7 asks whether to add them for a smoke run of the fallbacks.

**`tecvol read` and `install`.** Run against a file standing in for the
device: a 32 MiB file with a card at block 0. Check that it copies exactly
the container's length, refuses a file without `TECOSVOL`, refuses a device
smaller than the container, and wants `--yes` for `install`. No test touches
a real device.

## What the design needs from TEC-OS

For the TEC-OS session, as library functions in `tools/lib/`, so the
workbench and `tecvol` stay one format:

1. `editVolume(image, index, { label, readOnly, mount })` and a way to set the
   header's drives field, each putting the checksum and table sum right and
   checking the result.
2. `rebuildContainer(image, plan)`: a new container from the old one's
   volumes, in a new order, with volumes added or removed, payloads copied.
3. `CpmVolume.rename(name, newName, { user })` and
   `CpmVolume.setAttributes(name, { readOnly, system }, { user })`, done in
   the directory without rewriting the data.
4. `verifyContainer(image)`: the checks `tecvol verify` runs, as a list of
   problems.
5. The device code of `tecvol install` in the library, with a reader beside
   it, so this repository's `tecvol read` and `install` share it.
6. A question: is there a way for the page to ask TEC-OS to write its
   pending blocks now, so that Eject need not wait for the next OS call?

## Open questions for John

1. **The stack**: shadcn/ui with React (option 1), Preact with Radix
   (option 2), or the browser's own elements with Tailwind (option 3, which
   I recommend)?
2. **The size bound**: two bounds, the machine's module at today's 155,026
   bytes and a new one for the workbench, or one new bound for the whole
   page? What figure?
3. **Eject and Insert**: is editing only a card on the bench, never one in the
   machine, the rule you want? It means Copy no longer happens behind a
   running machine.
4. **Keys**: no global shortcut, as proposed, or one reserved chord to reach
   the menus from the keyboard, at the cost of that chord on the matrix?
5. **Kept copies**: how many to keep per card by default, at 14 MiB each?
6. **Editing text in the browser**: in scope, and in which stage?
7. **Firefox and WebKit**: install Playwright's builds for a smoke run of the
   fallbacks, or test those by hand?
8. **The name**: `tecvol` here and `tecvol` in TEC-OS, with different
   commands, or another name for the Viewer's, such as `tecvol-device`?
