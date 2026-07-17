export const SHOP_PRICE_BY_VALUE = {
  1: 10,
  2: 20,
  3: 35,
  4: 55,
  5: 80,
  6: 115,
  7: 160,
  8: 220,
} as const;

export type ShopValue = keyof typeof SHOP_PRICE_BY_VALUE;
export type ShopCategory = "furniture" | "smallitem";

export type ShopItem = {
  id: string;
  category: ShopCategory;
  assetPath: string;
  name: string;
  description: string;
  value: ShopValue;
  price: (typeof SHOP_PRICE_BY_VALUE)[ShopValue];
};

type ShopItemSeed = {
  slug: string;
  name: string;
  description: string;
  value: ShopValue;
};

function createShopItem(
  folder: "furniture1" | "furniture2" | "smallitems",
  category: ShopCategory,
  seed: ShopItemSeed,
): ShopItem {
  return {
    id: `${folder}-${seed.slug}`,
    category,
    assetPath: `/assets/${folder}/${seed.slug}.png`,
    name: seed.name,
    description: seed.description,
    value: seed.value,
    price: SHOP_PRICE_BY_VALUE[seed.value],
  };
}

const FURNITURE_1 = [
  ["bamboo-pot", "Bamboo Buddy", "A leafy roommate with excellent manners.", 4],
  ["bathtub", "Bubble Bathtub", "For heroic soaks and tiny boat races.", 8],
  ["bookshelf-lg-01-side", "Sideways Story Shelf", "Books stand here and mind their business.", 6],
  ["bookshelf-lg-01", "Tall Story Shelf", "A big home for even bigger plot twists.", 6],
  ["bookshelf-lg-02-side", "Sideways Book Nook", "A cozy little spine parade from the side.", 6],
  ["bookshelf-lg-02", "Grand Book Nook", "Tall, tidy, and full of suspiciously good ideas.", 6],
  ["bookshelf-sm", "Pocket Bookshelf", "Small shelf, enormous reading energy.", 4],
  ["chair-back", "Chair, Back View", "The chair is shy. Please admire it from here.", 3],
  ["chair-brown-back", "Brown Chair, Back View", "A warm wooden back with cozy ambitions.", 3],
  ["chair-brown-side", "Brown Chair, Side View", "A sidekick chair for sideways thinkers.", 3],
  ["chair-brown", "Brown Chair", "Reliable, comfy, and ready for a dramatic sit.", 3],
  ["chair-white-side", "White Chair, Side View", "Crisp little seat, big tiny-room energy.", 3],
  ["chair-white", "White Chair", "A bright perch for pondering snacks.", 3],
  ["cook-rack", "Cook's Rack", "Pots hang out here and gossip about dinner.", 5],
  ["dresser-lg-side", "Long Dresser, Side View", "A wardrobe runway from the side.", 6],
  ["dresser-lg", "Long Dresser", "Drawer after drawer of secret sock storage.", 6],
  ["dresser-side", "Dresser, Side View", "A tidy little profile with drawers to spare.", 5],
  ["dresser-small-side", "Small Dresser, Side View", "Compact couture storage for tiny treasures.", 4],
  ["dresser-small", "Small Dresser", "Small drawers, mighty organization.", 4],
  ["dresser", "Classic Dresser", "Keeps your things folded and your mysteries hidden.", 5],
  ["fireplace", "Fireplace", "A warm square of ooh, cozy.", 8],
  ["fridge", "Fridge", "The cold cupboard where leftovers become legends.", 7],
  ["grandfather-clock", "Grandfather Clock", "Tick-tock with a little old-soul swagger.", 7],
  ["ironing-board", "Ironing Board", "Wrinkles beware: the board has opinions.", 4],
  ["kitchen-counter", "Kitchen Counter", "The stage where snacks make their entrance.", 7],
  ["lamp-sm", "Little Lamp", "A tiny sun with a very polite glow.", 3],
  ["lamp", "Cosy Lamp", "Turns ordinary corners into story corners.", 5],
  ["mirror", "Mirror", "Reflects you, your style, and possibly a snack crumb.", 5],
  ["pet-bed", "Pet Bed", "A plush landing pad for champion nappers.", 4],
  ["rack", "Storage Rack", "A tidy ladder for all your useful odds and ends.", 5],
  ["radio", "Radio", "Tiny box, enormous potential for kitchen dancing.", 5],
  ["rug-diamond-down", "Diamond Rug, Down", "A floor jewel that points the way to comfy.", 4],
  ["rug-diamond-side", "Diamond Rug, Side", "A sideways sparkle for your stylish floor.", 4],
  ["rug-down", "Soft Rug, Down", "Put your feet here. They have earned it.", 4],
  ["rug-purple", "Purple Rug", "A royal landing zone for unroyal socks.", 5],
  ["rug-side", "Soft Rug, Side", "A little floor hug, viewed from the side.", 4],
  ["shelf", "Wall Shelf", "A floating stage for excellent knickknacks.", 4],
  ["sink", "Sink", "Where dishes go to think about what they have done.", 6],
  ["sofa-lg-back", "Grand Sofa, Back View", "The back of a sofa still has star quality.", 7],
  ["sofa-lg-side", "Grand Sofa, Side View", "A long, lounging comma for your room.", 7],
  ["sofa-lg", "Grand Sofa", "Room for naps, chats, and one dramatic flop.", 8],
  ["sofa-sm-back", "Small Sofa, Back View", "A petite couch with a perfectly good backside.", 5],
  ["sofa-sm-side", "Small Sofa, Side View", "Compact comfort with a charming profile.", 5],
  ["sofa-sm", "Small Sofa", "Big nap energy in a friendly little package.", 6],
  ["stool", "Stool", "A perky perch for feet, mugs, and big thoughts.", 3],
  ["stove", "Stove", "Where ingredients go in and dinner magic comes out.", 7],
  ["table-lg-side", "Long Table, Side View", "A grand banquet from a very good angle.", 6],
  ["table-lg", "Long Table", "Built for feasts, maps, and dramatic elbows.", 7],
  ["table-md", "Middle Table", "Just right for tea, tales, and a suspicious pie.", 5],
  ["table-sm", "Little Table", "A tiny tabletop for very important tiny things.", 4],
  ["toilet-side", "Toilet, Side View", "A porcelain pause with a polite profile.", 5],
  ["toilet", "Toilet", "The throne room, modestly sized.", 5],
] as const satisfies readonly [string, string, string, ShopValue][];

