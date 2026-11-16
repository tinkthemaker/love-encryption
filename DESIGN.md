# Design philosophy

This document describes the look and feel of CIPHER. It covers the interface only. Crypto and security design live in `README.md` and `SECURITY.md`.

Line references (`style.css:42`) point at the code as of this writing. Where I'm inferring intent the code doesn't state, I say "my read".

## What it should feel like

A private note passed across a table. The screen is dark and quiet. One warm rose accent marks the thing to do next, and nothing else on the page asks for more attention than the message does. The app has one job: get a message to one specific person, B, with a passphrase that travels by a different route.

The tone is a little technical (monospace for secrets, uppercase labels, a version pill, a pixel-art lock in the header) and a little tender (rose accent, "Dedicated to B." in the footer, `index.html:99`). The stylesheet header says the accent "nods to the 'love' theme" (`style.css:21`). That's the only stated emotional intent in the code.

About *Given to Fly*: `README.md` says the app is "Inspired by Pearl Jam's *Given to Fly*" and nothing else. No lyric, color, motif or copy string in the UI refers to it. I won't pretend the look derives from the song. The emotional anchor the code does document is B.

## Principles

### 1. One next step, in one color

The accent `--accent` (`#ff5d8f`) is spent on the single primary action in each context: the active tab, the Encrypt/Decrypt button, the Copy button in the result modal, the focus ring. Everything else is neutral. A person sending something they care about shouldn't have to decide which button matters.

Evidence: `.tab-btn.active` (`style.css:529`), `.action-btn` (`style.css:549`), `.result-footer .btn.primary` (`style.css:764`), `:focus-visible` (`style.css:977`).

### 2. Hierarchy follows the real-world order of sharing

The result modal orders its actions Copy, Link, Share, QR (`index.html:116-119`). `IMPROVEMENTS.md` (T3.4) explains why: the armored text block works in any messenger and the link is a convenience. A QR code only helps when B is physically next to you. So QR is smaller, muted and labeled "QR (in person)" (`.qr-btn`, `style.css:835`). Visual weight should match how often a path is the right one.

### 3. Calm over spectacle

The background has a scrolling grid, two drifting glows, scanlines, noise and a vignette (`style.css:101-205`), but they're kept at low opacity and sit behind a single 480px column. Surfaces are flat and edged with hairline borders. Motion is short (0.15s and 0.25s tokens, `style.css:42-43`) and the global `prefers-reduced-motion` rule collapses animation and transition durations (`style.css:207`). My read: the atmosphere is there to make the app feel like a place, and it must never compete with reading or typing.

### 4. Make secrets legible and mistakes cheap

Passphrases and messages are set in `--font-mono` at 16px (`style.css:360`, `style.css:477`) so characters are unambiguous and iOS doesn't zoom on focus. The passphrase can be shown or hidden with a 44px toggle. Destructive "Clear All" asks twice, with a pulsing border on the second tap (`.btn-subtle.confirm`, `style.css:635`; `app.js:449-455`). Decrypted text is cleared from the DOM when the modal closes (`app.js:197-200`).

### 5. Phone first, thumb sized

`main` is `max-width: 480px` with a 16px gutter (`style.css:78-84`), and desktop gets the same column, centered. Touch targets are 40 to 52px tall (`.btn` 48, `.action-btn` 52, `.tab-btn` 44, `.btn-subtle` 40). Safe-area insets are honored at top and bottom (`style.css:33-34`, `style.css:68`). The app is installed to a home screen, so the manifest and meta tags set a black standalone chrome (`manifest.webmanifest`, `index.html:11-14`).

### 6. Speak like a person who knows B

Copy refers to "B" and "the passphrase you and B agreed on" rather than "the recipient" and "the key" (`app.js:490`, `index.html:46`). Errors say what to do next. See the voice section.

## Color

All tokens live in `:root` (`style.css:7-55`). Contrast ratios below are my own WCAG calculations against `--bg`.

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

Status colors are not tokens (see inconsistencies): weak `#ff8a5c`, medium `#ffd166`, strong and "copied" `#4ade9b`, error text `#ff8a9c`.

