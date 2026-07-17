export type MapRegion = 1 | 2 | 3 | 4;

export type TileRole = "wall" | "floor";

export type AtlasTile = {
  fileName: string;
  label: number;
  region: MapRegion;
  role: TileRole;
  sheetColumn: number;
  sheetRow: number;
};

export type LayoutZone = {
  mark: string;
  name: string;
  note: string;
  region: MapRegion;
  height: number;
  width: number;
  x: number;
  y: number;
};

export type MapLayoutTemplate = {
  description: string;
  id: "layout-00" | "layout-01" | "layout-02";
  name: string;
  zones: LayoutZone[];
};

export type PlacedMapTile = AtlasTile & {
  zoneName: string;
  x: number;
  y: number;
};

export * from "./editor";

export const SHEET_COLUMNS = 18;
export const SHEET_ROWS = 9;
export const TILE_SOURCE_SIZE = 16;

export const WALL_ROWS = [1, 2, 3, 4, 5] as const;
export const FLOOR_ROWS = [6, 7, 8, 9] as const;

const LAYOUT_WALL_ROWS = [2, 3, 4, 5] as const;
const LAYOUT_FLOOR_ROWS = [6, 7, 8] as const;
const SOLID_REGION_COLUMNS: Record<MapRegion, number[]> = {
  1: [2, 3, 4, 5],
  2: [6, 7, 8, 9],
  3: [10, 11, 12, 13],
  4: [14, 15, 16, 17],
};
const RESERVED_DETAIL_LABELS = new Set([124]);

export const REGION_COLUMNS: Record<MapRegion, number[]> = {
  1: [1, 2, 3, 4, 5],
  2: [6, 7, 8, 9],
  3: [10, 11, 12, 13],
  4: [14, 15, 16, 17, 18],
};

export const REGION_NOTES: Record<MapRegion, string> = {
  1: "left end border",
  2: "middle-safe span",
  3: "middle-safe span",
  4: "right end border",
};

