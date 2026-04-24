import { CameraMove, CameraMoveCategory } from '../types';

export interface CameraCategoryMeta {
  id: CameraMoveCategory;
  label: string;
  shortLabel: string;
  description: string;
}

export const CAMERA_CATEGORIES: CameraCategoryMeta[] = [
  {
    id: 'push_pull',
    label: 'Push / Pull',
    shortLabel: 'Push/Pull',
    description: 'Forward and backward moves that change proximity to the subject.',
  },
  {
    id: 'orbit',
    label: 'Orbit',
    shortLabel: 'Orbit',
    description: 'Circular motion around the subject to reveal form and context.',
  },
  {
    id: 'vertical',
    label: 'Vertical',
    shortLabel: 'Vertical',
    description: 'Rising, descending, and tilting to shift power and scale.',
  },
  {
    id: 'lateral',
    label: 'Lateral',
    shortLabel: 'Lateral',
    description: 'Sideways tracking and following for pace and journey.',
  },
  {
    id: 'lens_focus',
    label: 'Lens & Focus',
    shortLabel: 'Lens/Focus',
    description: 'Zooms and focus shifts that redirect attention without moving the body.',
  },
  {
    id: 'creative',
    label: 'Creative',
    shortLabel: 'Creative',
    description: 'Signature moves for style, chaos, immersion, and transition.',
  },
];

export const CAMERA_INTENT_TAGS: string[] = [
  'intimacy',
  'realization',
  'tension',
  'shock',
  'urgency',
  'action',
  'isolation',
  'reveal',
  'distance',
  'unease',
  'obsession',
  'texture',
  'showcase',
  'introduction',
  'hero',
  'transformation',
  'power',
  'beauty',
  'contemplation',
  'profile',
  'instability',
  'violence',
  'psychological tension',
  'scale',
  'opening',
  'establishment',
  'arrival',
  'entrance',
  'epic',
  'revelation',
  'power shift',
  'standing',
  'defeat',
  'collapse',
  'vulnerability',
  'presence',
  'character reveal',
  'space',
  'elegance',
  'companionship',
  'movement',
  'emotion',
  'approach',
  'face',
  'immersion',
  'journey',
  'POV-adjacent',
  'attention',
  'compression',
  'disconnection',
  'emphasis',
  'comedy',
  'sudden drama',
  'awakening',
  'clarity',
  'memory',
  'discovery',
  'relationship',
  'world',
  'dialogue',
  'confrontation',
  'connection',
  'raw',
  'realism',
  'transition',
  'energy',
  'chaos',
  'disorientation',
  'embodiment',
  'impact',
  'frozen drama',
];

