# PRD: Camera Language Library

Date: 2026-04-23
Status: Draft for implementation
Product: Laniameda Image Stitch (`image-stitch`)
Area: New `Camera` / `Prompt Library` mode

## 1. Problem

AI video creators need exact filmmaking language. Prompts like "cinematic camera movement" waste generations because video models respond better to specific camera terms: dolly in, rack focus, crane up, whip pan, POV, and so on.

Right now this vocabulary lives in videos, notes, and one-off chat answers. Michael needs a fast in-app reference:

1. Browse camera terms by category.
2. Understand what each term does emotionally and visually.
3. Click once to copy a ready-to-use description for Seedance, Kling, Runway, Higgsfield, or similar models.

## 2. Vision

Build a lightweight camera-language database inside `image-stitch`.

The tool should feel like a prompt operator panel, not an article. The user opens it, filters by creative intent, clicks a term, copies the description, and pastes it into an AI video model.

Primary product promise:

> Pick the shot language by what you want the viewer to feel.

## 3. Target Users

1. AI video creators
   - Job: "I know the shot I want, but I need the correct film term and prompt wording."

2. AI image creators moving into video
   - Job: "Help me translate a still image into a controllable video move."

3. Creative directors / storyboarders
   - Job: "Quickly assemble shot language for a scene without rewriting camera descriptions from scratch."

## 4. Scope

### P0 In Scope

1. New Camera Language Library mode
   - Add a new top-level app mode or panel: `Camera`.
   - Show a searchable, filterable table/card grid of camera terms.

2. Seed camera database
   - Include the first 30 camera movement terms from the Yannis Ashay video extraction.
   - Store data as a typed local catalog first, not a remote backend.

3. One-click copy
   - Each term has a copy button.
   - Copy the ready description, not only the term name.
   - Show copied state per item.

4. Useful navigation
   - Search by term, alias, category, emotion, use case.
   - Filter by category: Push/Pull, Orbit, Vertical, Lateral, Lens/Focus, Creative.
   - Filter by intent: intimacy, tension, reveal, scale, immersion, chaos, action, dialogue, transition.

5. Detail view
   - Clicking a term opens a detail panel or expanded row.
   - Detail includes: definition, when to use, emotional effect, ready prompt phrase, model notes.

### P1 In Scope

1. Prompt builder
   - Let user combine camera term + subject + action + environment + physics.
   - Generate a full video prompt from selected blocks.

2. Favorites / recents
   - Save favorite camera terms locally.
   - Track recently copied terms in local storage.

3. Shot stack
   - Allow selecting multiple terms into a sequence list.
   - Export as a mini shot plan.

4. Model-specific variants
   - Seedance version.
   - Kling version.
   - Runway version.
   - Generic version.

### Out of Scope for V1

1. User accounts.
2. Cloud database.
3. AI-generated explanations.
4. Video previews for every term.
5. Full storyboard management.

## 5. Product Requirements

### FR1. Camera Catalog

Each camera term must have:

| Field | Type | Required | Notes |
|---|---:|---:|---|
| `id` | string | yes | Stable slug, e.g. `slow-dolly-in` |
| `name` | string | yes | Human display name |
| `aliases` | string[] | no | Example: `["rush"]` |
| `category` | enum | yes | `push_pull`, `orbit`, `vertical`, `lateral`, `lens_focus`, `creative` |
| `intentTags` | string[] | yes | Search/filter tags |
| `definition` | string | yes | Plain explanation |
| `emotionalEffect` | string | yes | What it makes the viewer feel |
| `bestFor` | string[] | yes | Practical use cases |
| `copyPrompt` | string | yes | One-click copy text |
| `modelNotes` | string | no | Notes for AI video tools |
| `risk` | string | no | When not to use / common failure |

### FR2. Table / Grid View

Default layout:

| Column | Behavior |
|---|---|
| Term | Name + aliases |
| Category | Visual category chip |
| Intent | 2-4 tags |
| Best for | Short use case |
| Copy | Icon button |

Requirements:

1. Table must be scan-friendly.
2. Rows must not jump when copy state changes.
3. Search input must filter instantly.
4. Category filters must be visible without opening a modal.
5. Copy button must be reachable by keyboard.

### FR3. Detail Panel

When a user clicks a term:

1. Show the full definition.
2. Show "Use when..." guidance.
3. Show "Avoid when..." if risk exists.
4. Show copy-ready prompt phrase in a monospace block.
5. Include one button: `Copy description`.

### FR4. Copy Behavior

Default copied text:

```text
Camera movement: [name].
[copyPrompt]
Use for: [bestFor joined].
Emotional effect: [emotionalEffect].
```

Example:

```text
Camera movement: Slow dolly in.
Slow dolly in toward the subject's face, gradually reducing distance while keeping the face centered and stable.
Use for: realization, intimacy, important story beat.
Emotional effect: draws the viewer closer and signals that this moment matters.
```

### FR5. Empty and Error States

1. Empty search result should say: `No camera terms match this filter.`
2. Clipboard failure should expose fallback: select text manually.
3. Missing catalog data should fail visibly in development.

## 6. Seed Database

Initial rows:

| Category | Term | Aliases | Intent tags | Ready copy phrase |
|---|---|---|---|---|
| Push/Pull | Slow dolly in | Push in | intimacy, realization, tension | Slow dolly in toward the subject's face, gradually reducing distance while keeping the face centered and stable. |
| Push/Pull | Fast dolly in | Rush | shock, urgency, action | Fast dolly in toward the subject, creating a sudden rush of urgency and impact. |
| Push/Pull | Slow dolly out | Pull back | isolation, reveal, distance | Slow dolly out from the subject, revealing the surrounding space and increasing emotional distance. |
| Push/Pull | Dolly zoom | Vertigo effect | realization, unease, tension | Dolly zoom: the camera physically moves backward while the lens zooms in, making the background stretch around the subject. |
| Push/Pull | Extreme macro zoom | Macro push | obsession, texture, intimacy | Extreme macro zoom into microscopic subject detail, revealing pores, texture, surface imperfections, and tiny movement. |
| Orbit | 180 orbit | Half orbit | reveal, showcase, introduction | Camera orbits 180 degrees around the subject in a smooth half-circle, revealing form, costume, and environment. |
| Orbit | 360 orbit | Full orbit | hero, transformation, power | Fast 360-degree orbit around the subject, creating a power-up or hero reveal feeling. |
| Orbit | Slow cinematic arc | Wide arc | beauty, contemplation, profile | Slow cinematic arc around the subject, gently revealing the profile and surrounding atmosphere. |
| Orbit | Dutch orbit | Tilted orbit | instability, violence, psychological tension | Dutch orbit around the subject with the camera tilted on its axis, creating a feeling that something is wrong. |
| Vertical | Crane up | High-angle reveal | scale, opening, establishment | Crane up vertically from the subject to reveal the larger landscape and scale of the scene. |
| Vertical | Crane down | Descent | arrival, entrance, epic | Crane down toward the subject, descending into the scene like an epic entrance. |
| Vertical | Pedestal up | Rise | revelation, power shift, standing | Pedestal up from waist level to eye level, lifting with the subject to suggest revelation or power shift. |
| Vertical | Pedestal down | Lower | defeat, collapse, vulnerability | Pedestal down from eye level toward the ground, making the subject feel smaller or defeated. |
| Vertical | Tilt up | Upward tilt | presence, power, character reveal | Tilt up from the subject's feet to their face, revealing presence and scale. |
| Lateral | Lateral track left/right | Side slide | space, elegance, reveal | Lateral tracking shot moving left or right across the scene, revealing environment and spatial relationships. |
| Lateral | Side tracking | Parallel tracking | companionship, movement, profile | Side tracking shot moving parallel with the walking subject at the same speed, showing their profile. |
| Lateral | Leading shot | Backward tracking | emotion, approach, face | Backward tracking shot as the subject walks toward the camera, keeping their face readable while the camera retreats. |
| Lateral | Following shot | Tracking from behind | immersion, journey, POV-adjacent | Following tracking shot from behind the subject, moving into the world with them. |
| Lens/Focus | Smooth optical zoom in | Lens zoom in | tension, attention, compression | Smooth optical zoom in toward the subject while the camera body remains still. |
| Lens/Focus | Smooth optical zoom out | Lens pull out | distance, disconnection, reveal | Smooth optical zoom out from the subject, widening the frame without moving the camera body. |
| Lens/Focus | Snap zoom | Crash zoom | emphasis, comedy, sudden drama | Snap zoom rapidly into the subject, creating a sudden dramatic or comedic emphasis. |
| Lens/Focus | Reveal from blur | Focus reveal | awakening, clarity, memory | Shot begins completely blurred, then slowly sharpens into clear focus. |
| Lens/Focus | Rack focus | Focus pull | attention, discovery, relationship | Rack focus from the subject to the background, or from background to subject, shifting viewer attention without cutting. |
| Creative | Drone flyover | Aerial flyover | scale, world, opening | Drone flyover above the landscape, city, desert, or battlefield, establishing a large environment. |
| Creative | Over the shoulder | OTS | dialogue, confrontation, connection | Over-the-shoulder shot from behind one character toward another, creating proximity and tension. |
| Creative | Handheld dynamic | Handheld | raw, action, realism | Handheld dynamic camera with natural human shake and small imperfect movement. |
| Creative | Whip pan | Swish pan | transition, energy, reveal | Whip pan violently to the side with strong motion blur, creating a fast transition or sudden reveal. |
| Creative | Barrel shot | Roll shot | chaos, disorientation, instability | Barrel roll shot with the camera rotating on its axis, making the world feel unstable. |
| Creative | POV | First-person | immersion, embodiment, connection | POV shot from the character's eyes, making the viewer experience the scene as the subject. |
| Creative | Bullet time | Matrix effect | impact, action, frozen drama | Bullet time: time slows dramatically while the camera orbits around the subject during an action beat. |

