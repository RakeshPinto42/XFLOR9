# Design review: November 2026

A walkthrough of every page as a visitor (desktop 1440×900 and phone 390×844, production build),
looking at what reads as generic "AI-generated UI" and what can move into the 3D world.

**Principle going forward:** the world *is* the interface. Choosing a module, a programme, a tape or a
game happens on objects in the 3D scene. Flat panels are kept only where text must be read
(the book reader, long station lists) or for accessibility, and they look like objects from the
world (a printed TV guide, a shop's price list), not floating glass cards.

## What was wrong

| # | Where | Problem | Status |
|---|---|---|---|
| 1 | Home | The front door was flat CSS drawings (a cartoon TV, five clip-art devices on a shelf) and five identical "Tuning in now" badges. The project's best work, the 3D monsoon street, was hidden at `/lab/monsoon`. | **Fixed**: the homepage is now Monsoon Lane in 3D, with a hand-painted signboard per module (see below). |
| 2 | All 3D pages | The beige header bar sat on top of night scenes like a website template. | **Fixed**: dark, see-through header over 3D scenes. |
| 3 | All 3D pages, phone | The "Scene quality" box (4 buttons + a sentence) covered the bottom of the page on every visit. | **Fixed**: folded into one small button showing the current mode. |
| 4 | TV, Music | A large navy glass panel covers half of the 3D room; the room is only wallpaper behind a list. | Next (see plan). |
| 5 | Radio | A flat illustrated radio and a long filter form. Good functionality, no world. | Plan. |
| 6 | Reading Room | Flat coloured rectangles as covers, a form-like layout. | Plan. |
| 7 | Games | A dark card with a grid; nothing of the place it belongs to. | Plan (cheapest big win). |
| 8 | Phone nav | The module links wrap to two rows ("Reading Room" alone on the second). | Plan: short labels or a bottom bar on phones. |
| 9 | Intro | A flat CSS "CRT" with the logo. | Plan: the living-room TV switches on, camera pulls back through the window into the lane. |
| 10 | Lite/Still home | The home poster is the old monsoon image, without the signboards. | Plan: render a new poster with `npm run stage:poster`. |

## The new homepage (built)

- The shared stage draws `src/scenes/home/HomeStreet.tsx` at `/`: the monsoon scene file with a held,
  gently swaying shot down the lane instead of the cinematic tour; phones step back and widen to fit.
- Five signboards on wooden posts (Radio, TV, Music, Games, and a Reading Room banner across the
  end of the lane), painted on a 2D canvas used as a texture, lit by a bare bulb, rained on.
- Pointing at a sign (or its name in the list) lights it up and the camera leans towards it; choosing
  it walks the camera up to the board before the page changes (skipped with reduced motion).
- Accessibility: the canvas never takes clicks. The list of links at the bottom is the real
  navigation (keyboard, screen readers, Lite/Still, no WebGL). Pointer targets are laid exactly
  over each sign using the same projection the TV uses to place its player on the glass.

## Redesign plan, in order

1. **Games: a handheld in the corner shop.** The game draws onto a 2D canvas that becomes the
   texture of a 3D handheld console on the shop counter (our own games have no cross-origin limits).
   Controls: keyboard, plus 3D D-pad and buttons on the console (pointer targets as on the home
   signs). Fullscreen leaves the 3D for a plain screen.
2. **Music: pick tapes off the shelf.** Cassettes on the shelf are the tape list; pointing lifts a
   tape out, choosing slides it into the deck (old records) or plays it on the shop TV (YouTube).
   The current panel becomes a small printed price list, folded by default.
3. **TV: a remote and a printed TV guide.** Channels on the set's own buttons and a remote on the
   table; the programme list is a newspaper TV guide lying on the centre table (a 2D page laid on
   the 3D paper, readable and accessible).
4. **Reading Room: a 3D bookshelf.** Book spines on a wooden shelf in a small library; pulling one
   out shows its cover; opening it goes to the (2D) reader, which stays 2D: reading needs flat text.
5. **Radio: a transistor on a windowsill.** The radio as a 3D object with a turning dial and knobs;
   the station search stays a 2D drawer that slides out of the radio.
6. Intro, phone navigation and the Lite/Still poster as listed above.

## What not to add now

No AI features, chat assistants or Python services. Nothing in the product needs them yet, and they
would pull focus from finishing the world. Revisit once the five places are done.