**Dark and light.** There is no light mode. The page declares `color-scheme: dark` (`style.css:54`) and has no `prefers-color-scheme` query, and manifest and `theme-color` are black. My read is that this is deliberate: the glow, scanline and vignette layers only work on a dark base. The one adaptive hook is `prefers-contrast: high`, which lifts `--border`, `--border-strong`, `--muted` and `--dim` (`style.css:1058`). The QR panel is deliberately white (`style.css:823`) because scanners need dark modules on a light field.

## Typography

| Role | Stack | Where |
|---|---|---|
| UI | `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, Helvetica, Arial, sans-serif` (`--font-ui`) | Everything by default |
| Mono | `'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Consolas', monospace` (`--font-mono`) | Inputs, textareas, version pill, char count, footer tech line |

No web fonts load, so the app is fully offline and renders in the platform's native face.

Scale is small and mostly uppercase with wide tracking. Body is 16px/1.6 (`style.css:71`). Labels, tabs, buttons and modal titles are 11 to 13px, weight 600 to 700, uppercase, letter-spacing 1 to 1.6px (`style.css:86-95`, `506-522`, `726-734`). The wordmark is 17px, weight 700, 3px tracking (`style.css:259`). Supporting sentences (`.settings-subtitle`, `.result-hint`, `.status`) are 13px sentence case with no tracking. Rule of thumb in the code: uppercase for controls and labels, sentence case for anything you read as a sentence.

## Layout and spacing

- One centered column, 480px max, 16px side padding (12px under 380px wide, `style.css:1011`).
- Vertical order: header, passphrase card, tab bar, message card, status line, footer.
- Cards use `--radius` 14px with 18px padding (22px in the modal). Controls use `--radius-sm` 10px. Pills and meters use `--radius-pill`.
- Gaps cluster around 10, 14, 16 and 18px. There's no formal spacing scale; values are chosen per component.
- Orientation media query for short wide screens trims header, card and textarea heights (`style.css:1035`).
- The modal is a full-viewport overlay with a blurred scrim, and `margin: auto` on the card keeps it centered when short and scrollable when tall (`style.css:708-714`).

## Components and interaction

**Buttons.** Four tiers, loudest first:

1. `.action-btn`: full-width rose fill, 52px. One per tab.
2. `.btn.primary`: rose fill inside the modal (Copy).
3. `.btn`: neutral surface with border (Link, Share, Generate).
4. `.btn-subtle`, `.btn-close`, `.qr-btn`: transparent, muted text, smaller. Used for utilities and exits.

**Tabs.** Segmented control in a bordered tray. Active tab takes the accent fill. Content fades in with an 8px rise over 0.3s (`style.css:535-547`).

**Result modal.** Title in muted caps ("Encrypted" or "Decrypted"), the content in a mono textarea that's auto-focused and pre-selected, a one-paragraph hint, then actions. The text is auto-copied on open, and the Copy button flips to "Copied" in green for two seconds (`app.js:155-164`, `style.css:776`). Escape closes it. Reply appears only after decrypting; Link and QR only after encrypting (`app.js:171-173`).

**Strength meter.** A four-notch bar plus a word, built entirely in CSS from `#strength::before` and `::after` (`style.css:406-466`). Weak fills a third and uses orange, Medium two thirds and yellow, Strong the whole bar and green. Color is never the only signal, because the word is always printed next to the bar. Empty passphrase shows nothing.

**Status line.** One `role="status"` paragraph under the form with a leading dot. Neutral by default, rose dot and pink text for errors (`style.css:875-907`). Hidden at opacity 0 when empty, so layout doesn't jump.

**Empty and idle states.** Placeholders carry the instruction ("Paste the encrypted message you received…"). The Enter-key hint appears only on hover or focus (`style.css:579-594`). The character counter is blank until there's text. Buttons show "Working…" with a spinner while PBKDF2 runs (`style.css:657-676`, `app.js:119`).

**Motion.** Background drift (25 to 30s loops), grid scroll (20s), tab fade, modal rise and scale, confirm pulse, spinner, and a brief horizontal glitch on wordmark hover (`style.css:962-971`). Under `prefers-reduced-motion: reduce`, all animation and transition durations drop to 0.01ms and loops run once.

**Focus.** A global 2px rose outline with 2px offset on `:focus-visible` (`style.css:977`). Inputs add a soft halo, and the message card shows a halo through `:focus-within`.

## Voice of the UI copy

Short second-person copy that's always specific about who B is. Examples from the code:

