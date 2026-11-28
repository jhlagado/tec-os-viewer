# The TEC-OS card workbench: a design for approval

Status: the second draft, for John. Nothing here is built. It takes his
decisions of 28 November 2026 as its frame: the application is a workbench
for SD cards, the emulator is one page of it, the stack is shadcn/ui with
Tailwind, and there is no size ceiling. The open questions at the end are his.

## Decisions already made

1. **The application's shape.** A web application whose main purpose is the
   workbench: building and managing SD cards and their files. Today's
   Viewer, the emulated TEC-1G running TEC-OS, becomes one page of it. Once
   you have a card, you open it in the emulator to run TEC-OS on it. One
   application, one card library, one navigation; not two sites.
2. **The stack.** shadcn/ui, so React and Radix primitives, styled with
   Tailwind, themed through Tailwind's design tokens in one place.
3. **No size ceiling.** John lifted it on 28 November 2026. Good design is the
   requirement; load time is a matter of good practice. The test memory
   guard, 1024 MB, stands: it is about the test machine, not the page.
4. **A card is a plain sector image**: TEC-OS's container from block 0, the
   `TECOSVOL` header, its volume table and CP/M volumes, as TEC-OS's
   `docs/container-format.md` describes. No FAT32, no ROM change.
5. **The main use is the round trip**: read a card used on the board, get at
   its files on the PC, put them back, write the card back. Building cards
   matters, but less.
6. **The browser cannot reach an SD card's sectors.** Card to PC needs a
   native tool, `tecvol read`; PC to card can use `tecvol install` or a
   common imager. `tecvol` lives in this repository, copies only the
   container's length from its header, and needs administrator rights.
7. **The card format library stays in TEC-OS**: `tools/lib/container.mjs`,
   `cpmfs.mjs`, `format.mjs`, `recipe.mjs` and `format/format.json`, used here
   through the `tec-os` submodule. Anything new it must do is a TEC-OS
   release.

## 1. The application

### Pages