## 7. Suggested Technical Design

### Files

Recommended implementation files:

1. `types.ts`
   - Add `CameraMove`, `CameraMoveCategory`, `CameraIntentTag`.

2. `utils/cameraLanguage.ts`
   - Export typed seed catalog.
   - Export filtering helpers.
   - Export `formatCameraMoveForCopy(move)`.

3. `views/CameraLanguageView.tsx`
   - New view for search, filters, table/grid, detail panel.

4. `App.tsx`
   - Add app mode navigation entry.

5. `utils/cameraLanguage.test.ts`
   - Validate unique IDs.
   - Validate required copy fields.
   - Validate filter behavior.
   - Validate copy formatting.

### Type Draft

```ts
export type CameraMoveCategory =
  | 'push_pull'
  | 'orbit'
  | 'vertical'
  | 'lateral'
  | 'lens_focus'
  | 'creative';

export interface CameraMove {
  id: string;
  name: string;
  aliases?: string[];
  category: CameraMoveCategory;
  intentTags: string[];
  definition: string;
  emotionalEffect: string;
  bestFor: string[];
  copyPrompt: string;
  modelNotes?: string;
  risk?: string;
}
```

## 8. UX Notes

1. Use dense controls. This is a reference tool, not a landing page.
2. Use icon buttons for copy/favorite where possible.
3. Keep rows stable. Copy success should not resize the table.
4. Avoid long explanatory text on the main screen.
5. Show the copied prompt in the detail panel for trust.
6. Default sort should group by category, then by common usefulness.

## 9. Acceptance Criteria

P0 is done when:

1. User can open Camera Language Library from app navigation.
2. All 30 seed camera terms are visible.
3. User can search for `dolly`, `orbit`, `tension`, `POV`, `reveal`, `dialogue`.
4. User can filter by all 6 categories.
5. Clicking a row opens a detail panel.
6. Copy button copies the full ready description.
7. Clipboard success and failure states work.
8. Data catalog has tests for uniqueness and required fields.
9. Production build passes.

## 10. Implementation Tickets

### T1. Data Foundation

Create typed camera-language catalog in `utils/cameraLanguage.ts`.

Acceptance:

1. All 30 seed entries added.
2. IDs are stable slugs.
3. Copy formatter returns deterministic text.
4. Unit tests cover data validity.

### T2. Camera View UI

Create `views/CameraLanguageView.tsx`.

Acceptance:

1. Search input filters instantly.
2. Category chips filter results.
3. Results display as a scan-friendly table or compact cards.
4. Row click selects detail panel.

### T3. Copy Interaction

Add clipboard behavior.

Acceptance:

1. Copy button works from list row.
2. Copy button works from detail panel.
3. Per-item copied state appears for about 1.5 seconds.
4. Clipboard failure exposes fallback text.

### T4. App Integration

Add Camera mode to `App.tsx`.

Acceptance:

1. Navigation has a clear Camera entry.
2. Existing Stitch, Smart Stitch, Resize, Editor, and Colors modes still work.
3. No route/state regression.

### T5. Prompt Builder Spike

Add a small composer prototype after P0.

Acceptance:

1. User can choose one camera move.
2. User can add subject/action/environment fields.
3. App produces one full prompt block.
4. Output includes "one action per shot" warning.

## 11. Open Questions

1. Should this live as its own `Camera` mode or inside a broader `Prompt Studio` mode?
2. Should the first implementation use table rows, cards, or both with a toggle?
3. Should copy text be generic by default, or should we default to Seedance-style phrasing?
4. Should we add thumbnail/video examples later, or keep V1 text-only for speed?
5. Should camera language eventually sync with `laniameda.gallery` so saved prompts can reference terms?

## 12. Source Notes

Initial vocabulary comes from the extracted YouTube transcript:

`ALL Camera Movement Prompts in AI Filmmaking (30 Cinematic Moves)` by Yannis Ashay.

The app should not depend on that video. The seed catalog is our productized version of the useful terms.
