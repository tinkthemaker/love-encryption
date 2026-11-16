# Design philosophy

This document describes the look and feel of CIPHER. It covers the interface only. Crypto and security design live in `README.md` and `SECURITY.md`.

Line references (`style.css:55`) point at the code as of this writing. Where I'm inferring intent the code doesn't state, I say "my read".

## What it should feel like

A private note passed across a table. The screen is dark and quiet. One warm rose accent marks the thing to do next, and nothing else on the page asks for more attention than the message does. The app has one job: get a message to one specific person, B, with a passphrase that travels by a different route.

The tone is a little technical (monospace for secrets, uppercase labels, a version pill, a pixel-art lock in the header) and a little tender (rose accent, "Dedicated to B." in the footer, `index.html:99`). The stylesheet header says the accent "nods to the 'love' theme" (`style.css:21`). That's the only stated emotional intent in the code.

About *Given to Fly*: `README.md` says the app is "Inspired by Pearl Jam's *Given to Fly*" and nothing else. No lyric, color, motif or copy string in the UI refers to it. I won't pretend the look derives from the song. The emotional anchor the code does document is B.

## Principles

### 1. One next step, in one color

The accent `--accent` (`#ff5d8f`) is spent on the single primary action in each context: the active tab, the Encrypt/Decrypt button, the Copy button in the result modal, the focus ring. Everything else is neutral. A person sending something they care about shouldn't have to decide which button matters.

Evidence: `.tab-btn.active` (`style.css:542`), `.action-btn` (`style.css:572`), `.result-footer .btn.primary` (`style.css:780`), `:focus-visible` (`style.css:970`).

### 2. Hierarchy follows the real-world order of sharing

The result modal orders its actions Copy, Link, Share, QR (`index.html:116-119`). `IMPROVEMENTS.md` (T3.4) explains why: the armored text block works in any messenger and the link is a convenience. A QR code only helps when B is physically next to you. So QR is smaller, muted and labeled "QR (in person)" (`.qr-btn`, `style.css:835`). Visual weight should match how often a path is the right one.

### 3. Calm over spectacle

The background has a scrolling grid, two drifting glows, scanlines, noise and a vignette (`style.css:114-218`), but they're kept at low opacity and sit behind a single 480px column. Surfaces are flat and edged with hairline borders. Motion is short (0.15s and 0.25s tokens, `style.css:55-56`) and the global `prefers-reduced-motion` rule collapses animation and transition durations (`style.css:220`). My read: the atmosphere is there to make the app feel like a place, and it must never compete with reading or typing.

### 4. Make secrets legible and mistakes cheap

Passphrases and messages are set in `--font-mono` at 16px (`style.css:373`, `style.css:490`) so characters are unambiguous and iOS doesn't zoom on focus. The passphrase can be shown or hidden with a 44px toggle. Destructive "Clear all" asks twice, with a pulsing border on the second tap (`.btn-subtle.confirm`, `style.css:651`; `app.js:457-466`). Decrypted text is cleared from the DOM when the modal closes (`app.js:197-200`).

### 5. Phone first, thumb sized

`main` is `max-width: 480px` with a 16px gutter (`style.css:91-97`), and desktop gets the same column, centered. Touch targets are 40 to 52px tall (`.btn` 48, `.action-btn` 52, `.tab-btn` 44, `.btn-subtle` 40). Safe-area insets are honored at top and bottom (`style.css:46-47`, `style.css:81`). The app is installed to a home screen, so the manifest and meta tags set a standalone chrome in the page's own `#0a0b0f` (`manifest.webmanifest`, `index.html:11-14`).

### 6. Speak like a person who knows B

Copy refers to "B" and "the passphrase you and B agreed on" rather than "the recipient" and "the key" (`app.js:498`, `index.html:46`). Errors say what to do next. See the voice section.

## Color