| Page | Route | What it is for |
| --- | --- | --- |
| **Cards** | `#/` | The card library: every card the application knows, where each lives, which one is in the machine. New, open, import, duplicate, rename, delete, export. The home page |
| **Card** | `#/cards/:id` | One card on the workbench, in two tabs: **Files** (per volume and user area) and **Volumes** (the card's structure, mounts, checks). Most of the work happens here |
| **Emulator** | `#/emulator` | The TEC-1G running TEC-OS on the card in the machine: today's Viewer, its screens, front panel, serial console and controls |
| **SD card** | `#/sd-card` | The hardware round trip: reading a card from an SD card with `tecvol read`, writing it back with `tecvol install` or an imager |
| **Help** | `#/help/:topic` | Keys, the card format, build details |

The routes are hash routes, so the application works from `gh-pages` and
from a file opened locally without any server rewriting.

### The shell

Every page sits in one shell: a sidebar for navigation, a menu bar for
commands, the page, and a status bar.

- **Sidebar** (shadcn/ui `Sidebar`): Cards; the open card, with Files and
  Volumes under it; Emulator, with the card in the machine named under it;
  SD card; Help. It collapses to icons, and on a phone it is a sheet.
- **Menu bar** (`Menubar`): File, Card, Files, Machine, View, Help. Items that
  don't apply to the page are disabled, not hidden, so the menus stay the
  same everywhere.
- **Status bar**: the card in the machine and its state (running, paused, on
  the bench), the open card's saved state, TEC-OS's pending blocks, and the
  storage used.

### The card and the machine

The machine has one SD slot. One card at a time is **in the machine**; the
others are on the shelf, and the one open on the Card page is **on the
bench**.

```text
 Cards page                     Card page                         Emulator page
 +-----------+   Open    +--------------------+   Run in emulator   +-------------+
 | the shelf | --------> | on the bench:      | ------------------> | in the      |
 |           |           | Files and Volumes  |   (Insert)          | machine     |
 |           | <-------- | can change it      | <------------------ |             |
 +-----------+   Close   +--------------------+   Eject              +-------------+
```

- **Insert** (Run in emulator) puts the bench card in the machine and powers
  it on, and opens the Emulator page.
- **Eject** waits until the machine is idle at a prompt with no pending
  blocks, stops it and puts the card back on the bench. If the blocks don't
  clear, Force eject loses them, as pulling the card from the board would,
  after a warning that says how many.
- The Card page of the card in the machine is read-only, marked "In the
  machine: Eject to change it", so TEC-OS and the PC never change the same
  card at once. It shows the card as it is now and says TEC-OS may still be
  writing.
- Leaving the Emulator page pauses the machine; coming back resumes it. The
  status bar says "Paused while away" (open question 3).

This replaces today's Copy file, which writes behind a running machine and
then resets it.

### Keys

There is a matrix keyboard only on the Emulator page, so the one-keyboard
rule is the Emulator page's rule.

- **On the Emulator page** every key goes to the matrix while the machine has
  focus: the screens, the front panel, or nothing. That changes the rule's
  form from today's: it names where keys go to the matrix, instead of the
  controls that keep theirs, because Radix's menu items, dialogs and lists
  are `div`s with ARIA roles, not buttons, and today's handler would send
  their keys to the matrix. The serial pane keeps its own keys, as today. The
  menus, the sidebar and any dialog keep theirs. A chip in the menu bar,
  "Keys: TEC-1G" or "Keys: page", shows which.
- **On the other pages** there is no matrix, so the application has ordinary
  shortcuts: Ctrl or Command with O to open, S to save, A to select all, a
  command palette (`Command`) on Ctrl or Command with K, Delete for delete,
  F2 for rename. None reaches the Emulator page.

## 2. Principles

**One place for each card.** A card is on the shelf, on the bench or in the
machine; only the bench changes it.

**Every change is undoable.** Before each write the workbench keeps the card
as it was. A card is 14 MiB, so the number kept is a setting and the storage
it takes is shown (open question 4).

**One format library.** The workbench changes cards only through TEC-OS's
library, so a card it writes is one `tecvol verify` passes and the ROM
mounts, and it checks the card after every structural change.

**The emulator's code stays the emulator's.** The machine, keys,
persistence, guest cache and screens are plain modules today and stay so;
React mounts them, it doesn't rewrite them (section 5).

## 3. Functions

Each function says where it comes from: *today* (the Viewer has it),
*library* (TEC-OS's library has it), *compose* (built here from library
calls) or *TEC-OS* (needs a library release, listed in section 8). The stage
is in the migration plan, section 6.

### 3.1 The card library (Cards page)

| Function | Source | Stage |
| --- | --- | --- |
| Every card known, with its name, when it was last used, its size, where it came from (the starter, a file opened, a card read from hardware, a copy) and where it lives (browser storage, or a file on disk); which is in the machine | new | 1 |
| New starter card | today | 1 |
| New card from a recipe or by hand: volumes, geometries, labels, mounts | library (`createContainer`, `buildRecipe`) | 4 |
| Import a card image (picker or drag and drop) | today, as Open image | 1 |
| Open a card on the bench; run it in the emulator | new | 1 |
| Duplicate, rename, delete; export as a file | today for Download image; new for the rest | 2 |
| Kept copies: keep one now, list them, restore one | new | 2 |
| Storage used and available (`navigator.storage.estimate`), and persistent storage requested (`navigator.storage.persist`), with the browser's answer shown | new | 2 |
| Today's one browser card becomes the first card in the library, "Browser card", the first time the application opens | migration | 1 |

Each card's record: an id, name, origin, created and last-used times, size,
the SHA-256 of its saved bytes, its location and its kept copies. CP/M 2.2
has no file dates, so the dates are the application's, not the card's.

### 3.2 Files (Card page, Files tab)

| Function | Source | Stage |
| --- | --- | --- |
| List per volume and user area: name, size, read-only and system attributes, extents; sort by any column | library (`list`) | 1 |
| Select several: click, Shift or Ctrl and Command click, a header check box | new | 1 |
| Download one; download several as a `.zip` | today for one; new for `.zip` | 1 |
| Upload by picker or by drag and drop, folders included | today for files; new for drop and folders | 1 |
| Delete, read-only files refused unless confirmed, as `tecvol era --force` | library (`erase`) | 1 |
| Rename; set or clear read-only and system | TEC-OS (`rename`, `setAttributes`), composed from `read`, `write` and `erase` until then | 1 |
| Copy and move between volumes and user areas | compose | 1 |
| Text conversion both ways: CR LF and `^Z` on the card, LF on the PC, by file or forced | today (`text.mjs`) | 1 |
| View a file as text or hex | new | 1 |
| Edit a text file in the browser | new; open question 5 | 5 |
| Extract a volume to a folder, and add a folder, through `showDirectoryPicker` (Chromium) | new | 3 |

A `.zip` needs no library: the browser's `CompressionStream` deflates, and a
zip writer over it is short.

### 3.3 Volumes (Card page, Volumes tab)

| Function | Source | Stage |
| --- | --- | --- |
| Each volume: label, geometry, read-only flag, drive mount, free space, file count | library | 1 |
| The drives the card asks for (format 1.1); the live mounts after `cd` while it runs | library, today (`liveDrives`) | 1 |
| Check the card, as `tecvol verify` does, every problem listed | compose now; TEC-OS `verifyContainer` | 1 |
| Relabel a volume, set or clear its read-only flag, change mounts and the drives field | TEC-OS (`editVolume`) | 4 |
| Add or remove a volume | TEC-OS (`rebuildContainer`) | 4 |
| Change a volume's geometry: the format has two, G1M and G8M, so this is a new volume of the other with the files copied across, refused if they don't fit | compose on `rebuildContainer` | 4 |

### 3.4 The emulator (Emulator page)

| Function | Source | Stage |
| --- | --- | --- |
| The PICO9918 screen, LCD, digits, LEDs, GLCD and serial console | today | 1 |
| Run and Pause, Reset, Power cycle, Display, Columns | today | 1 |
| The phone keyboard and touch keys | today | 1 |
| The guest-cache status, and the card image and browser copy as separate stages | today | 1 |
| Eject; Insert from the Card page | new | 1 |
| No card in the machine: the page says so and offers the library | new | 1 |

### 3.5 Files on disk

| Browser | A card as a file | Folders | Cards in the browser |
| --- | --- | --- | --- |
| Chrome, Edge | Open a `card.img` and save back to the same file through the File System Access API; the handle kept in IndexedDB; permission asked again in a later session, with a click | `showDirectoryPicker` to extract and add | IndexedDB |
| Firefox, Safari | Import by picker, export by download, as today | Upload a folder by `<input webkitdirectory>`; extract as a `.zip` | IndexedDB; Safari may delete them after seven days without a visit, so the application says to export a copy |

Saving to a file writes through `createWritable`, which Chromium writes to a
temporary file and moves into place when it closes, so a failed save leaves
the old file. Wherever a browser lacks a feature the interface says what it
does instead ("Save downloads the card in this browser").

### 3.6 The SD card page

1. Find the device: `diskutil list` on macOS, `lsblk` on Linux, `get-disk` in
   PowerShell on Windows. The page shows what an SD card looks like in each
   and warns that the wrong device loses its contents.
2. Read it: `sudo node tools/tecvol.mjs read /dev/disk4 card.img`. It will
   read block 0, refuse anything without the `TECOSVOL` header, and copy the
   container's length from it, 14 MiB for the starter card.
3. Import `card.img` on the Cards page, work on it, save or export it.
4. Write it back: `sudo node tools/tecvol.mjs install card.img /dev/disk4`,
   which will show the device's size and name and want `--yes`; or write
   `card.img` with Raspberry Pi Imager ("Use custom") or balenaEtcher.

`tecvol` will refuse a device holding a mounted file system unless told, and
one smaller than the container. On Windows the device is
`\\.\PhysicalDriveN`, from an administrator shell.

### 3.7 Safety

| Function | Stage |
| --- | --- |
| Confirm (`AlertDialog`) before anything destructive: delete, overwrite, remove a volume, Force eject, replace or delete a card | 1 |
| Keep a copy before each write; restore from the list | 2 |
| Check the card after each structural change and refuse to save one that fails, listing every problem | 1, 4 |
| Storage and persistence on the Cards page and in the status bar | 2 |

### Left out, and why

| Function | Why |
| --- | --- |
| FAT32 on the card, or a hybrid | Decided: too much ROM for FAT32, nothing gained by the hybrid |
| Reading or writing an SD card from the browser | No web API reaches its sectors; WebUSB refuses mass-storage devices |
| Changing a card the machine is running | TEC-OS and the PC would change it at once; Eject and Insert replace this |
| Resizing a volume in place | Two fixed geometries; a new volume and a copy stands in |
| Several cards in the machine | The TEC-1G has one SD slot |
| File dates | CP/M 2.2 keeps none on the card |
| Other CP/M disk formats | Cards are TEC-OS containers; cpmtools reads a volume already, with the definitions in `container-format.md` |
| Cloud sync | Outside the application; a card is a file the user can put anywhere |

## 4. The pages

The sketches' figures are illustrative.

### Cards

```text
+- TEC-OS -------------+- File  Card  Files  Machine  View  Help ------------------------+
| > Cards              |  Cards                          [+ New card v]  [Import image]  |
|   Starter card       |  +----------------------------------------------------------+  |
|     Files            |  |  Name            From        Lives in   Last used  Size  |  |
|     Volumes          |  |  Starter card    starter     browser    14:02      14 MiB|  |
|   Emulator           |  |    [In the machine]                                      |  |
|     Starter card     |  |  Board card 27/11 SD card    card.img   yesterday  14 MiB|  |
|   SD card            |  |  Copy of Starter copy        browser    26 Nov     14 MiB|  |
|   Help               |  +----------------------------------------------------------+  |
|                      |  Browser storage: 42 MiB of 2.1 GiB, persistent              |  |
+----------------------+-----------------------------------------------------------------+
| Starter card in the machine, running . saved 14:02 . 0 pending blocks . 42 MiB          |
+-----------------------------------------------------------------------------------------+
```

Each row has a menu (`DropdownMenu`): Open, Run in emulator, Duplicate,
Rename, Export, Keep a copy, Restore a copy, Delete.

### Card: Files

```text
+- TEC-OS -------------+- File  Card  Files  Machine  View  Help ------------------------+
| > Cards              |  Starter card                 [Run in emulator]  [Check card]   |
|   Starter card       |  Files | Volumes                                                |
|   > Files            |  A: SYSTEM v    User 0 v    Text: by file v   [Upload v]        |
|     Volumes          |  +----------------------------------------------------------+  |
|   Emulator           |  | [ ] Name          Bytes    R/O  Sys  Extents             |  |
|   SD card            |  | [x] SHELL.SVC     3,584     .    .     1                 |  |
|   Help               |  | [ ] TED.COM      16,256     .    .     1                 |  |
|                      |  | [x] TIMES.BAS     1,024     .    .     1                 |  |
|                      |  +----------------------------------------------------------+  |
|                      |  2 selected  [Download] [Copy to] [Move to] [Delete] [...]    |
|                      |  14 files . 0.3 MiB free . drop files here to add them        |
+----------------------+-----------------------------------------------------------------+
```

The table is shadcn/ui's data table over TanStack Table. A file's menu, by
right click (`ContextMenu`) or its row's button, has View, Download, Rename,
Attributes, Copy to, Move to, Delete. View opens a `Sheet` with Text and Hex
tabs.

### Card: Volumes

```text
|  Starter card, 14 MiB, format 1.1, asks for 3 drives          [Check card] |
|  Files | Volumes                                                           |
|  Vol  Label   Geometry  Drive  R/O  Files  Free       [+ Add volume]       |
|   1   SYSTEM  G1M       A:     .     14    0.3 MiB    [...]                |
|   2   WORK    G8M       B:     .      0    8.0 MiB    [...]                |
|   3   ASM     G1M       -      .      9    0.6 MiB    [...]                |
|  Check: passed at 14:05                                                    |
```

### Emulator

```text
+- TEC-OS -------------+- File  Card  Files  Machine  View  Help ---- [Keys: TEC-1G] ----+
| > Cards              |  Starter card   [Pause] [Reset] [Power cycle] [Eject]  4.00 MHz |
|   Starter card       |  +--------------------------------------------+  Display v     |
|   Emulator           |  |                                            |  Columns v     |
|   > Starter card     |  |          PICO9918 screen, 4:3              |                |
|   SD card            |  |                                            |                |
|   Help               |  +--------------------------------------------+                |
|                      |  > Front panel: LCD, digits, LEDs, GLCD                        |
|                      |  > Serial console, 4800 baud                                   |
+----------------------+-----------------------------------------------------------------+
| Starter card in the machine, running . saved 14:02 . 0 pending blocks                   |
+-----------------------------------------------------------------------------------------+
```

The sidebar collapses to icons here by default, to give the screen room.

### Phones

```text
+- = TEC-OS ------ [Running] -+     +- = Starter card ----------+
|                             |     | A: SYSTEM v   User 0 v    |
|      PICO9918 screen        |     | [ ] SHELL.SVC     3,584   |
|                             |     | [x] TED.COM      16,256   |
| [Ctrl][Esc][Tab][<][^][v][>]|     | [ ] TIMES.BAS     1,024   |
| > Front panel               |     | 1 selected  [...]         |
+-----------------------------+     +---------------------------+
| Cards | Card | Emulator |...|     | Cards | Card | Emulator |  |
+-----------------------------+     +---------------------------+
```

On a phone the sidebar becomes a bottom bar and the menu bar the "=" menu.
Dialogs fill the screen (`Drawer` on a phone, `Dialog` on a wide screen).
Selection is a tap on the check box; the file menu is a long press or the
row's button.

### Menus

| Menu | Items |
| --- | --- |
| **File** | New starter card · New card… · Import image… · Open from disk… (Chromium) · Save · Save as… · Export image · Read from an SD card… · Write to an SD card… |
| **Card** | Open on the bench · Run in emulator (Insert) · Eject · Check card · Keep a copy now · Restore a copy… · Duplicate · Rename… · Delete… |
| **Files** | Upload… · Upload a folder… · Download · Download as .zip · Extract to a folder… (Chromium) · View · Rename… · Attributes… · Copy to… · Move to… · Delete… · Text conversion ▸ |
| **Machine** | Run / Pause · Reset · Power cycle · Display ▸ · Columns ▸ |
| **View** | Sidebar · Front panel · Serial console · Theme ▸ (light, dark, system) |
| **Help** | Keys · The SD card round trip · The card format · Build details |

## 5. Technology

### The stack

| Part | Choice |
| --- | --- |
| Components | shadcn/ui, added by its CLI (`shadcn`, 4.x) into `src/components/ui/`, where they become our code |
| Framework | React 19, which shadcn/ui is built for |
| Styling | Tailwind CSS 4, through `@tailwindcss/vite`, configured in CSS |
| Build | Vite 8 with `@vitejs/plugin-react` |
| Routing | `wouter` with its hash location: small, and enough for five pages |
| Tables | TanStack Table, as shadcn/ui's data table uses |
| Toasts, icons | `sonner` and `lucide-react`, shadcn/ui's defaults |
| Language | TypeScript for the application, with the emulator's `.mjs` modules imported as they are (open question 1) |

Every package is pinned exactly in this repository's new `package.json`, at a
release at least two weeks old when stage 1 starts, with a lockfile.

### Theming

One file, `src/app.css`, holds the theme: shadcn/ui's tokens (`--background`,
`--foreground`, `--primary`, `--muted`, `--accent`, `--destructive`,
`--border`, `--ring`, the sidebar's and the charts' tokens) as CSS variables
for the light and dark themes, mapped into Tailwind with `@theme inline`. Every
component takes its colour, radius and type from those tokens, so the style
changes in one place. The machine's own displays (the PICO9918's palette, the
LCD's green, the LEDs) are drawn in their hardware colours and don't follow
the theme.