const FURNITURE_2 = [
  ["bathtub-full", "Full Bubble Bath", "The deluxe soak, bubbles included in spirit.", 8],
  ["bookshelf-lg-01-side", "Sideways Story Shelf II", "Same great stories, a different little angle.", 6],
  ["bookshelf-lg-01", "Tall Story Shelf II", "A book tower with sequel energy.", 6],
  ["bookshelf-lg-02-side", "Sideways Book Nook II", "A cozy spine parade in a fresh outfit.", 6],
  ["bookshelf-lg-02", "Grand Book Nook II", "Tall enough for tales with excellent eyebrows.", 6],
  ["bookshelf-sm", "Pocket Bookshelf II", "Small shelf, now with extra shelf-esteem.", 4],
  ["chair-dark-brown-back", "Cocoa Chair, Back View", "A dark, warm back for serious sitting.", 3],
  ["chair-dark-brown-side", "Cocoa Chair, Side View", "A chocolatey sidekick for your room.", 3],
  ["chair-dark-brown", "Cocoa Chair", "Deeply comfy and almost snack-colored.", 3],
  ["chair-orange-back", "Tangerine Chair, Back View", "A sunny seat with its back turned to boring.", 4],
  ["chair-orange-side", "Tangerine Chair, Side View", "A bright side profile with zing.", 4],
  ["chair-orange", "Tangerine Chair", "A citrusy perch for bright ideas.", 4],
  ["cook-rack", "Cook's Rack, Warm", "The pots are hanging around again.", 5],
  ["dresser-lg-side", "Long Dresser, Warm Side", "A wardrobe runway with extra glow.", 6],
  ["dresser-lg", "Long Dresser, Warm", "Big storage for big outfit plots.", 6],
  ["dresser-side", "Dresser, Warm Side", "A tidy profile with a toasty little mood.", 5],
  ["dresser-small-side", "Small Dresser, Warm Side", "Tiny drawers, warm-hearted organization.", 4],
  ["dresser-small", "Small Dresser, Warm", "A little drawer stack with big neatness.", 4],
  ["dresser", "Classic Dresser, Warm", "Fold it, hide it, call it interior design.", 5],
  ["fireplace-lit", "Lit Fireplace", "The fireplace is glowing like it knows a secret.", 8],
  ["flower-pot", "Flower Pot", "A tiny garden wearing a very sturdy hat.", 4],
  ["fridge-open", "Open Fridge", "The midnight snack portal stands ready.", 7],
  ["grandfather-clock", "Grandfather Clock, Warm", "Tick-tock, but make it snug.", 7],
  ["ironing-board-full", "Full Ironing Board", "A wrinkle-fighting runway in full formation.", 4],
  ["kitchen-counter-on", "Kitchen Counter, Ready", "The counter is dressed for dinner service.", 7],
  ["lamp-lit", "Lit Lamp", "A little beacon for late-night wonderings.", 5],
  ["lamp-sm-lit", "Little Lit Lamp", "Small glow, mighty bedtime charm.", 3],
  ["mirror", "Mirror, Warm", "Your reflection has entered its cozy era.", 5],
  ["pet-bed-green", "Mossy Pet Bed", "A green snooze nest for furry royalty.", 4],
  ["rack-full", "Full Storage Rack", "Loaded with useful clutter and zero apologies.", 5],
  ["radio", "Radio, Warm", "The dance floor is wherever this radio lives.", 5],
  ["rug-down", "Soft Rug, Warm", "A warm welcome mat for wandering toes.", 4],
  ["rug-green-down", "Green Rug, Down", "A patch of grass that never needs mowing.", 4],
  ["rug-green-side", "Green Rug, Side", "A leafy little floor hug from the side.", 4],
  ["rug-green", "Green Rug", "Fresh-floor feeling, no gardening gloves required.", 5],
  ["rug-side", "Soft Rug, Warm Side", "A cozy floor whisper in profile.", 4],
  ["shelf", "Wall Shelf, Warm", "A floating perch for your favorite treasures.", 4],
  ["sink-on", "Sink, Shiny", "Sparkly enough to make dishes feel fancy.", 6],
  ["sofa-lg-back", "Grand Sofa, Warm Back", "Even its backside looks ready for a nap.", 7],
  ["sofa-lg-side", "Grand Sofa, Warm Side", "A long lounge with a golden-hour profile.", 7],
  ["sofa-lg", "Grand Sofa, Warm", "A grand couch for grandly doing nothing.", 8],
  ["sofa-sm-back", "Small Sofa, Warm Back", "A little couch with a sunny rear view.", 5],
  ["sofa-sm-side", "Small Sofa, Warm Side", "Compact comfort, softly seasoned.", 5],
  ["sofa-sm", "Small Sofa, Warm", "The ideal perch for a quick cozy escape.", 6],
  ["stool", "Stool, Warm", "A cheerful perch that takes sitting seriously.", 3],
  ["stove-on", "Stove, On", "Dinner is happening. Please bring a fork.", 7],
  ["table-lg-side", "Long Table, Warm Side", "A banquet table with a lovely little profile.", 6],
  ["table-lg", "Long Table, Warm", "Pull up a chair; the feast is feeling fancy.", 7],
  ["table-md", "Middle Table, Warm", "The just-right table, now extra toasty.", 5],
  ["table-sm", "Little Table, Warm", "Small surface, warm welcome.", 4],
  ["toilet-full", "Full Toilet", "A throne with the full porcelain treatment.", 5],
  ["toilet-side-full", "Full Toilet, Side View", "A dignified porcelain profile.", 5],
] as const satisfies readonly [string, string, string, ShopValue][];