- Label hints: "The secret you and B will both type. Never text it with the message." (`index.html:46`)
- Missing input: "Type the passphrase you and B agreed on first" (`app.js:490`)
- Bad paste: "That doesn't look like a CIPHER message, check the BEGIN/END markers" (paraphrase of `app.js:536`, which joins the clauses with an em-dash)
- Wrong passphrase: "Couldn't decrypt, double-check the passphrase and try again" (paraphrase of `app.js:551`)
- Generate: "Fresh passphrase generated, share it with B on a call, then hide it" (paraphrase of `app.js:615`)

Errors name the fix and don't blame the person. Contractions are the norm. Button labels are single verbs (Copy, Link, Share, Reply, Close). Parenthetical qualifiers do the work of warnings: "QR (in person)".

## Guardrails for future changes

**Do**

- Use tokens. New neutrals come from the `--surface-*`, `--border*`, `--text`, `--muted`, `--dim` ramp. New accent uses come from `--accent*`.
- Keep exactly one rose-filled primary action per view or modal.
- Put text on an accent fill in `--on-accent`.
- Keep `--dim` for non-essential text only, and don't go darker than it on `--bg`.
- Set inputs and secrets in `--font-mono` at 16px or larger.
- Keep touch targets at 40px or taller, 44px for icon-only buttons.
- Wrap any new `@keyframes` or transition so the reduced-motion rule covers it. Don't add `!important` motion that overrides it.
- Put new sharing paths in the modal in order of how often they're the right choice, and style them to match.
- Write copy that names B and the next step. Sentence case for messages, uppercase only for labels and controls.
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

- **Hard-coded colors bypass tokens.** `#ff8a5c`, `#ffd166`, `#4ade9b` (`style.css:443-461`, `777-778`), error text `#ff8a9c` (`style.css:902`), second glow `#5c7bff` (`style.css:147`), QR caption `#0a0b0f` (`style.css:853`, equals `--on-accent`), and `var(--white, #ffffff)` (`style.css:823`), where `--white` is never defined. There are no `--success`, `--warning` or `--danger` tokens.
- **"Copied" feedback is only styled on the primary button.** The Link button gets a `copied` class (`app.js:291-292`) but the rule is `.result-footer .btn.primary.copied` (`style.css:776`), so Link only changes its label.
- **Two button systems.** `.action-btn` and `.btn` duplicate padding, type and transition rules with different sizes. `.share-btn` repeats what `.btn` already does (`style.css:782-792`).
- **Status copy mixes registers.** Progress and success messages are uppercase ("ENCRYPTING...", "DECRYPTION COMPLETE", `app.js:497-546`). Errors come in two voices: an "ERROR:" prefix, usually followed by raw `err.message` (`app.js:270`, `511`, `549`, `617`), or friendly sentence case. Apostrophes are mixed too: `app.js:536` uses a straight `'` and `app.js:551` a curly `’`. Several strings contain em-dashes (`app.js:166`, `319`, `340`, `504`, `536`, `544`, `551`, `615`).
- **Low-contrast boundaries.** `--border` on `--bg` is about 1.4:1, well under the 3:1 usually wanted for UI boundaries. Focus rings compensate, and `prefers-contrast: high` lifts borders, but default state relies on fill difference.
- **Small type.** About 16 declarations use 10 to 12px (footer tech line is 10px, hints and counters 11px). `.qr-btn` is documented in `IMPROVEMENTS.md` as 10px and is 11px in code.
- **Hint visibility on touch.** The Enter-key hint shows only on hover or focus-within (`style.css:591`), and it's keyboard-oriented text shown on phones.
- **Meter semantics.** `#strength` has `role="meter"` and `aria-valuetext` but no `aria-valuenow`, `aria-valuemin` or `aria-valuemax`, so some screen readers may skip it.
- **Brand mismatches.** Wordmark is a pixel-art lock (`index.html:31-37`) while the installed icons are hearts (`heart-192.png`, `heart-512.png`). Manifest and `theme-color` are `#000000`, but the page is `#0a0b0f`. The title is "CIPHER" in markup and the visible `h1` text is "Cipher" uppercased by CSS.
- **Doc drift.** `IMPROVEMENTS.md` says the share buttons were de-emphasized with a 10px, 32px QR button; the shipped `.qr-btn` is 11px with a 36px minimum height (`style.css:835-843`).