export const MAP_LAYOUT_TEMPLATES: MapLayoutTemplate[] = [
  {
    id: "layout-00",
    name: "Layout 00",
    description:
      "Three defined rooms: two upper rooms connected by a hall, with a lower room connected by a vertical path.",
    zones: [
      {
        mark: "A",
        name: "west room",
        note: "Rectangular room connected to the upper hall.",
        region: 2,
        x: 2,
        y: 2,
        width: 14,
        height: 11,
      },
      {
        mark: "B",
        name: "east room",
        note: "Rectangular room connected to the upper hall.",
        region: 2,
        x: 24,
        y: 2,
        width: 15,
        height: 11,
      },
      {
        mark: "H",
        name: "upper connector",
        note: "Straight rectangular hall joining west and east rooms.",
        region: 2,
        x: 16,
        y: 5,
        width: 8,
        height: 7,
      },
      {
        mark: "V",
        name: "vertical connector",
        note: "Straight rectangular path down to the lower room.",
        region: 2,
        x: 19,
        y: 12,
        width: 7,
        height: 7,
      },
      {
        mark: "C",
        name: "lower room",
        note: "Large rectangular room connected through the vertical path.",
        region: 2,
        x: 12,
        y: 19,
        width: 22,
        height: 11,
      },
    ],
  },
  {
    id: "layout-01",
    name: "Layout 01",
    description:
      "Four defined rooms around a central negative space, connected by straight halls.",
    zones: [
      {
        mark: "A",
        name: "northwest room",
        note: "Rectangular room in the upper-left.",
        region: 3,
        x: 2,
        y: 2,
        width: 13,
        height: 10,
      },
      {
        mark: "B",
        name: "northeast room",
        note: "Rectangular room in the upper-right.",
        region: 3,
        x: 28,
        y: 2,
        width: 14,
        height: 10,
      },
      {
        mark: "N",
        name: "north hall",
        note: "Straight hall connecting the two upper rooms.",
        region: 3,
        x: 15,
        y: 5,
        width: 13,
        height: 6,
      },
      {
        mark: "W",
        name: "west hall",
        note: "Straight vertical hall down from the northwest room.",
        region: 3,
        x: 8,
        y: 12,
        width: 6,
        height: 12,
      },
      {
        mark: "E",
        name: "east hall",
        note: "Straight vertical hall down from the northeast room.",
        region: 3,
        x: 32,
        y: 12,
        width: 6,
        height: 12,
      },
      {
        mark: "S",
        name: "south hall",
        note: "Straight hall connecting the lower rooms.",
        region: 3,
        x: 14,
        y: 21,
        width: 18,
        height: 6,
      },
      {
        mark: "C",
        name: "southwest room",
        note: "Rectangular room in the lower-left.",
        region: 3,
        x: 2,
        y: 24,
        width: 16,
        height: 10,
      },
      {
        mark: "D",
        name: "southeast room",
        note: "Rectangular room in the lower-right.",
        region: 3,
        x: 28,
        y: 24,
        width: 16,
        height: 10,
      },
    ],
  },
  {
    id: "layout-02",
    name: "Layout 02",
    description:
      "Four regular rectangular rooms connected by straight upper, vertical, and lower hall paths.",
    zones: [
      {
        mark: "A",
        name: "northwest room",
        note: "Rectangular upper-left room using region 1.",
        region: 1,
        x: 2,
        y: 2,
        width: 14,
        height: 10,
      },
      {
        mark: "B",
        name: "northeast room",
        note: "Rectangular upper-right room using region 4.",
        region: 4,
        x: 28,
        y: 2,
        width: 14,
        height: 10,
      },
      {
        mark: "H",
        name: "upper hall",
        note: "Straight hall connecting the two upper rooms.",
        region: 2,
        x: 16,
        y: 5,
        width: 12,
        height: 5,
      },
      {
        mark: "C",
        name: "southwest room",
        note: "Rectangular lower-left room using region 3.",
        region: 3,
        x: 8,
        y: 22,
        width: 16,
        height: 10,
      },
      {
        mark: "V",
        name: "vertical hall",
        note: "Straight path from upper hall to the lower rooms.",
        region: 2,
        x: 21,
        y: 10,
        width: 7,
        height: 12,
      },
      {
        mark: "D",
        name: "southeast room",
        note: "Rectangular lower-right room using region 2.",
        region: 2,
        x: 30,
        y: 22,
        width: 16,
        height: 10,
      },
      {
        mark: "S",
        name: "lower hall",
        note: "Straight hall joining the two lower rooms.",
        region: 2,
        x: 24,
        y: 25,
        width: 6,
        height: 5,
      },
    ],
  },
];

export function buildAtlasGrid() {
  return Array.from({ length: SHEET_ROWS }, (_, rowIndex) =>
    Array.from({ length: SHEET_COLUMNS }, (_, columnIndex) =>
      atlasTileForPosition(rowIndex + 1, columnIndex + 1),
    ),
  );
}

export function buildLayoutTiles(layout: MapLayoutTemplate): PlacedMapTile[] {
  const rows = buildLayoutRows(layout);
  const zones = new Map(layout.zones.map((zone) => [zone.mark, zone]));

  return rows.flatMap((row, rowIndex) =>
    [...row].flatMap((mark, columnIndex): PlacedMapTile[] => {
      const zone = zones.get(mark);

      if (!zone) {
        return [];
      }

      const x = columnIndex + 1;
      const y = rowIndex + 1;
      const verticalDepth = verticalDepthFromSegmentTop(rows, rowIndex, columnIndex);
      const role: TileRole =
        verticalDepth < LAYOUT_WALL_ROWS.length ? "wall" : "floor";
      const region = regionForLayoutCell(zone.region);
      const tile = fillTileForLayoutCell(
        role,
        region,
        verticalDepth,
        columnIndex,
      );

      return [
        {
          ...tile,
          region,
          role,
          zoneName: zone.name,
          x,
          y,
        },
      ];
    }),
  );
}