const SMALL_ITEMS = [
  ["apple", "Apple", "A shiny little crunch with main-character energy.", 1],
  ["ball-sm", "Tiny Ball", "Small bounce, enormous zoomies.", 1],
  ["ball", "Bouncy Ball", "For rooms that need a little boing.", 2],
  ["bone", "Dog Bone", "A chewable trophy for a very good pup.", 2],
  ["book", "Closed Book", "Its secrets are taking a tiny nap.", 2],
  ["book-open", "Open Book", "A story caught mid-stretch.", 3],
  ["box", "Little Box", "Perfect for treasures, buttons, and one mystery.", 1],
  ["box-lg", "Big Box", "A cardboard castle for ambitious clutter.", 2],
  ["can-01", "Can, Red Label", "A pantry pebble with bold label energy.", 1],
  ["can-02", "Can, Blue Label", "Small, useful, and mysteriously satisfying.", 1],
  ["can-03", "Can, Green Label", "A tiny tin that knows how to keep a secret.", 1],
  ["can-04", "Can, Gold Label", "A pantry classic with a fancy little outfit.", 2],
  ["candle", "Candle", "A pocket-sized star for cozy corners.", 2],
  ["clock", "Small Clock", "For keeping time and dramatically checking it.", 3],
  ["coat-hanger", "Coat Hanger", "A tiny tree for jackets and brave hats.", 1],
  ["cup", "Cup", "A little hug for tea, cocoa, or air.", 1],
  ["cup-coffee", "Coffee Cup", "Contains approximately one excellent idea.", 2],
  ["cup-hot-choco", "Hot Cocoa Cup", "Marshmallow mood in a tiny mug.", 2],
  ["cup-tea", "Tea Cup", "A dainty sip of please-and-thank-you.", 2],
  ["cutting-board", "Cutting Board", "The chopping block, but make it charming.", 2],
  ["duck", "Rubber Duck", "A bath-time confidant with no bad opinions.", 3],
  ["fish-bowl", "Fish Bowl", "A round little world with excellent bubbles.", 5],
  ["flower-pot", "Flower Pot", "A tiny home for a leafy overachiever.", 3],
  ["glass", "Glass", "Clear, classy, and ready for a sip.", 1],
  ["glass-full-01", "Full Glass, Blue", "A cool little drink with big refreshment.", 2],
  ["glass-full-02", "Full Glass, Green", "A cheerful sip in a cheerful shade.", 2],
  ["glass-full-03", "Full Glass, Pink", "A rosy little refreshment.", 2],
  ["note", "Note", "A tiny thought waiting for its big moment.", 1],
  ["painting-01", "Little Painting I", "A wall-sized window into a tiny mood.", 4],
  ["painting-02", "Little Painting II", "Art that knows how to hang out.", 4],
  ["pan", "Pan", "The trusty round stage for tasty things.", 3],
  ["pan-eggs", "Pan of Eggs", "Breakfast is wearing its sunny hat.", 3],
  ["pan-meat", "Pan of Sizzle", "A very serious pan doing delicious work.", 4],
  ["pan-veggies", "Pan of Veggies", "Crunchy little colors having a meeting.", 3],
  ["paper", "Paper", "Blank, brave, and ready for doodle destiny.", 1],
  ["pet-dish", "Pet Dish", "A dinner plate for someone with whiskers.", 2],
  ["pet-dish-food", "Pet Food Dish", "The good stuff, served with tail wags.", 2],
  ["pet-dish-water", "Pet Water Dish", "Hydration station for the household celebrity.", 2],
  ["pie", "Pie", "A flaky little circle of excellent decisions.", 4],
  ["plant-01", "Potted Plant I", "Leafy, lovely, and mostly low-maintenance.", 3],
  ["plant-02", "Potted Plant II", "A green friend with quiet star power.", 3],
  ["plate", "Plate", "A blank canvas for dinner's big debut.", 1],
  ["plate-full-01", "Full Plate I", "A tiny feast with a very full schedule.", 3],
  ["plate-full-02", "Full Plate II", "Dinner has arrived wearing its best pixels.", 3],
  ["plate-full-03", "Full Plate III", "A little plate with banquet-sized confidence.", 3],
  ["plunger", "Plunger", "The brave little hero of bathroom adventures.", 2],
  ["pot", "Pot", "A sturdy hug for soups, stews, and secrets.", 3],
  ["pot-full-01", "Full Pot I", "Something delicious is bubbling suspiciously.", 4],
  ["pot-full-02", "Full Pot II", "A warm pot of probably-second-helpings.", 4],
  ["pot-full-03", "Full Pot III", "Steamy, dreamy, and absolutely not for juggling.", 4],
  ["snowglobe", "Snow Globe", "A blizzard you can shake by the handle.", 5],
  ["soap", "Soap", "Small bar, enormous clean-up confidence.", 1],
  ["teapot", "Teapot", "A round little host for excellent gossip.", 4],
  ["telephone", "Telephone", "For calling friends the old-fashioned pixel way.", 4],
  ["toilet-paper", "Toilet Paper", "A soft roll of bathroom preparedness.", 1],
  ["toilet-paper-back", "Toilet Paper, Back", "Even the back has a very important job.", 1],
  ["towel-01", "Towel I", "Soft, square, and ready for a tiny splash.", 1],
  ["towel-02", "Towel II", "A second soft landing for damp adventures.", 1],
  ["vase", "Vase", "A fancy little neck for your favorite blooms.", 3],
  ["wineglass", "Wineglass", "A delicate cup with pinky-out potential.", 2],
  ["wineglass-full-01", "Full Wineglass I", "A celebratory sparkle in miniature.", 3],
  ["wineglass-full-02", "Full Wineglass II", "A tiny toast to excellent decorating.", 3],
  ["wineglass-full-03", "Full Wineglass III", "Fancy juice with a very fancy posture.", 3],
  ["wood-decor", "Wooden Decor", "A little wooden oddity with big shelf charm.", 3],
] as const satisfies readonly [string, string, string, ShopValue][];