### How the emulator mounts in React

The emulator stays imperative, a set of plain modules; React gives it a place
on the page and reads its state.

```text
 src/machine/            plain modules, no React
   machine.mjs           lifecycle (power on, reset, eject, insert), run loop
   keys.mjs              the one keyboard, the phone keyboard   (today's)
   tms.mjs lcd.mjs ...   screens drawn into canvases            (today's)
   guest-cache.mjs       TEC-OS's pending blocks                (today's)
   persistence.mjs       the save protocol                      (today's)
 src/cards/              the card library: IndexedDB records, file handles
 src/app/                React: the shell, the pages, shadcn/ui components
```

- **One machine for the application.** `machine.mjs` owns the TEC-1G, the
  card in it and the run loop, as `main.mjs` does today, and lives as long as
  the page. It is not React state, so a re-render never touches the CPU.
- **State into React by subscription.** The machine module offers
  `subscribe` and `getSnapshot` (running or paused, the card, MHz, live
  drives, pending blocks); components read it with `useSyncExternalStore`.
  The snapshot changes a few times a second, not every frame.
- **Screens by attachment.** The Emulator page renders the canvases and the
  serial pane and, in an effect, calls `machine.attach({ tms, lcd, glcd,
  leds, digits, serial })` with their elements; on leaving it calls
  `detach()`. The frame loop draws into whatever is attached, by
  `requestAnimationFrame`, outside React's rendering.