export function layoutColumnCount(layout: MapLayoutTemplate) {
  return Math.max(...layout.zones.map((zone) => zone.x + zone.width - 1));
}

export function layoutRowCount(layout: MapLayoutTemplate) {
  return Math.max(...layout.zones.map((zone) => zone.y + zone.height - 1));
}

export function fileNameForSheetLabel(label: number) {
  return `${String(label).padStart(2, "0")}.png`;
}

export function labelForSheetPosition(sheetRow: number, sheetColumn: number) {
  return (sheetRow - 1) * SHEET_COLUMNS + sheetColumn;
}

export function regionForSheetColumn(sheetColumn: number): MapRegion {
  if (sheetColumn <= 5) {
    return 1;
  }

  if (sheetColumn <= 9) {
    return 2;
  }

  if (sheetColumn <= 13) {
    return 3;
  }

  return 4;
}

export function roleForSheetRow(sheetRow: number): TileRole {
  return sheetRow <= WALL_ROWS[WALL_ROWS.length - 1] ? "wall" : "floor";
}

function atlasTileForPosition(sheetRow: number, sheetColumn: number): AtlasTile {
  const label = labelForSheetPosition(sheetRow, sheetColumn);

  return {
    fileName: fileNameForSheetLabel(label),
    label,
    region: regionForSheetColumn(sheetColumn),
    role: roleForSheetRow(sheetRow),
    sheetColumn,
    sheetRow,
  };
}

function isOccupied(rows: string[], rowIndex: number, columnIndex: number) {
  return rows[rowIndex]?.[columnIndex] !== undefined
    ? rows[rowIndex][columnIndex] !== " "
    : false;
}

function normalizeLayoutRows(rows: string[]) {
  const columns = Math.max(...rows.map((row) => row.length));

  return rows.map((row) => row.padEnd(columns, " "));
}

function buildLayoutRows(layout: MapLayoutTemplate) {
  const columns = layoutColumnCount(layout);
  const rows = layoutRowCount(layout);
  const cells = Array.from({ length: rows }, () => Array(columns).fill(" "));

  for (const zone of layout.zones) {
    for (let y = zone.y - 1; y < zone.y - 1 + zone.height; y += 1) {
      for (let x = zone.x - 1; x < zone.x - 1 + zone.width; x += 1) {
        cells[y][x] = zone.mark;
      }
    }
  }

  return normalizeLayoutRows(cells.map((row) => row.join("")));
}

function regionForLayoutCell(
  zoneRegion: MapRegion,
): MapRegion {
  return zoneRegion;
}

function verticalDepthFromSegmentTop(
  rows: string[],
  rowIndex: number,
  columnIndex: number,
) {
  let depth = 0;

  for (let y = rowIndex - 1; y >= 0; y -= 1) {
    if (!isOccupied(rows, y, columnIndex)) {
      break;
    }

    depth += 1;
  }

  return depth;
}

function fillTileForLayoutCell(
  role: TileRole,
  region: MapRegion,
  verticalDepth: number,
  columnIndex: number,
) {
  const rows = role === "wall" ? LAYOUT_WALL_ROWS : LAYOUT_FLOOR_ROWS;
  const depth =
    role === "wall" ? verticalDepth : verticalDepth - LAYOUT_WALL_ROWS.length;
  const sheetRow = rows[depth % rows.length];
  const columns = SOLID_REGION_COLUMNS[region].filter(
    (column) =>
      !RESERVED_DETAIL_LABELS.has(labelForSheetPosition(sheetRow, column)),
  );
  const sheetColumn = columns[columnIndex % columns.length];

  return atlasTileForPosition(sheetRow, sheetColumn);
}