function buildCatalog(
  folder: "furniture1" | "furniture2" | "smallitems",
  category: ShopCategory,
  seeds: readonly (readonly [string, string, string, ShopValue])[],
): ShopItem[] {
  return seeds.map(([slug, name, description, value]) =>
    createShopItem(folder, category, {slug, name, description, value}),
  );
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  ...buildCatalog("furniture1", "furniture", FURNITURE_1),
  ...buildCatalog("furniture2", "furniture", FURNITURE_2),
  ...buildCatalog("smallitems", "smallitem", SMALL_ITEMS),
];

export type ShopItemVariantKind = "orientation" | "state";

export type ShopItemVariant = {
  groupId: string;
  itemId: string;
  kind: ShopItemVariantKind;
  displayItemId: string;
};

export type ShopItemVariantGroup = {
  id: string;
  category: ShopCategory;
  orientationItemIds: readonly string[];
  stateItemIds: readonly string[];
  displayItemId: string;
};

type ShopItemVariantGroupSeed = Omit<ShopItemVariantGroup, "id"> & {
  id: string;
};

/** Facing suffixes: front (none) → side → back. `down` is front-facing for rugs. */
export type ShopOrientation = "front" | "side" | "back";

const ORIENTATION_ORDER: readonly ShopOrientation[] = [
  "front",
  "side",
  "back",
];

/** Longest-first so `hot-choco` / `full-01` win over shorter tokens. */
const STATE_SUFFIXES = [
  "hot-choco",
  "full-01",
  "full-02",
  "full-03",
  "coffee",
  "tea",
  "food",
  "water",
  "eggs",
  "meat",
  "veggies",
  "open",
  "lit",
  "on",
  "full",
] as const;

export type ShopItemParts = {
  folder: string;
  slug: string;
  baseSlug: string;
  orientation: ShopOrientation;
  state: string;
};

function slugParts(slug: string): Pick<
  ShopItemParts,
  "baseSlug" | "orientation" | "state"
> {
  let rest = slug;
  let state = "default";
  let orientation: ShopOrientation = "front";

  for (const suffix of STATE_SUFFIXES) {
    if (rest === suffix) {
      state = suffix;
      rest = "";
      break;
    }
    if (rest.endsWith(`-${suffix}`)) {
      state = suffix;
      rest = rest.slice(0, -(suffix.length + 1));
      break;
    }
  }

  if (rest.endsWith("-side")) {
    orientation = "side";
    rest = rest.slice(0, -5);
  } else if (rest.endsWith("-back")) {
    orientation = "back";
    rest = rest.slice(0, -5);
  } else if (rest.endsWith("-down")) {
    // Rugs use "down" as the front-facing orientation.
    orientation = "front";
    rest = rest.slice(0, -5);
  }

  const rawBase = rest || slug;
  // chair-back is the white chair's rear view (filename lacks the color prefix).
  const baseSlug =
    slug === "chair-back" || rawBase === "chair-back"
      ? "chair-white"
      : rawBase;

  return {
    baseSlug,
    orientation,
    state,
  };
}

