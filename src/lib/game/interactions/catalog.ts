import {
  createChoiceBehavior,
  createCompoundBehavior,
  createMuseBehaviors,
  createToggleBehavior,
  createVesselNeedsHeatBehavior,
  type ChoiceSpec,
  type MuseSpec,
  type ToggleSpec,
} from "./behaviors";
import type { InteractionBehavior } from "./types";

const TOGGLES: readonly ToggleSpec[] = [
  {
    groupId: "bathtub",
    name: "Bathtub",
    offItemId: "furniture1-bathtub",
    onItemId: "furniture2-bathtub-full",
    offPrompt: "Draw a bath?",
    onPrompt: "Are you done with the bath?",
    startLabel: "Fill it up",
    stopLabel: "Drain it",
    startResponse: "You fill the tub. Steam curls up from the water.",
    stopResponse: "You pull the plug. The water swirls away.",
  },
  {
    groupId: "fireplace",
    name: "Fireplace",
    offItemId: "furniture1-fireplace",
    onItemId: "furniture2-fireplace-lit",
    offPrompt: "Light the fire?",
    onPrompt: "Put out the fire?",
    startLabel: "Light it",
    stopLabel: "Let it die down",
    startResponse: "You coax a warm flame to life.",
    stopResponse: "You bank the embers. The room cools a little.",
  },
  {
    groupId: "fridge",
    name: "Fridge",
    offItemId: "furniture1-fridge",
    onItemId: "furniture2-fridge-open",
    offPrompt: "Open the fridge?",
    onPrompt: "Close the fridge?",
    startLabel: "Open it",
    stopLabel: "Close it",
    startResponse: "You open the fridge. Cold air spills out.",
    stopResponse: "You shut the door. The cold stays put.",
  },
  {
    groupId: "ironing-board",
    name: "Ironing board",
    offItemId: "furniture1-ironing-board",
    onItemId: "furniture2-ironing-board-full",
    offPrompt: "Set up the ironing board?",
    onPrompt: "Put the ironing board away?",
    startLabel: "Set it up",
    stopLabel: "Fold it away",
    startResponse: "You unfold the board and clear a little space.",
    stopResponse: "You fold the board back up.",
  },
  {
    groupId: "kitchen-counter",
    name: "Kitchen",
    offItemId: "furniture1-kitchen-counter",
    onItemId: "furniture2-kitchen-counter-on",
    offPrompt: ({meal}) =>
      meal === "snack" ? "Whip up a late-night snack?" : `Make ${meal}?`,
    onPrompt: "Are you done using the kitchen?",
    startLabel: ({meal}) =>
      meal === "snack" ? "Yes, snack time" : `Yes, make ${meal}`,
    stopLabel: "Yes, all done",
    startResponse: ({meal}) =>
      meal === "snack"
        ? "You clear a spot and start assembling a snack."
        : `You set out what you need for ${meal}.`,
    stopResponse: "You tidy the counter and put things away.",
  },
  {
    groupId: "lamp",
    name: "Lamp",
    offItemId: "furniture1-lamp",
    onItemId: "furniture2-lamp-lit",
    offPrompt: "Turn on the lamp?",
    onPrompt: "Turn off the lamp?",
    startLabel: "Turn it on",
    stopLabel: "Turn it off",
    startResponse: "You click the lamp on. The corner brightens.",
    stopResponse: "You switch the lamp off.",
  },
  {
    groupId: "lamp-sm",
    name: "Little lamp",
    offItemId: "furniture1-lamp-sm",
    onItemId: "furniture2-lamp-sm-lit",
    offPrompt: "Turn on the little lamp?",
    onPrompt: "Turn off the little lamp?",
    startLabel: "Turn it on",
    stopLabel: "Turn it off",
    startResponse: "A small glow settles over the nook.",
    stopResponse: "The little lamp goes dark.",
  },
  {
    groupId: "rack",
    name: "Storage rack",
    offItemId: "furniture1-rack",
    onItemId: "furniture2-rack-full",
    offPrompt: "Load up the rack?",
    onPrompt: "Clear off the rack?",
    startLabel: "Load it",
    stopLabel: "Clear it",
    startResponse: "You stack the shelves with everyday clutter.",
    stopResponse: "You clear the shelves.",
  },
  {
    groupId: "sink",
    name: "Sink",
    offItemId: "furniture1-sink",
    onItemId: "furniture2-sink-on",
    offPrompt: "Turn on the sink?",
    onPrompt: "Turn off the sink?",
    startLabel: "Turn it on",
    stopLabel: "Turn it off",
    startResponse: "Water rushes into the basin.",
    stopResponse: "You shut off the faucet.",
  },
  {
    groupId: "stove",
    name: "Stove",
    offItemId: "furniture1-stove",
    onItemId: "furniture2-stove-on",
    offPrompt: ({meal}) =>
      meal === "snack"
        ? "Fire up the stove for a snack?"
        : `Fire up the stove for ${meal}?`,
    onPrompt: "Turn off the stove?",
    startLabel: "Turn it on",
    stopLabel: "Turn it off",
    startResponse: "You light a burner. Heat blooms on the surface.",
    stopResponse: "You kill the flame. The stove ticks as it cools.",
  },
  {
    groupId: "toilet",
    name: "Toilet",
    offItemId: "furniture1-toilet",
    onItemId: "furniture2-toilet-full",
    offPrompt: "Use the toilet?",
    onPrompt: "Flush and tidy up?",
    startLabel: "Yes",
    stopLabel: "All done",
    startResponse: "You take a moment. Privacy respected.",
    stopResponse: "You flush and tidy up.",
  },
  {
    groupId: "book",
    name: "Book",
    offItemId: "smallitems-book",
    onItemId: "smallitems-book-open",
    offPrompt: "Open the book?",
    onPrompt: "Close the book?",
    startLabel: "Open it",
    stopLabel: "Close it",
    startResponse: "You open to a dog-eared page.",
    stopResponse: "You close the cover.",
  },
];