All tokens live in `:root` (`style.css:7-68`). Contrast ratios below are my own WCAG calculations against `--bg`.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0a0b0f` | Page background |
| `--surface-1` | `#101219` | Cards, tab bar |
| `--surface-2` | `#161922` | Inputs, default `.btn` |
| `--surface-3` | `#1e2230` | Hover fill, meter track, scrollbar |
| `--border` | `#262b39` | Default hairlines |
| `--border-strong` | `#39415a` | Hover and focus-within borders |
| `--text` | `#f3f5fa` | Primary text (18.0:1) |
| `--muted` | `#aab2c5` | Labels, secondary copy (9.3:1) |
| `--dim` | `#838ca3` | Placeholders, counters, footer (5.9:1) |
| `--accent` | `#ff5d8f` | Primary action, focus, active tab (6.8:1) |
| `--accent-hover` | `#ff7ba6` | Hover on accent fills |
| `--accent-press` | `#eb406f` | Active state, logo gradient end |
| `--accent-soft` | `rgba(255,93,143,0.16)` | Focus halos |
| `--accent-glow` | `rgba(255,93,143,0.35)` | Colored shadow on primary controls |
| `--on-accent` | `#0a0b0f` | Text on any accent fill (6.8:1) |
| `--success` | `#4ade9b` | Strong meter, "copied" fill |
| `--warning` | `#ffd166` | Medium meter |
| `--caution` | `#ff8a5c` | Weak meter |
| `--danger` | `#ff8a9c` | Error status text |
| `--glow-cool` | `#5c7bff` | Second backdrop glow |
| `--paper` | `#ffffff` | QR panel background |
| `--on-paper` | `#0a0b0f` | QR caption text |
| `--scrim` | `rgba(4,5,8,0.75)` | Modal overlay |
| `--on-accent-track` | `rgba(10,11,15,0.35)` | Spinner track on accent fills |

Status colors are tokens. `--caution` and `--warning` color the weak and medium meter, `--success` colors the strong meter and the "copied" fill, and `--danger` colors error text. Outside `:root`, literals remain only in the atmosphere layers (white and black rgba values, plus `#000` in the masks) and the `prefers-contrast: high` overrides.

**Dark and light.** There is no light mode. The page declares `color-scheme: dark` (`style.css:67`) and has no `prefers-color-scheme` query, and the manifest colors and `theme-color` match `--bg`. My read is that this is deliberate: the glow, scanline and vignette layers only work on a dark base. The one adaptive hook is `prefers-contrast: high`, which lifts `--border`, `--border-strong`, `--muted` and `--dim` (`style.css:1051`). The QR panel is deliberately white (`--paper`, `style.css:823`) because scanners need dark modules on a light field.

## Typography

| Role | Stack | Where |
|---|---|---|
| UI | `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, Helvetica, Arial, sans-serif` (`--font-ui`) | Everything by default |
| Mono | `'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Consolas', monospace` (`--font-mono`) | Inputs, textareas, version pill, char count, footer tech line |

No web fonts load, so the app is fully offline and renders in the platform's native face.

Scale is small and mostly uppercase with wide tracking. Body is 16px/1.6 (`style.css:84`). Labels, tabs, buttons and modal titles are 11 to 13px, weight 600 to 700, uppercase, letter-spacing 1 to 1.6px (`style.css:99-108`, `519-535`, `742-750`). The wordmark is 17px, weight 700, 3px tracking (`style.css:272`). Supporting sentences (`.settings-subtitle`, `.result-hint`, `.status`) are 13px sentence case with no tracking. Rule of thumb in the code: uppercase for controls and labels, sentence case for anything you read as a sentence.

## Layout and spacing

- One centered column, 480px max, 16px side padding (12px under 380px wide, `style.css:1004`).
- Vertical order: header, passphrase card, tab bar, message card, status line, footer.
- Cards use `--radius` 14px with 18px padding (22px in the modal). Controls use `--radius-sm` 10px. Pills and meters use `--radius-pill`.
- Gaps cluster around 10, 14, 16 and 18px. There's no formal spacing scale; values are chosen per component.
- Orientation media query for short wide screens trims header, card and textarea heights (`style.css:1028`).
- The modal is a full-viewport overlay with a blurred scrim, and `margin: auto` on the card keeps it centered when short and scrollable when tall (`style.css:724-730`).

## Components and interaction

**Buttons.** Four tiers, loudest first:

1. `.action-btn`: full-width rose fill, 52px. One per tab.
2. `.btn.primary`: rose fill inside the modal (Copy).
3. `.btn`: neutral surface with border (Link, Share, Generate).
4. `.btn-subtle`, `.btn-close`, `.qr-btn`: transparent, muted text, smaller. Used for utilities and exits.

`.btn` and `.action-btn` share one base rule (`style.css:562`), and the quiet tier shares another (`style.css:637`). Hover for every `.btn` variant comes from `.btn:hover` (`style.css:631`).

**Tabs.** Segmented control in a bordered tray. Active tab takes the accent fill. Content fades in with an 8px rise over 0.3s (`style.css:548-560`).

**Result modal.** Title in muted caps ("Encrypted" or "Decrypted"), the content in a mono textarea that's auto-focused and pre-selected, a one-paragraph hint, then actions. The text is auto-copied on open, and the Copy button flips to "Copied" in green for two seconds (`app.js:157-164`, `style.css:792`). The Link button gets the same treatment, because the rule matches any `.result-footer .btn.copied`. Escape closes it. Reply appears only after decrypting; Link and QR only after encrypting (`app.js:171-173`).