export function getShopItemParts(item: ShopItem): ShopItemParts {
  const match = item.assetPath.match(/^\/assets\/([^/]+)\/(.+)\.png$/);
  const folder = match?.[1] ?? "";
  const slug =
    match?.[2] ??
    item.id.replace(/^(?:furniture1|furniture2|smallitems)-/, "");
  return {
    folder,
    slug,
    ...slugParts(slug),
  };
}

const SHOP_ITEM_VARIANT_GROUP_SEEDS: readonly ShopItemVariantGroupSeed[] = [
  {
    id: "bathtub",
    category: "furniture",
    orientationItemIds: [],
    stateItemIds: ["furniture1-bathtub", "furniture2-bathtub-full"],
    displayItemId: "furniture1-bathtub",
  },
  {
    id: "bookshelf-lg-01",
    category: "furniture",
    orientationItemIds: [
      "furniture1-bookshelf-lg-01",
      "furniture1-bookshelf-lg-01-side",
    ],
    stateItemIds: [],
    displayItemId: "furniture1-bookshelf-lg-01",
  },
  {
    id: "bookshelf-lg-02",
    category: "furniture",
    orientationItemIds: [
      "furniture1-bookshelf-lg-02",
      "furniture1-bookshelf-lg-02-side",
    ],
    stateItemIds: [],
    displayItemId: "furniture1-bookshelf-lg-02",
  },
  {
    id: "chair-brown",
    category: "furniture",
    orientationItemIds: [
      "furniture1-chair-brown",
      "furniture1-chair-brown-side",
      "furniture1-chair-brown-back",
    ],
    stateItemIds: [],
    displayItemId: "furniture1-chair-brown",
  },
  {
    id: "chair-white",
    category: "furniture",
    orientationItemIds: [
      "furniture1-chair-white",
      "furniture1-chair-white-side",
      "furniture1-chair-back",
    ],
    stateItemIds: [],
    displayItemId: "furniture1-chair-white",
  },
  {
    id: "chair-dark-brown",
    category: "furniture",
    orientationItemIds: [
      "furniture2-chair-dark-brown",
      "furniture2-chair-dark-brown-side",
      "furniture2-chair-dark-brown-back",
    ],
    stateItemIds: [],
    displayItemId: "furniture2-chair-dark-brown",
  },
  {
    id: "chair-orange",
    category: "furniture",
    orientationItemIds: [
      "furniture2-chair-orange",
      "furniture2-chair-orange-side",
      "furniture2-chair-orange-back",
    ],
    stateItemIds: [],
    displayItemId: "furniture2-chair-orange",
  },
  {
    id: "dresser",
    category: "furniture",
    orientationItemIds: ["furniture1-dresser", "furniture1-dresser-side"],
    stateItemIds: [],
    displayItemId: "furniture1-dresser",
  },
  {
    id: "dresser-lg",
    category: "furniture",
    orientationItemIds: ["furniture1-dresser-lg", "furniture1-dresser-lg-side"],
    stateItemIds: [],
    displayItemId: "furniture1-dresser-lg",
  },
  {
    id: "dresser-small",
    category: "furniture",
    orientationItemIds: [
      "furniture1-dresser-small",
      "furniture1-dresser-small-side",
    ],
    stateItemIds: [],
    displayItemId: "furniture1-dresser-small",
  },
  {
    id: "fireplace",
    category: "furniture",
    orientationItemIds: [],
    stateItemIds: ["furniture1-fireplace", "furniture2-fireplace-lit"],
    displayItemId: "furniture1-fireplace",
  },
  {
    id: "fridge",
    category: "furniture",
    orientationItemIds: [],
    stateItemIds: ["furniture1-fridge", "furniture2-fridge-open"],
    displayItemId: "furniture1-fridge",
  },
  {
    id: "ironing-board",
    category: "furniture",
    orientationItemIds: [],
    stateItemIds: ["furniture1-ironing-board", "furniture2-ironing-board-full"],
    displayItemId: "furniture1-ironing-board",
  },
  {
    id: "kitchen-counter",
    category: "furniture",
    orientationItemIds: [],
    stateItemIds: [
      "furniture1-kitchen-counter",
      "furniture2-kitchen-counter-on",
    ],
    displayItemId: "furniture1-kitchen-counter",
  },
  {
    id: "lamp",
    category: "furniture",
    orientationItemIds: [],
    stateItemIds: ["furniture1-lamp", "furniture2-lamp-lit"],
    displayItemId: "furniture1-lamp",
  },
  {
    id: "lamp-sm",
    category: "furniture",
    orientationItemIds: [],
    stateItemIds: ["furniture1-lamp-sm", "furniture2-lamp-sm-lit"],
    displayItemId: "furniture1-lamp-sm",
  },
  {
    id: "rack",
    category: "furniture",
    orientationItemIds: [],
    stateItemIds: ["furniture1-rack", "furniture2-rack-full"],
    displayItemId: "furniture1-rack",
  },
  {
    id: "rug-diamond",
    category: "furniture",
    orientationItemIds: [
      "furniture1-rug-diamond-down",
      "furniture1-rug-diamond-side",
    ],
    stateItemIds: [],
    displayItemId: "furniture1-rug-diamond-down",
  },
  {
    id: "rug",
    category: "furniture",
    orientationItemIds: ["furniture1-rug-down", "furniture1-rug-side"],
    stateItemIds: [],
    displayItemId: "furniture1-rug-down",
  },
  {
    id: "rug-green",
    category: "furniture",
    orientationItemIds: [
      "furniture2-rug-green",
      "furniture2-rug-green-down",
      "furniture2-rug-green-side",
    ],
    stateItemIds: [],
    displayItemId: "furniture2-rug-green",
  },
  {
    id: "sink",
    category: "furniture",
    orientationItemIds: [],
    stateItemIds: ["furniture1-sink", "furniture2-sink-on"],
    displayItemId: "furniture1-sink",
  },
  {
    id: "sofa-lg",
    category: "furniture",
    orientationItemIds: [
      "furniture1-sofa-lg",
      "furniture1-sofa-lg-side",
      "furniture1-sofa-lg-back",
    ],
    stateItemIds: [],
    displayItemId: "furniture1-sofa-lg",
  },
  {
    id: "sofa-sm",
    category: "furniture",
    orientationItemIds: [
      "furniture1-sofa-sm",
      "furniture1-sofa-sm-side",
      "furniture1-sofa-sm-back",
    ],
    stateItemIds: [],
    displayItemId: "furniture1-sofa-sm",
  },
  {
    id: "stove",
    category: "furniture",
    orientationItemIds: [],
    stateItemIds: ["furniture1-stove", "furniture2-stove-on"],
    displayItemId: "furniture1-stove",
  },
  {
    id: "table-lg",
    category: "furniture",
    orientationItemIds: ["furniture1-table-lg", "furniture1-table-lg-side"],
    stateItemIds: [],
    displayItemId: "furniture1-table-lg",
  },
  {
    id: "toilet",
    category: "furniture",
    orientationItemIds: ["furniture1-toilet", "furniture1-toilet-side"],
    stateItemIds: [
      "furniture1-toilet",
      "furniture1-toilet-side",
      "furniture2-toilet-full",
      "furniture2-toilet-side-full",
    ],
    displayItemId: "furniture1-toilet",
  },
  {
    id: "book",
    category: "smallitem",
    orientationItemIds: [],
    stateItemIds: ["smallitems-book", "smallitems-book-open"],
    displayItemId: "smallitems-book",
  },
  {
    id: "cup",
    category: "smallitem",
    orientationItemIds: [],
    stateItemIds: [
      "smallitems-cup",
      "smallitems-cup-coffee",
      "smallitems-cup-hot-choco",
      "smallitems-cup-tea",
    ],
    displayItemId: "smallitems-cup",
  },
  {
    id: "glass",
    category: "smallitem",
    orientationItemIds: [],
    stateItemIds: [
      "smallitems-glass",
      "smallitems-glass-full-01",
      "smallitems-glass-full-02",
      "smallitems-glass-full-03",
    ],
    displayItemId: "smallitems-glass",
  },
  {
    id: "pan",
    category: "smallitem",
    orientationItemIds: [],
    stateItemIds: [
      "smallitems-pan",
      "smallitems-pan-eggs",
      "smallitems-pan-meat",
      "smallitems-pan-veggies",
    ],
    displayItemId: "smallitems-pan",
  },
  {
    id: "pet-dish",
    category: "smallitem",
    orientationItemIds: [],
    stateItemIds: [
      "smallitems-pet-dish",
      "smallitems-pet-dish-food",
      "smallitems-pet-dish-water",
    ],
    displayItemId: "smallitems-pet-dish",
  },
  {
    id: "plate",
    category: "smallitem",
    orientationItemIds: [],
    stateItemIds: [
      "smallitems-plate",
      "smallitems-plate-full-01",
      "smallitems-plate-full-02",
      "smallitems-plate-full-03",
    ],
    displayItemId: "smallitems-plate",
  },
  {
    id: "pot",
    category: "smallitem",
    orientationItemIds: [],
    stateItemIds: [
      "smallitems-pot",
      "smallitems-pot-full-01",
      "smallitems-pot-full-02",
      "smallitems-pot-full-03",
    ],
    displayItemId: "smallitems-pot",
  },
  {
    id: "toilet-paper",
    category: "smallitem",
    orientationItemIds: [
      "smallitems-toilet-paper",
      "smallitems-toilet-paper-back",
    ],
    stateItemIds: [],
    displayItemId: "smallitems-toilet-paper",
  },
  {
    id: "wineglass",
    category: "smallitem",
    orientationItemIds: [],
    stateItemIds: [
      "smallitems-wineglass",
      "smallitems-wineglass-full-01",
      "smallitems-wineglass-full-02",
      "smallitems-wineglass-full-03",
    ],
    displayItemId: "smallitems-wineglass",
  },
] as const;