const CHOICES: readonly ChoiceSpec[] = [
  {
    groupId: "pet-dish",
    name: "Pet dish",
    emptyItemId: "smallitems-pet-dish",
    emptyPrompt: "Fill the pet dish?",
    filledPrompt: "Change what's in the dish?",
    emptyLabel: "Empty it",
    emptyResponse: "You empty the dish.",
    fillOptions: [
      {
        id: "food",
        label: "Add food",
        itemId: "smallitems-pet-dish-food",
        response: "You scoop in some food.",
      },
      {
        id: "water",
        label: "Add water",
        itemId: "smallitems-pet-dish-water",
        response: "You pour in fresh water.",
      },
    ],
  },
  {
    groupId: "cup",
    name: "Cup",
    emptyItemId: "smallitems-cup",
    emptyPrompt: "What do you want to pour?",
    filledPrompt: "Change what's in the cup?",
    emptyLabel: "Empty it",
    emptyResponse: "You rinse the cup.",
    fillOptions: [
      {
        id: "coffee",
        label: "Coffee",
        itemId: "smallitems-cup-coffee",
        response: "You pour a hot cup of coffee.",
      },
      {
        id: "hot-choco",
        label: "Hot cocoa",
        itemId: "smallitems-cup-hot-choco",
        response: "You pour yourself some hot cocoa.",
      },
      {
        id: "tea",
        label: "Tea",
        itemId: "smallitems-cup-tea",
        response: "You steep a quiet cup of tea.",
      },
    ],
  },
  {
    groupId: "glass",
    name: "Glass",
    emptyItemId: "smallitems-glass",
    emptyPrompt: "What do you want to pour?",
    filledPrompt: "Change what's in the glass?",
    emptyLabel: "Empty it",
    emptyResponse: "You empty the glass.",
    fillOptions: [
      {
        id: "blue",
        label: "Cool blue drink",
        itemId: "smallitems-glass-full-01",
        response: "You pour a cool blue drink.",
      },
      {
        id: "green",
        label: "Green drink",
        itemId: "smallitems-glass-full-02",
        response: "You pour a green drink.",
      },
      {
        id: "pink",
        label: "Pink drink",
        itemId: "smallitems-glass-full-03",
        response: "You pour a pink drink.",
      },
    ],
  },
  {
    groupId: "plate",
    name: "Plate",
    emptyItemId: "smallitems-plate",
    emptyPrompt: "Serve something on the plate?",
    filledPrompt: "Change what's on the plate?",
    emptyLabel: "Clear it",
    emptyResponse: "You clear the plate.",
    fillOptions: [
      {
        id: "one",
        label: "A simple meal",
        itemId: "smallitems-plate-full-01",
        response: "You plate up a simple meal.",
      },
      {
        id: "two",
        label: "Another dish",
        itemId: "smallitems-plate-full-02",
        response: "You set down a second dish.",
      },
      {
        id: "three",
        label: "Something fancy",
        itemId: "smallitems-plate-full-03",
        response: "You plate something a little fancier.",
      },
    ],
  },
  {
    groupId: "pot",
    name: "Pot",
    emptyItemId: "smallitems-pot",
    emptyPrompt: "What's cooking?",
    filledPrompt: "Change what's in the pot?",
    emptyLabel: "Empty it",
    emptyResponse: "You empty the pot.",
    fillOptions: [
      {
        id: "one",
        label: "Stew",
        itemId: "smallitems-pot-full-01",
        response: "You set a stew bubbling.",
      },
      {
        id: "two",
        label: "Soup",
        itemId: "smallitems-pot-full-02",
        response: "You ladle up a warm soup.",
      },
      {
        id: "three",
        label: "Something mysterious",
        itemId: "smallitems-pot-full-03",
        response: "Whatever it is, it smells promising.",
      },
    ],
  },
  {
    groupId: "wineglass",
    name: "Wineglass",
    emptyItemId: "smallitems-wineglass",
    emptyPrompt: "What do you want to pour?",
    filledPrompt: "Change what's in the glass?",
    emptyLabel: "Empty it",
    emptyResponse: "You empty the glass.",
    fillOptions: [
      {
        id: "one",
        label: "A careful pour",
        itemId: "smallitems-wineglass-full-01",
        response: "You pour a careful measure.",
      },
      {
        id: "two",
        label: "A fuller pour",
        itemId: "smallitems-wineglass-full-02",
        response: "You top up the glass.",
      },
      {
        id: "three",
        label: "The fancy stuff",
        itemId: "smallitems-wineglass-full-03",
        response: "You pour the fancy stuff.",
      },
    ],
  },
];