- **Keys by attachment.** `attach` installs the one-keyboard handler on the
  document, with the Emulator page's element as the machine's surface;
  `detach` removes it, so the other pages have ordinary keys.
- **Cards by context.** The card library is one module; a React context gives
  the pages its list and its operations. Persistence saves the card in the
  machine as today, into that card's library record.

### Building and publishing

- `vite build` writes `dist/`: `index.html`, hashed scripts and CSS under
  `assets/`, the ROM and starter files fetched when the emulator first needs
  them. The Cards page loads without the emulator; the emulator's code loads
  when it is first opened.
- That publishes several files to `gh-pages` where today there is one
  standalone `index.html`. `build-info.json` stays, listing every file with
  its bytes and SHA-256; `tbg-preview/`, `LICENSE.txt` and `.nojekyll` stay.
  This changes John's rule that only `index.html` and `build-info.json`
  change on `gh-pages` (open question 2). The other way, one standalone
  `index.html` built with `vite-plugin-singlefile`, loads everything up front
  and gives up the split.
- Today's `tools/page.mjs`, which writes the standalone page, becomes the
  publish step's file list and `build-info.json`.

### Load time

The split above keeps the first page small: the shell and the Cards page,
then the emulator, its runtime and the ROM on first use, then cached. Large
dependencies that only one page uses (TanStack Table, the hex view) load with
that page.