export const CAMERA_MOVES: CameraMove[] = [
  // --- Push / Pull ---
  {
    id: 'slow-dolly-in',
    name: 'Slow dolly in',
    aliases: ['Push in'],
    category: 'push_pull',
    intentTags: ['intimacy', 'realization', 'tension'],
    definition:
      'Camera physically moves forward toward the subject at a controlled pace, compressing the space between lens and face.',
    emotionalEffect: 'Draws the viewer closer and signals that this moment matters.',
    bestFor: ['realization', 'intimacy', 'important story beat'],
    copyPrompt:
      "Slow dolly in toward the subject's face, gradually reducing distance while keeping the face centered and stable.",
    modelNotes: 'Keep subject framing steady; avoid introducing pan or tilt.',
    risk: 'Too fast and it reads as shock rather than realization.',
  },
  {
    id: 'fast-dolly-in',
    name: 'Fast dolly in',
    aliases: ['Rush'],
    category: 'push_pull',
    intentTags: ['shock', 'urgency', 'action'],
    definition:
      'Rapid forward push toward the subject, collapsing distance quickly with a clear sense of acceleration.',
    emotionalEffect: 'Delivers a jolt of urgency and impact.',
    bestFor: ['shock beats', 'chase or fight cut-ins', 'sudden realization'],
    copyPrompt:
      'Fast dolly in toward the subject, creating a sudden rush of urgency and impact.',
    modelNotes: 'Pair with a tight subject framing; let motion blur imply speed.',
  },
  {
    id: 'slow-dolly-out',
    name: 'Slow dolly out',
    aliases: ['Pull back'],
    category: 'push_pull',
    intentTags: ['isolation', 'reveal', 'distance'],
    definition:
      'Camera retreats from the subject at a measured pace, expanding the visible environment.',
    emotionalEffect: 'Creates emotional distance and a sense of aftermath.',
    bestFor: ['endings', 'isolation beats', 'environmental reveal'],
    copyPrompt:
      'Slow dolly out from the subject, revealing the surrounding space and increasing emotional distance.',
  },
  {
    id: 'dolly-zoom',
    name: 'Dolly zoom',
    aliases: ['Vertigo effect'],
    category: 'push_pull',
    intentTags: ['realization', 'unease', 'tension'],
    definition:
      'The camera physically tracks backward while the lens zooms in (or vice versa), keeping the subject the same size while the background warps.',
    emotionalEffect: 'Signals psychological shift, dread, or disorienting realization.',
    bestFor: ['horror realization', 'character breakdown', 'subjective dread'],
    copyPrompt:
      'Dolly zoom: the camera physically moves backward while the lens zooms in, making the background stretch around the subject.',
    modelNotes: 'Explicitly describe background warping to help the model lock the effect.',
    risk: 'Overuse reads as gimmick; reserve for a single strong beat.',
  },
  {
    id: 'extreme-macro-zoom',
    name: 'Extreme macro zoom',
    aliases: ['Macro push'],
    category: 'push_pull',
    intentTags: ['obsession', 'texture', 'intimacy'],
    definition:
      'Aggressive close push into microscopic detail of a subject or surface, revealing texture normally invisible.',
    emotionalEffect: 'Fixation, fascination, hyper-intimacy with matter.',
    bestFor: ['texture reveal', 'obsessive detail', 'transition to abstract'],
    copyPrompt:
      'Extreme macro zoom into microscopic subject detail, revealing pores, texture, surface imperfections, and tiny movement.',
  },

  // --- Orbit ---
  {
    id: 'orbit-180',
    name: '180 orbit',
    aliases: ['Half orbit'],
    category: 'orbit',
    intentTags: ['reveal', 'showcase', 'introduction'],
    definition: 'Camera arcs 180 degrees around the subject in a smooth half-circle.',
    emotionalEffect: 'Presents the subject as worth examining from multiple angles.',
    bestFor: ['character introduction', 'product reveal', 'costume showcase'],
    copyPrompt:
      'Camera orbits 180 degrees around the subject in a smooth half-circle, revealing form, costume, and environment.',
  },
  {
    id: 'orbit-360',
    name: '360 orbit',
    aliases: ['Full orbit'],
    category: 'orbit',
    intentTags: ['hero', 'transformation', 'power'],
    definition: 'Full circular orbit around the subject, often fast, completing a 360-degree path.',
    emotionalEffect: 'Hero moment, power-up, transformation.',
    bestFor: ['hero shot', 'power-up beat', 'suit-up montage'],
    copyPrompt:
      'Fast 360-degree orbit around the subject, creating a power-up or hero reveal feeling.',
  },
  {
    id: 'slow-cinematic-arc',
    name: 'Slow cinematic arc',
    aliases: ['Wide arc'],
    category: 'orbit',
    intentTags: ['beauty', 'contemplation', 'profile'],
    definition: 'Gentle, wide partial arc around the subject at a patient speed.',
    emotionalEffect: 'Contemplative, painterly, reverent.',
    bestFor: ['beauty beat', 'quiet character moment', 'portrait reveal'],
    copyPrompt:
      'Slow cinematic arc around the subject, gently revealing the profile and surrounding atmosphere.',
  },
  {
    id: 'dutch-orbit',
    name: 'Dutch orbit',
    aliases: ['Tilted orbit'],
    category: 'orbit',
    intentTags: ['instability', 'violence', 'psychological tension'],
    definition: 'Circular orbit executed with the camera canted off its horizontal axis.',
    emotionalEffect: 'Wrongness, imbalance, threat.',
    bestFor: ['villain intro', 'descent into madness', 'fight chaos'],
    copyPrompt:
      'Dutch orbit around the subject with the camera tilted on its axis, creating a feeling that something is wrong.',
    risk: 'Outside of tension scenes it reads as a mistake.',
  },

  // --- Vertical ---
  {
    id: 'crane-up',
    name: 'Crane up',
    aliases: ['High-angle reveal'],
    category: 'vertical',
    intentTags: ['scale', 'opening', 'establishment'],
    definition: 'Camera lifts vertically away from the subject, moving toward a high vantage.',
    emotionalEffect: 'Opens the world, signals scale, ends a scene.',
    bestFor: ['scene openings', 'scale reveal', 'closing shot'],
    copyPrompt:
      'Crane up vertically from the subject to reveal the larger landscape and scale of the scene.',
  },
  {
    id: 'crane-down',
    name: 'Crane down',
    aliases: ['Descent'],
    category: 'vertical',
    intentTags: ['arrival', 'entrance', 'epic'],
    definition: 'Camera descends from a high position down toward the subject.',
    emotionalEffect: 'Grand entrance, arrival, descent into a world.',
    bestFor: ['hero entrance', 'location drop-in', 'epic opener'],
    copyPrompt:
      'Crane down toward the subject, descending into the scene like an epic entrance.',
  },
  {
    id: 'pedestal-up',
    name: 'Pedestal up',
    aliases: ['Rise'],
    category: 'vertical',
    intentTags: ['revelation', 'power shift', 'standing'],
    definition: 'Camera body rises vertically while framing stays locked on the subject.',
    emotionalEffect: 'Rising agency, revelation, emergence.',
    bestFor: ['character rising', 'power shift', 'reveal from seated to standing'],
    copyPrompt:
      'Pedestal up from waist level to eye level, lifting with the subject to suggest revelation or power shift.',
  },
  {
    id: 'pedestal-down',
    name: 'Pedestal down',
    aliases: ['Lower'],
    category: 'vertical',
    intentTags: ['defeat', 'collapse', 'vulnerability'],
    definition: 'Camera body descends vertically while holding the subject in frame.',
    emotionalEffect: 'Loss of stature, defeat, vulnerability.',
    bestFor: ['collapse beat', 'grief moment', 'defeat'],
    copyPrompt:
      'Pedestal down from eye level toward the ground, making the subject feel smaller or defeated.',
  },
  {
    id: 'tilt-up',
    name: 'Tilt up',
    aliases: ['Upward tilt'],
    category: 'vertical',
    intentTags: ['presence', 'power', 'character reveal'],
    definition: "Camera rotates upward on its horizontal axis, sweeping from the subject's feet to their face.",
    emotionalEffect: 'Builds presence and stature as the face arrives.',
    bestFor: ['character reveal', 'costume beat', 'power introduction'],
    copyPrompt:
      "Tilt up from the subject's feet to their face, revealing presence and scale.",
  },

  // --- Lateral ---
  {
    id: 'lateral-track',
    name: 'Lateral track left/right',
    aliases: ['Side slide'],
    category: 'lateral',
    intentTags: ['space', 'elegance', 'reveal'],
    definition: 'Smooth sideways movement across the scene, perpendicular to the line of sight.',
    emotionalEffect: 'Elegance, observation, spatial clarity.',
    bestFor: ['environment reveal', 'showing relationships between subjects', 'elegant transition'],
    copyPrompt:
      'Lateral tracking shot moving left or right across the scene, revealing environment and spatial relationships.',
  },
  {
    id: 'side-tracking',
    name: 'Side tracking',
    aliases: ['Parallel tracking'],
    category: 'lateral',
    intentTags: ['companionship', 'movement', 'profile'],
    definition: 'Camera moves parallel to a traveling subject at the same speed, holding their profile.',
    emotionalEffect: 'Companionship, shared momentum, character-in-motion.',
    bestFor: ['walking dialogue', 'journey shots', 'profile hero'],
    copyPrompt:
      'Side tracking shot moving parallel with the walking subject at the same speed, showing their profile.',
  },
  {
    id: 'leading-shot',
    name: 'Leading shot',
    aliases: ['Backward tracking'],
    category: 'lateral',
    intentTags: ['emotion', 'approach', 'face'],
    definition: 'Camera retreats in front of the subject as they walk forward, holding their face.',
    emotionalEffect: 'Emotional transparency during motion.',
    bestFor: ['walk-and-talk', 'arrival sequence', 'emotional approach'],
    copyPrompt:
      'Backward tracking shot as the subject walks toward the camera, keeping their face readable while the camera retreats.',
  },
  {
    id: 'following-shot',
    name: 'Following shot',
    aliases: ['Tracking from behind'],
    category: 'lateral',
    intentTags: ['immersion', 'journey', 'POV-adjacent'],
    definition: 'Camera follows the subject from behind, moving into the space with them.',
    emotionalEffect: 'Immersion, shared journey, anticipation.',
    bestFor: ['entering a new space', 'video-game feel', 'anticipation before reveal'],
    copyPrompt:
      'Following tracking shot from behind the subject, moving into the world with them.',
  },

  // --- Lens / Focus ---
  {
    id: 'optical-zoom-in',
    name: 'Smooth optical zoom in',
    aliases: ['Lens zoom in'],
    category: 'lens_focus',
    intentTags: ['tension', 'attention', 'compression'],
    definition: 'Lens focal length increases while the camera body remains still, compressing the background.',
    emotionalEffect: 'Building tension, sharpened focus, compressed space.',
    bestFor: ['tension ramp', 'narrative zoom-in', 'compressed reveal'],
    copyPrompt:
      'Smooth optical zoom in toward the subject while the camera body remains still.',
    modelNotes: 'Say "lens zoom" and "camera body remains still" to avoid a dolly interpretation.',
  },
  {
    id: 'optical-zoom-out',
    name: 'Smooth optical zoom out',
    aliases: ['Lens pull out'],
    category: 'lens_focus',
    intentTags: ['distance', 'disconnection', 'reveal'],
    definition: 'Lens focal length decreases while the camera body is stationary, widening the view.',
    emotionalEffect: 'Detachment, loneliness, widening scope.',
    bestFor: ['isolation beat', 'scope reveal', 'emotional disconnect'],
    copyPrompt:
      'Smooth optical zoom out from the subject, widening the frame without moving the camera body.',
  },
  {
    id: 'snap-zoom',
    name: 'Snap zoom',
    aliases: ['Crash zoom'],
    category: 'lens_focus',
    intentTags: ['emphasis', 'comedy', 'sudden drama'],
    definition: 'Very fast lens zoom into the subject, often a single quick burst.',
    emotionalEffect: 'Emphasis, comedic punch, sudden dramatic attention.',
    bestFor: ['comedy beat', 'reveal punctuation', 'documentary emphasis'],
    copyPrompt:
      'Snap zoom rapidly into the subject, creating a sudden dramatic or comedic emphasis.',
    risk: 'Overuse makes the piece feel amateur.',
  },
  {
    id: 'reveal-from-blur',
    name: 'Reveal from blur',
    aliases: ['Focus reveal'],
    category: 'lens_focus',
    intentTags: ['awakening', 'clarity', 'memory'],
    definition: 'Shot opens fully defocused and gradually sharpens into clarity.',
    emotionalEffect: 'Awakening, memory surfacing, sense returning.',
    bestFor: ['waking up beat', 'memory surfacing', 'opening of a flashback'],
    copyPrompt:
      'Shot begins completely blurred, then slowly sharpens into clear focus.',
  },
  {
    id: 'rack-focus',
    name: 'Rack focus',
    aliases: ['Focus pull'],
    category: 'lens_focus',
    intentTags: ['attention', 'discovery', 'relationship'],
    definition: 'Focus shifts from one plane of depth to another within a single take.',
    emotionalEffect: 'Redirects attention, reveals a hidden relationship in space.',
    bestFor: ['attention shift', 'two-subject relationship', 'in-scene reveal without a cut'],
    copyPrompt:
      'Rack focus from the subject to the background, or from background to subject, shifting viewer attention without cutting.',
  },

  // --- Creative ---
  {
    id: 'drone-flyover',
    name: 'Drone flyover',
    aliases: ['Aerial flyover'],
    category: 'creative',
    intentTags: ['scale', 'world', 'opening'],
    definition: 'High aerial movement over a large environment.',
    emotionalEffect: 'Scale, epic scope, world-establishing.',
    bestFor: ['opening shot', 'location reveal', 'epic establishing'],
    copyPrompt:
      'Drone flyover above the landscape, city, desert, or battlefield, establishing a large environment.',
  },
  {
    id: 'over-the-shoulder',
    name: 'Over the shoulder',
    aliases: ['OTS'],
    category: 'creative',
    intentTags: ['dialogue', 'confrontation', 'connection'],
    definition: "Camera frames one character from behind and over their shoulder, looking at another character.",
    emotionalEffect: 'Proximity, confrontation, relational tension.',
    bestFor: ['dialogue', 'confrontation', 'emotional exchange'],
    copyPrompt:
      'Over-the-shoulder shot from behind one character toward another, creating proximity and tension.',
  },
  {
    id: 'handheld-dynamic',
    name: 'Handheld dynamic',
    aliases: ['Handheld'],
    category: 'creative',
    intentTags: ['raw', 'action', 'realism'],
    definition: 'Camera moves with natural human imperfection and small continuous shake.',
    emotionalEffect: 'Immediacy, documentary realism, raw energy.',
    bestFor: ['action', 'documentary tone', 'emotional raw moment'],
    copyPrompt:
      'Handheld dynamic camera with natural human shake and small imperfect movement.',
  },
  {
    id: 'whip-pan',
    name: 'Whip pan',
    aliases: ['Swish pan'],
    category: 'creative',
    intentTags: ['transition', 'energy', 'reveal'],
    definition: 'Extremely fast horizontal pan that creates strong motion blur.',
    emotionalEffect: 'Kinetic energy, surprise, scene transition.',
    bestFor: ['scene transition', 'reveal punctuation', 'energy injection'],
    copyPrompt:
      'Whip pan violently to the side with strong motion blur, creating a fast transition or sudden reveal.',
  },
  {
    id: 'barrel-shot',
    name: 'Barrel shot',
    aliases: ['Roll shot'],
    category: 'creative',
    intentTags: ['chaos', 'disorientation', 'instability'],
    definition: 'Camera rotates along its lens axis, barrel rolling the frame.',
    emotionalEffect: 'Disorientation, chaos, broken reality.',
    bestFor: ['chaos beat', 'impact hit', 'surreal sequence'],
    copyPrompt:
      'Barrel roll shot with the camera rotating on its axis, making the world feel unstable.',
    risk: 'Can nauseate if used more than once per scene.',
  },
  {
    id: 'pov',
    name: 'POV',
    aliases: ['First-person'],
    category: 'creative',
    intentTags: ['immersion', 'embodiment', 'connection'],
    definition: "Camera assumes the subject's eyeline; the viewer becomes the character.",
    emotionalEffect: 'Full embodiment, subjective experience.',
    bestFor: ['horror', 'action immersion', 'character empathy'],
    copyPrompt:
      "POV shot from the character's eyes, making the viewer experience the scene as the subject.",
  },
  {
    id: 'bullet-time',
    name: 'Bullet time',
    aliases: ['Matrix effect'],
    category: 'creative',
    intentTags: ['impact', 'action', 'frozen drama'],
    definition: 'Time slows drastically while the camera orbits a frozen or slow-motion subject.',
    emotionalEffect: 'Frozen drama, action highlight, god-like observation.',
    bestFor: ['action peak', 'dodge beat', 'dramatic punctuation'],
    copyPrompt:
      'Bullet time: time slows dramatically while the camera orbits around the subject during an action beat.',
    risk: 'Heavy stylistic signature; one per sequence is usually enough.',
  },
];