/**
 * Quirky one-liners for small items that don't change state.
 * Matched by canonical shop display id (`smallitems-…`).
 */
const SMALL_ITEM_MUSINGS: readonly MuseSpec[] = [
  {
    itemId: "smallitems-apple",
    name: "Apple",
    line: "Shiny enough to start a myth. Or a snack. You haven't decided.",
  },
  {
    itemId: "smallitems-ball",
    name: "Bouncy ball",
    line: "It looks ready to escape the second you look away.",
  },
  {
    itemId: "smallitems-ball-sm",
    name: "Tiny ball",
    line: "Small ball, big potential for regret under the couch.",
  },
  {
    itemId: "smallitems-bone",
    name: "Dog bone",
    line: "A trophy for someone with better chewing instincts than you.",
  },
  {
    itemId: "smallitems-box",
    name: "Little box",
    line: "Definitely contains either treasure or nothing. Classic.",
  },
  {
    itemId: "smallitems-box-lg",
    name: "Big box",
    line: "You could live in there. Briefly. With dignity.",
  },
  {
    itemId: "smallitems-can-01",
    name: "Can",
    line: "A bold red label and zero clues about the contents. Perfect.",
  },
  {
    itemId: "smallitems-can-02",
    name: "Can",
    line: "Blue-label mystery stew energy. You respect it.",
  },
  {
    itemId: "smallitems-can-03",
    name: "Can",
    line: "Green tin. Quietly plotting pantry immortality.",
  },
  {
    itemId: "smallitems-can-04",
    name: "Can",
    line: "Gold label. Fancy enough to feel like a side quest reward.",
  },
  {
    itemId: "smallitems-candle",
    name: "Candle",
    line: "A pocket-sized sun waiting for its dramatic lighting cue.",
  },
  {
    itemId: "smallitems-clock",
    name: "Small clock",
    line: "You check the time. It checks you back. Fair.",
  },
  {
    itemId: "smallitems-coat-hanger",
    name: "Coat hanger",
    line: "A wire skeleton with wardrobe ambition.",
  },
  {
    itemId: "smallitems-cutting-board",
    name: "Cutting board",
    line: "Scars of a thousand ambitious snacks. Respectable.",
  },
  {
    itemId: "smallitems-duck",
    name: "Rubber duck",
    line: "You nod. It nods. The debugging session begins.",
  },
  {
    itemId: "smallitems-fish-bowl",
    name: "Fish bowl",
    line: "A tiny ocean with excellent real estate and worse commute options.",
  },
  {
    itemId: "smallitems-flower-pot",
    name: "Flower pot",
    line: "Someone's leafy roommate is doing great. Relatable, almost.",
  },
  {
    itemId: "smallitems-note",
    name: "Note",
    line: "A folded secret. You resist unfolding destiny… for now.",
  },
  {
    itemId: "smallitems-painting-01",
    name: "Little painting",
    line: "Art that knows how to hang around without explaining itself.",
  },
  {
    itemId: "smallitems-painting-02",
    name: "Little painting",
    line: "Another tiny window into a mood. You peer in politely.",
  },
  {
    itemId: "smallitems-paper",
    name: "Paper",
    line: "Blank page energy. Terrifying. Inspiring. Mostly terrifying.",
  },
  {
    itemId: "smallitems-pie",
    name: "Pie",
    line: "A flaky circle of excellent decisions. You approve.",
  },
  {
    itemId: "smallitems-plant-01",
    name: "Potted plant",
    line: "It photosynthesizes. You procrastinate. Balance.",
  },
  {
    itemId: "smallitems-plant-02",
    name: "Potted plant",
    line: "Green, quiet, judgmental in a supportive way.",
  },
  {
    itemId: "smallitems-plunger",
    name: "Plunger",
    line: "The unsung hero of plumbing. You tip an imaginary hat.",
  },
  {
    itemId: "smallitems-snowglobe",
    name: "Snow globe",
    line: "A blizzard you can shake. Power like that changes a person.",
  },
  {
    itemId: "smallitems-soap",
    name: "Soap",
    line: "Cleanliness in bar form. Slippery ambition included.",
  },
  {
    itemId: "smallitems-teapot",
    name: "Teapot",
    line: "Round, ready, and almost certainly full of gossip.",
  },
  {
    itemId: "smallitems-telephone",
    name: "Telephone",
    line: "Old-school ringing potential. You almost dial for fun.",
  },
  {
    itemId: "smallitems-toilet-paper",
    name: "Toilet paper",
    line: "Civilization, rolled up. Never take it for granted.",
  },
  {
    itemId: "smallitems-towel-01",
    name: "Towel",
    line: "Soft, square, and prepared for splash-related emergencies.",
  },
  {
    itemId: "smallitems-towel-02",
    name: "Towel",
    line: "Backup towel. The true mark of a prepared household.",
  },
  {
    itemId: "smallitems-vase",
    name: "Vase",
    line: "An elegant neck waiting for flowers with main-character energy.",
  },
  {
    itemId: "smallitems-wood-decor",
    name: "Wooden decor",
    line: "A little wooden oddity. Shelf-charisma: undeniable.",
  },
];