### Tests and memory

- The strict runs stay: one fresh process per file, under `mem-guard` at
  1024 MB, two complete runs at the final head before `main`, and `test/tbg`.
- Browser tests serve the built `dist/` as today and find controls by id or
  by ARIA role and name, which shadcn/ui's Radix components give properly.
  Today 22 of the page's ids carry tests (`#tms` in 16 files, `#serial` in 10,
  `#glcd` in 7). The Emulator page keeps its ids, so most emulator tests carry
  over with a navigation step first; the card section's tests are rewritten
  in stage 1.
- Each browser test file launches one Chromium in three processes, about
  350 MB for today's page. React and the components add renderer memory, not
  processes; each stage measures its peaks against today's 768 to 812 MB.
- Logic (the card library, compose operations, the zip writer) is tested in
  Node with no browser, which is fast and light.

## 6. Migration in stages

Each stage ships alone: a branch, two complete strict runs and `test/tbg` at
its final head, a fast-forward of `main`, one publish. The live demo keeps
working throughout; until stage 1 ships it is today's page.

| Stage | What ships | Depends on |
| --- | --- | --- |
| 0 | This design approved, with the open questions answered | John |
| 1 | The application: the shell, Cards, Card with Files and Volumes, Emulator, Help, the phone layout. The emulator at parity with today; one card in the library at a time beyond the starter is enough. Eject and Insert replace Copy file. Files: several at once, upload with folders and drag and drop, `.zip`, delete, rename, attributes, copy and move, view. Volumes: read, and Check card | the stack set up; TEC-OS `rename`, `setAttributes`, `verifyContainer` (composed versions first) |
| 2 | The full card library: many cards, duplicate, rename, delete, export, kept copies and restore, storage and persistence | |
| 3 | Files on disk in Chromium: open and save the same file, handles kept, permission asked again; extract to and add from a folder; every fallback named | |
| 4 | Card structure: relabel, read-only, mounts and drives, new card from a recipe or by hand, add and remove volumes, change geometry | TEC-OS `editVolume`, `rebuildContainer` |
| 5 | The SD card page and `tools/tecvol.mjs read` and `install`; editing text in the browser, if it is in scope | TEC-OS's device code in its library |