export const SHOP_ITEM_VARIANT_GROUPS: readonly ShopItemVariantGroup[] =
  SHOP_ITEM_VARIANT_GROUP_SEEDS;

export const SHOP_ITEM_VARIANTS: readonly ShopItemVariant[] =
  SHOP_ITEM_VARIANT_GROUPS.flatMap((group) => {
    const seen = new Set<string>();
    const entries: ShopItemVariant[] = [];
    for (const itemId of group.orientationItemIds) {
      if (seen.has(itemId)) continue;
      seen.add(itemId);
      entries.push({
        groupId: group.id,
        itemId,
        kind: "orientation",
        displayItemId: group.displayItemId,
      });
    }
    for (const itemId of group.stateItemIds) {
      if (seen.has(itemId)) continue;
      seen.add(itemId);
      entries.push({
        groupId: group.id,
        itemId,
        kind: "state",
        displayItemId: group.displayItemId,
      });
    }
    return entries;
  });

const SHOP_ITEM_BY_ID = new Map(SHOP_ITEMS.map((item) => [item.id, item]));
const FURNITURE_1_BY_SLUG = new Map(
  SHOP_ITEMS.filter((item) => item.id.startsWith("furniture1-")).map((item) => [
    item.id.slice("furniture1-".length),
    item,
  ]),
);
const DUPLICATE_FURNITURE_DISPLAY_ITEMS = SHOP_ITEMS.flatMap((item) => {
  if (!item.id.startsWith("furniture2-")) return [];
  const matchingFurniture1 = FURNITURE_1_BY_SLUG.get(
    item.id.slice("furniture2-".length),
  );
  return matchingFurniture1
    ? ([[item.id, matchingFurniture1.id]] as const)
    : [];
});
const DISPLAY_ITEM_ID_BY_VARIANT = new Map(
  [
    ...SHOP_ITEM_VARIANTS.map((variant) => [
      variant.itemId,
      variant.displayItemId,
    ] as const),
    ...DUPLICATE_FURNITURE_DISPLAY_ITEMS,
  ],
);