/**
 * Ordered behavior registry. Compound / contextual rules outrank simple
 * toggles and choices via `priority` (see `resolveInteraction`).
 */
export const INTERACTION_BEHAVIORS: readonly InteractionBehavior[] = [
  createCompoundBehavior({
    id: "pan-stove",
    members: ["pan", "stove"],
    name: "Cooking",
    focusEmptyItemId: "smallitems-pan",
    partnerOffItemId: "furniture1-stove",
    partnerOnItemId: "furniture2-stove-on",
    startPrompt: "What do you want to cook?",
    engagedPrompt: "It's ready now! Make another dish, or wrap up?",
    resetLabel: "Turn off and clean up",
    resetResponse:
      "You scrape the pan clean and kill the burner. Dinner's over.",
    engagedKeepLabel: "Keep cooking",
    stateOptions: [
      {
        id: "eggs",
        label: "Eggs",
        itemId: "smallitems-pan-eggs",
        response: "You crack eggs into the pan. The burner kicks on.",
      },
      {
        id: "meat",
        label: "Something savory",
        itemId: "smallitems-pan-meat",
        response: "You lay the meat in to sizzle. The stove warms up.",
      },
      {
        id: "veggies",
        label: "Vegetables",
        itemId: "smallitems-pan-veggies",
        response: "You toss in vegetables. The burner glows underneath.",
      },
    ],
  }),
  createVesselNeedsHeatBehavior({
    vesselGroupId: "pan",
    heatGroupId: "stove",
    name: "Pan",
    prompt: "Set this on a stove if you want to cook.",
  }),
  ...TOGGLES.map(createToggleBehavior),
  ...CHOICES.map(createChoiceBehavior),
  createMuseBehaviors(SMALL_ITEM_MUSINGS),
];