export function formatCameraMoveForCopy(move: CameraMove): string {
  const bestFor = move.bestFor.join(', ');
  return [
    `Camera movement: ${move.name}.`,
    move.copyPrompt,
    `Use for: ${bestFor}.`,
    `Emotional effect: ${move.emotionalEffect}`,
  ].join('\n');
}

export interface CameraMoveFilter {
  query?: string;
  categories?: CameraMoveCategory[];
  intents?: string[];
}

export function filterCameraMoves(moves: CameraMove[], filter: CameraMoveFilter): CameraMove[] {
  const q = filter.query?.trim().toLowerCase() ?? '';
  const categories = filter.categories ?? [];
  const intents = filter.intents ?? [];

  return moves.filter((move) => {
    if (categories.length && !categories.includes(move.category)) return false;

    if (intents.length) {
      const hasIntent = intents.some((tag) => move.intentTags.includes(tag));
      if (!hasIntent) return false;
    }

    if (!q) return true;

    const haystack = [
      move.name,
      ...(move.aliases ?? []),
      move.category,
      move.definition,
      move.emotionalEffect,
      move.copyPrompt,
      ...move.bestFor,
      ...move.intentTags,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}

export function getCameraCategoryMeta(id: CameraMoveCategory): CameraCategoryMeta {
  const meta = CAMERA_CATEGORIES.find((c) => c.id === id);
  if (!meta) throw new Error(`Unknown camera category: ${id}`);
  return meta;
}

// --- Preview media resolution ---
//
// Preview assets live at /media/camera-moves/{id}.mp4 and {id}.jpg in the
// public folder. If a move ships an explicit previewVideoUrl/previewPoster
// we honor it. Otherwise we resolve by convention. Assets are optional:
// missing files fall back to the empty-preview slot in the UI.

export const CAMERA_MEDIA_ROOT = '/media/camera-moves';

export function getCameraPreviewVideoUrl(move: CameraMove): string {
  if (move.previewVideoUrl) return move.previewVideoUrl;
  return `${CAMERA_MEDIA_ROOT}/${move.id}.mp4`;
}

export function getCameraPreviewPosterUrl(move: CameraMove): string {
  if (move.previewPoster) return move.previewPoster;
  return `${CAMERA_MEDIA_ROOT}/${move.id}.jpg`;
}