Stage 1 is the large one, because the application replaces the page. It can
be built behind today's page and published when it reaches parity, so the
live demo never shows half an application.

The books describe the Viewer, so the Books agent hears of each stage that
changes the interface before it is published.

## 7. Test plan

**In Node.** Every compose operation (rename, attributes, copy and move, the
zip writer, the card library's records, moving today's IndexedDB record into
the library) runs on the starter card and is checked with `parseContainer`,
`CpmVolume.verify` and a read back.

**In Chromium, one browser per file.**

- Navigation: every route renders, the sidebar and menu bar reach every page,
  the back button works, a reload keeps the page.
- Eject waits for 0 pending blocks; Force eject warns and loses them; Insert
  powers on; nothing on the Card page changes the card in the machine.
- Keys: on the Emulator page, keys reach the matrix with the screen focused
  and never with a menu, dialog or the sidebar focused; on the other pages
  the shortcuts work and nothing reaches the machine. Today's key tests (one
  keyboard, Ctrl letters, page keys, held keys) carry over.
- Files: several at once, `.zip` downloaded and unpacked, delete, copy and
  move between volumes and user areas, read-only refused, drag and drop and
  folder upload through Playwright's file chooser and drop events.
- The library: today's IndexedDB card appears as "Browser card" after the
  first load; duplicate, rename, delete, kept copies and restore.