**Strength meter.** A four-notch bar plus a word, built entirely in CSS from `#strength::before` and `::after` (`style.css:419-479`). Weak fills a third and uses orange, Medium two thirds and yellow, Strong the whole bar and green. Color is never the only signal, because the word is always printed next to the bar. Empty passphrase shows nothing. For screen readers it exposes `aria-valuemin` 0, `aria-valuemax` 3, an `aria-valuenow` of 0 to 3 and the word as `aria-valuetext` (`app.js:402-440`).

**Status line.** One `role="status"` paragraph under the form with a leading dot. Neutral by default, rose dot and pink text for errors (`style.css:868-900`). Hidden at opacity 0 when empty, so layout doesn't jump.

**Empty and idle states.** Placeholders carry the instruction ("Paste the encrypted message you received…"). The Enter-key hint appears only on hover or focus, and touch-only devices never see it (`style.css:596-618`). The character counter is blank until there's text. Buttons show "Working…" with a spinner while PBKDF2 runs (`style.css:673-692`, `app.js:119`).

**Motion.** Background drift (25 to 30s loops), grid scroll (20s), tab fade, modal rise and scale, confirm pulse, spinner, and a brief horizontal glitch on wordmark hover (`style.css:955-964`). Under `prefers-reduced-motion: reduce`, all animation and transition durations drop to 0.01ms and loops run once.

**Focus.** A global 2px rose outline with 2px offset on `:focus-visible` (`style.css:970`). Inputs add a soft halo, and the message card shows a halo through `:focus-within`.

## Voice of the UI copy

Short second-person copy that's always specific about who B is. Examples from the code:

- Label hints: "The secret you and B will both type. Never text it with the message." (`index.html:46`)
- Missing input: "Type the passphrase you and B agreed on first" (`app.js:498`)
- Bad paste: "That doesn’t look like a CIPHER message. Check the BEGIN/END markers" (`app.js:545`)
- Wrong passphrase: "Couldn’t decrypt. Double-check the passphrase and try again" (`app.js:561`)
- Generate: "Fresh passphrase generated. Share it with B on a call, then hide it" (`app.js:625`)

Status lines use sentence case with curly apostrophes, and they skip em-dashes. Progress and results read "Encrypting…", "Encrypted", "Decrypting…" and "Decrypted". Errors name the fix and don't blame the person, and the raw error goes to `console.error`. The self-test is the exception, because it's a diagnostic and prints the raw detail. Contractions are the norm. Button labels are single verbs (Copy, Link, Share, Reply, Close). Parenthetical qualifiers do the work of warnings: "QR (in person)".

## Guardrails for future changes

**Do**

- Use tokens. New neutrals come from the `--surface-*`, `--border*`, `--text`, `--muted`, `--dim` ramp. New accent uses come from `--accent*`, and status colors come from `--success`, `--warning`, `--caution` and `--danger`.
- Keep exactly one rose-filled primary action per view or modal.
- Put text on an accent fill in `--on-accent`.
- Keep `--dim` for non-essential text only, and don't go darker than it on `--bg`.
- Set inputs and secrets in `--font-mono` at 16px or larger.
- Keep touch targets at 40px or taller, 44px for icon-only buttons.
- Wrap any new `@keyframes` or transition so the reduced-motion rule covers it. Don't add `!important` motion that overrides it.
- Put new sharing paths in the modal in order of how often they're the right choice, and style them to match.
- Write copy that names B and the next step. Sentence case for messages, uppercase only for labels and controls. Use curly apostrophes and skip em-dashes. Send raw error detail to `console.error`.
- Pair every color signal with a word or icon.
- Test at 360px wide and in the short-orientation media query.

**Don't**

- Add a second accent hue or a gradient fill on controls.
- Add web fonts or any network asset. The app has to work offline.
- Add a light theme piecemeal. If one is wanted, it's a project: tokens first, then rethink the background layers and the manifest colors.
- Put the passphrase and ciphertext on screen together without a reason, or pre-fill secrets into places that persist.
- Use `innerHTML` for anything but trusted static hint strings (`app.js:177` already does this for its own copy).
- Shrink body copy below 13px or add more 10 to 11px text.

## Known inconsistencies

These are design decisions that are left for the owner.

- **Low-contrast boundaries.** `--border` on `--bg` is about 1.4:1, well under the 3:1 usually wanted for UI boundaries. Focus rings compensate, and `prefers-contrast: high` lifts borders, but default state relies on fill difference.
- **Small type.** About 16 declarations use 10 to 12px (footer tech line is 10px, hints and counters 11px).
- **Brand mismatch.** The wordmark is a pixel-art lock (`index.html:31-37`) while the installed icons are hearts (`heart-192.png`, `heart-512.png`).