const VARIANT_GROUP_BY_ITEM_ID = new Map<string, ShopItemVariantGroup>();
for (const group of SHOP_ITEM_VARIANT_GROUPS) {
  for (const itemId of [
    ...group.orientationItemIds,
    ...group.stateItemIds,
    group.displayItemId,
  ]) {
    VARIANT_GROUP_BY_ITEM_ID.set(itemId, group);
  }
}

const SHOP_ITEM_BY_ASSET_PATH = new Map(
  SHOP_ITEMS.flatMap((item) => [
    [item.assetPath, item] as const,
    [item.assetPath.replace(/^\/assets/, ""), item] as const,
  ]),
);

function normalizeShopAssetPath(assetPath: string): string {
  let path = assetPath.trim();
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep the raw path if it wasn't URI-encoded.
  }
  if (path.startsWith("/assets/")) return path;
  if (path.startsWith("assets/")) return `/${path}`;
  if (path.startsWith("/")) return `/assets${path}`;
  return `/assets/${path}`;
}

function resolveDisplayItemId(itemId: string): string {
  let current = itemId;
  const seen = new Set<string>();
  while (DISPLAY_ITEM_ID_BY_VARIANT.has(current) && !seen.has(current)) {
    seen.add(current);
    const next = DISPLAY_ITEM_ID_BY_VARIANT.get(current);
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

const GROUP_MEMBERS_BY_ID = new Map(
  SHOP_ITEM_VARIANT_GROUPS.map((group) => {
    const ids = new Set([
      ...group.orientationItemIds,
      ...group.stateItemIds,
      group.displayItemId,
    ]);
    for (const [duplicateId, displayId] of DUPLICATE_FURNITURE_DISPLAY_ITEMS) {
      if (ids.has(resolveDisplayItemId(displayId))) ids.add(duplicateId);
    }
    return [
      group.id,
      [...ids].flatMap((itemId) => {
        const item = SHOP_ITEM_BY_ID.get(itemId);
        return item ? [item] : [];
      }),
    ] as const;
  }),
);

export function getShopItemById(itemId: string): ShopItem | undefined {
  return SHOP_ITEM_BY_ID.get(itemId);
}

export function getShopItemByAssetPath(
  assetPath: string,
): ShopItem | undefined {
  return SHOP_ITEM_BY_ASSET_PATH.get(normalizeShopAssetPath(assetPath));
}

export function getShopDisplayItemId(item: ShopItem): string {
  return resolveDisplayItemId(item.id);
}

export function getShopDisplayItem(item: ShopItem): ShopItem {
  return SHOP_ITEM_BY_ID.get(getShopDisplayItemId(item)) ?? item;
}

export function getShopDisplayAssetPath(item: ShopItem): string {
  return getShopDisplayItem(item).assetPath;
}

export function getShopVariantGroup(
  item: ShopItem,
): ShopItemVariantGroup | undefined {
  const direct = VARIANT_GROUP_BY_ITEM_ID.get(item.id);
  if (direct) return direct;
  return VARIANT_GROUP_BY_ITEM_ID.get(getShopDisplayItemId(item));
}

function groupMembers(group: ShopItemVariantGroup): readonly ShopItem[] {
  return GROUP_MEMBERS_BY_ID.get(group.id) ?? [];
}

function findVariantAsset(
  group: ShopItemVariantGroup,
  orientation: ShopOrientation,
  state: string,
): ShopItem | undefined {
  const members = groupMembers(group);
  const exact = members.find((member) => {
    const parts = getShopItemParts(member);
    return parts.orientation === orientation && parts.state === state;
  });
  if (exact) return exact;
  return members.find((member) => {
    const parts = getShopItemParts(member);
    return parts.orientation === orientation && parts.state === "default";
  });
}

export function getShopOrientationItems(item: ShopItem): readonly ShopItem[] {
  const group = getShopVariantGroup(item);
  if (!group || group.orientationItemIds.length < 2) return [];

  // Orientation-only groups keep their declared front → side → back order.
  if (group.stateItemIds.length === 0) {
    return group.orientationItemIds.flatMap((itemId) => {
      const orientationItem = SHOP_ITEM_BY_ID.get(itemId);
      return orientationItem ? [orientationItem] : [];
    });
  }

  // Groups with both facing and state (e.g. toilet) preserve the current state.
  const current = getShopItemParts(item);
  const members = groupMembers(group);
  const byOrientation = new Map<ShopOrientation, ShopItem>();

  for (const orientation of ORIENTATION_ORDER) {
    const match =
      members.find((member) => {
        const parts = getShopItemParts(member);
        return (
          parts.orientation === orientation && parts.state === current.state
        );
      }) ??
      members.find((member) => {
        const parts = getShopItemParts(member);
        return parts.orientation === orientation && parts.state === "default";
      });
    if (match) byOrientation.set(orientation, match);
  }

  if (byOrientation.size >= 2) {
    return ORIENTATION_ORDER.flatMap((orientation) => {
      const match = byOrientation.get(orientation);
      return match ? [match] : [];
    });
  }

  return group.orientationItemIds.flatMap((itemId) => {
    const orientationItem = SHOP_ITEM_BY_ID.get(itemId);
    return orientationItem ? [orientationItem] : [];
  });
}

export function rotateShopItemAssetPath(
  assetPath: string,
  direction: -1 | 1,
): string {
  const item = getShopItemByAssetPath(assetPath);
  if (!item) return assetPath;
  const orientations = getShopOrientationItems(item);
  if (orientations.length < 2) return assetPath;

  // Prefer exact sprite match so we never skip -side when front/back share a
  // similar silhouette or when aliasing remaps base slugs.
  let currentIndex = orientations.findIndex(
    (orientation) =>
      orientation.id === item.id || orientation.assetPath === item.assetPath,
  );
  if (currentIndex < 0) {
    const currentParts = getShopItemParts(item);
    currentIndex = orientations.findIndex((orientation) => {
      const parts = getShopItemParts(orientation);
      return parts.orientation === currentParts.orientation;
    });
  }
  const nextIndex =
    (Math.max(0, currentIndex) + direction + orientations.length) %
    orientations.length;
  return orientations[nextIndex]?.assetPath ?? assetPath;
}

/** Prefer a state change that keeps the current facing when possible. */
export function resolveShopStateAssetPath(
  currentAssetPath: string,
  targetAssetPath: string,
): string {
  const current = getShopItemByAssetPath(currentAssetPath);
  const target = getShopItemByAssetPath(targetAssetPath);
  if (!current || !target) return targetAssetPath;

  const group = getShopVariantGroup(current);
  if (!group) return targetAssetPath;

  const currentParts = getShopItemParts(current);
  const targetParts = getShopItemParts(target);
  if (currentParts.orientation === targetParts.orientation) {
    return targetAssetPath;
  }

  const preserved = findVariantAsset(
    group,
    currentParts.orientation,
    targetParts.state,
  );
  return preserved?.assetPath ?? targetAssetPath;
}

export const SHOP_CANONICAL_ITEMS: readonly ShopItem[] = SHOP_ITEMS.filter(
  (item) => getShopDisplayItemId(item) === item.id,
);

export const SHOP_ITEM_GROUPS: readonly {
  category: ShopCategory;
  label: string;
  items: readonly ShopItem[];
}[] = [
  {
    category: "furniture",
    label: "Furniture",
    items: SHOP_CANONICAL_ITEMS.filter((item) => item.category === "furniture"),
  },
  {
    category: "smallitem",
    label: "Small items",
    items: SHOP_CANONICAL_ITEMS.filter(
      (item) => item.category === "smallitem",
    ),
  },
];

/** Furniture tops that can hold small items (cups, pans, plates, …). */
const SURFACE_BASE_SLUGS = new Set([
  "kitchen-counter",
  "table-lg",
  "table-md",
  "table-sm",
]);

export function isShopSmallItem(assetPath: string): boolean {
  const item = getShopItemByAssetPath(assetPath);
  if (item) return item.category === "smallitem";
  return normalizeShopAssetPath(assetPath).includes("/smallitems/");
}

export function isSurfaceFurniture(assetPath: string): boolean {
  const item = getShopItemByAssetPath(assetPath);
  if (item) return SURFACE_BASE_SLUGS.has(getShopItemParts(item).baseSlug);

  const match = normalizeShopAssetPath(assetPath).match(
    /^\/assets\/[^/]+\/(.+)\.png$/,
  );
  if (!match?.[1]) return false;
  let slug = match[1];
  for (const suffix of STATE_SUFFIXES) {
    if (slug.endsWith(`-${suffix}`)) {
      slug = slug.slice(0, -(suffix.length + 1));
      break;
    }
  }
  if (slug.endsWith("-side")) slug = slug.slice(0, -5);
  return SURFACE_BASE_SLUGS.has(slug);
}