- The phone layout at a phone's viewport, the touch keys included.

**File System Access.** Chromium's pickers need a person's click, so tests
put stand-ins for `showOpenFilePicker`, `showSaveFilePicker` and
`showDirectoryPicker` into the page, backed by the origin private file
system, which is real storage; then reload and check that the handle comes
back and asks for permission. A second set deletes the pickers first and
checks each fallback.

**Other browsers.** Playwright's Firefox and WebKit aren't installed here
(open question 6).

**`tecvol read` and `install`.** Against a file standing in for the device, a
32 MiB file with a card at block 0: exactly the container's length copied;
no `TECOSVOL`, refused; a device smaller than the container, refused;
`install` without `--yes`, refused. No test touches a real device.

## 8. What the design needs from TEC-OS

As functions in `tools/lib/`, so the application and `tecvol` stay one
format:

1. `CpmVolume.rename(name, newName, { user })` and
   `CpmVolume.setAttributes(name, { readOnly, system }, { user })`, in the
   directory alone. Stage 1.
2. `verifyContainer(image)`: `tecvol verify`'s checks as a list of problems.
   Stage 1.
3. `editVolume(image, index, { label, readOnly, mount })` and setting the 1.1
   drives field, each putting the checksum and table sum right. Stage 4.
4. `rebuildContainer(image, plan)`: a new container from the old one's
   volumes, reordered, added to or removed from, payloads copied. Stage 4.
5. `tecvol install`'s device code in the library, with a reader beside it.
   Stage 5.
6. A question: can the page ask TEC-OS to write its pending blocks now, so
   that Eject need not wait for the next OS call?

## Open questions for John

1. **TypeScript or JavaScript** for the application? shadcn/ui and its
   examples are TypeScript first; the emulator's modules stay `.mjs` either
   way. I propose TypeScript.
2. **`gh-pages` as several files**: `index.html`, `assets/`, the ROM and
   starter files, with `build-info.json` listing them all, so the emulator
   loads only when opened. It changes the rule that only `index.html` and
   `build-info.json` change there. Or one standalone `index.html`, everything
   loaded at once?
3. **The machine away from its page**: paused while you are on another page,
   as proposed, or running on?
4. **Kept copies**: how many per card by default, at 14 MiB each?
5. **Editing text in the browser**: in scope? It is in stage 5 here.
6. **Firefox and WebKit**: install Playwright's builds for a smoke run of the
   fallbacks, or test those by hand?
7. **The landing page**: the live demo's address opens the Cards page, as
   proposed, or the Emulator with the starter card, as today?
8. **The tool's name**: `tecvol` here and `tecvol` in TEC-OS, with different
   commands, or another name for this repository's, such as `tecvol-device`?
