"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogAsset, MapAsset } from "@/lib/map/asset-catalog";
import { PLAYER_SPEED } from "@/lib/game/config";
import { DEMO_MAP } from "@/lib/map/map-data";
import { DEFAULT_ANIMATION_PLAYBACK } from "@/lib/map/animation-data";
import PlayerPickerPanel from "./PlayerPickerPanel";

// Character sheets use 32px cells, while the environment tiles and buildings
// are authored on the library's 16px tile grid.
const WORLD_PIXEL_SCALE = DEMO_MAP.tileSize / 32;
const ENVIRONMENT_PIXEL_SCALE = DEMO_MAP.tileSize / 16;
const BUILDING_PIXEL_SCALE = ENVIRONMENT_PIXEL_SCALE;

const MAP_TILE_PATHS = {
  grass: "/Cute_Fantasy/Tiles/Grass/Grass_1_Middle.png",
  grass2: "/Cute_Fantasy/Tiles/Grass/Grass_2_Middle.png",
  grass3: "/Cute_Fantasy/Tiles/Grass/Grass_3_Middle.png",
  path: "/Cute_Fantasy/Tiles/Grass/Path_Middle.png",
  water: "/Cute_Fantasy/Tiles/Water/Water_Middle.png",
  stone: "/Cute_Fantasy/Tiles/Cave/Cave_Floor_Middle.png",
} as const;

const SCENERY_IMAGE_PATHS = {
  barn: "/Cute_Fantasy/Buildings/Buildings/Unique_Buildings/Barn/Barn_Base_Red.png",
  blacksmith: "/Cute_Fantasy/Buildings/Buildings/Unique_Buildings/Blacksmith_House/Blacksmith_House_Black.png",
  houseRed: "/Cute_Fantasy/Buildings/Buildings/Houses/Wood/House_2_Wood_Base_Red.png",
  houseTeal: "/Cute_Fantasy/Buildings/Buildings/Houses/Wood/House_4_Wood_Green_Blue.png",
  inn: "/Cute_Fantasy/Buildings/Buildings/Unique_Buildings/Inn/Inn_Blue.png",
  shed: "/Cute_Fantasy/Buildings/Buildings/Unique_Buildings/Shed/Shed_Base_Blue.png",
  well: "/Cute_Fantasy/Outdoor decoration/Well.png",
} as const;

const TREE_SHEET_PATHS = {
  oakBig: "/Cute_Fantasy/Trees/Big_Oak_Tree.png",
} as const;

const ASSET_DISCOVERY_PROGRESS = 0.35;

const BUILDINGS = [
  { key: "houseRed", col: 15.4, row: 17.2 },
  { key: "shed", col: 22.4, row: 15.6 },
  { key: "inn", col: 34.4, row: 18.2 },
  { key: "barn", col: 15.2, row: 30.4 },
  { key: "blacksmith", col: 33.8, row: 30.1 },
  { key: "houseTeal", col: 42.2, row: 25.6 },
] as const;

const OAK_TREES = [
  { col: 4, row: 7, frame: 1 },
  { col: 7, row: 9, frame: 1 },
  { col: 14, row: 8, frame: 1 },
  { col: 22, row: 7, frame: 1 },
  { col: 31, row: 7, frame: 1 },
  { col: 43, row: 9, frame: 1 },
  { col: 7, row: 18, frame: 1 },
  { col: 19, row: 18, frame: 1 },
  { col: 42, row: 19, frame: 1 },
  { col: 4, row: 23, frame: 1 },
  { col: 24, row: 25, frame: 1 },
  { col: 44, row: 27, frame: 1 },
  { col: 21, row: 33, frame: 1 },
  { col: 29, row: 34, frame: 1 },
  { col: 42, row: 33, frame: 1 },
] as const;

const SCENE_SOLID_CELLS = [
  ...rectCells(10, 19, 10, 17),
  ...rectCells(20, 25, 11, 15),
  ...rectCells(27, 41, 9, 18),
  ...rectCells(12, 18, 27, 30),
  ...rectCells(28, 38, 24, 30),
  ...rectCells(38, 46, 21, 25),
];

function rectCells(fromCol: number, toCol: number, fromRow: number, toRow: number) {
  const cells: string[] = [];
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let col = fromCol; col <= toCol; col += 1) cells.push(`${col},${row}`);
  }
  return cells;
}

export default function TopDownMap({ assets }: { assets: MapAsset[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mapAssets, setMapAssets] = useState<MapAsset[]>(assets);
  const [catalogAssets, setCatalogAssets] = useState<CatalogAsset[]>(assets);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingLabel, setLoadingLabel] = useState("discovering assets");
  useEffect(() => {
    let active = true;
    setLoadingProgress(0.05);
    setLoadingLabel("discovering assets");
    const progressTimer = window.setInterval(() => {
      setLoadingProgress((progress) => Math.min(ASSET_DISCOVERY_PROGRESS - 0.01, progress + (ASSET_DISCOVERY_PROGRESS - progress) * 0.14));
    }, 120);
    fetch("/api/map/assets")
      .then((response) => response.ok ? response.json() as Promise<{ assets: CatalogAsset[]; mapAssets: MapAsset[] }> : { assets: [], mapAssets: [] })
      .then((next) => {
        if (active) {
          window.clearInterval(progressTimer);
          setLoadingProgress(ASSET_DISCOVERY_PROGRESS);
          setLoadingLabel("loading sprite sheets");
          setCatalogAssets(next.assets);
          setMapAssets(next.mapAssets);
        }
      })
      .catch(() => {
        if (active) {
          window.clearInterval(progressTimer);
          setLoadingLabel("could not discover assets");
        }
      });
    return () => {
      active = false;
      window.clearInterval(progressTimer);
    };
  }, []);
  useEffect(() => {
    let game: { destroy: (removeCanvas: boolean) => void } | undefined;
    let cancelled = false;
    async function start() {
      const Phaser = (await import("phaser")).default;
      if (cancelled || !hostRef.current) return;
      if (!mapAssets.length) return;
      const assetByKey = new Map(mapAssets.map((asset) => [asset.key, asset]));
      const flipForMovement = (asset: MapAsset, movement: "left" | "right") => asset.entityKind === "being" && asset.orientation ? movement !== asset.orientation : false;
      class MapScene extends Phaser.Scene {
        private player!: Phaser.GameObjects.Sprite;
        private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
        private keys!: Record<string, Phaser.Input.Keyboard.Key>;
        private lastMoveAt = 0;
        private isMoving = false;
        private playerDirection: "down" | "right" | "up" = "down";
        private solidCells = new Set([...SCENE_SOLID_CELLS, ...DEMO_MAP.entities.filter((entity) => entity.solid).map((entity) => `${entity.col},${entity.row}`)]);
        constructor() { super("map"); }
        preload() {
          this.load.on("start", () => {
            if (!cancelled) {
              setLoadingLabel("loading sprite sheets");
              setLoadingProgress(ASSET_DISCOVERY_PROGRESS);
            }
          });
          this.load.on("progress", (value: number) => {
            if (!cancelled) setLoadingProgress(ASSET_DISCOVERY_PROGRESS + value * (1 - ASSET_DISCOVERY_PROGRESS));
          });
          this.load.on("complete", () => {
            if (!cancelled) {
              setLoadingLabel("drawing map");
              setLoadingProgress(0.98);
            }
          });
          for (const asset of mapAssets) this.load.spritesheet(asset.key, asset.path, { frameWidth: asset.frameWidth, frameHeight: asset.frameHeight });
          for (const [key, assetPath] of Object.entries(MAP_TILE_PATHS)) this.load.image(`map-tile-${key}`, assetPath);
          for (const [key, assetPath] of Object.entries(SCENERY_IMAGE_PATHS)) this.load.image(`scenery-${key}`, assetPath);
          this.load.spritesheet("tree-oak-big", TREE_SHEET_PATHS.oakBig, { frameWidth: 48, frameHeight: 48 });
        }
        create() {
          if (!cancelled) {
            setLoadingLabel("drawing map");
            setLoadingProgress(1);
            window.setTimeout(() => {
              if (!cancelled) setLoading(false);
            }, 120);
          }
          this.cameras.main.setBackgroundColor("#122d2c");
          this.cursors = this.input.keyboard!.createCursorKeys();
          this.keys = this.input.keyboard!.addKeys("W,A,S,D") as Record<string, Phaser.Input.Keyboard.Key>;
          DEMO_MAP.tiles.forEach((tile, index) => {
            const col = index % DEMO_MAP.width;
            const row = Math.floor(index / DEMO_MAP.width);
            this.add.image((col + 0.5) * DEMO_MAP.tileSize, (row + 0.5) * DEMO_MAP.tileSize, `map-tile-${tile}`).setDisplaySize(DEMO_MAP.tileSize, DEMO_MAP.tileSize).setDepth(row * DEMO_MAP.tileSize);
          });
          for (const asset of mapAssets) for (const animation of asset.animations) if (asset.preview === "animation" && animation.frames.length > 0 && !this.anims.exists(animation.key)) this.anims.create({ key: animation.key, frames: animation.frames.map((frame) => ({ key: asset.key, frame: frame.row * asset.columns + frame.column })), frameRate: animation.playback?.frameRate ?? DEFAULT_ANIMATION_PLAYBACK.frameRate, repeat: animation.playback?.repeat ?? DEFAULT_ANIMATION_PLAYBACK.repeat });
          for (const tree of OAK_TREES) {
            const sprite = this.add.sprite((tree.col + 0.5) * DEMO_MAP.tileSize, (tree.row + 1) * DEMO_MAP.tileSize, "tree-oak-big", tree.frame).setOrigin(0.5, 1).setScale(ENVIRONMENT_PIXEL_SCALE);
            sprite.setDepth(sprite.y);
          }
          for (const building of BUILDINGS) {
            const image = this.add.image((building.col + 0.5) * DEMO_MAP.tileSize, (building.row + 1) * DEMO_MAP.tileSize, `scenery-${building.key}`).setOrigin(0.5, 1).setScale(BUILDING_PIXEL_SCALE);
            image.setDepth(image.y);
          }
          const well = this.add.image((26.8 + 0.5) * DEMO_MAP.tileSize, (17.9 + 1) * DEMO_MAP.tileSize, "scenery-well").setOrigin(0.5, 1).setScale(ENVIRONMENT_PIXEL_SCALE);
          well.setDepth(well.y);
          const playerEntity = DEMO_MAP.entities.find((entity) => entity.id === "player")!;
          this.player = this.add.sprite((playerEntity.col + 0.5) * DEMO_MAP.tileSize, (playerEntity.row + 0.5) * DEMO_MAP.tileSize, "player-base", 0);
          this.player.setScale(WORLD_PIXEL_SCALE).setDepth(this.player.y);
          this.player.play("player-idle-down");
          for (const entity of DEMO_MAP.entities.filter((item) => item.id !== "player")) {
            const asset = assetByKey.get(entity.assetKey);
            if (!asset) continue;
            const initialFrame = entity.animationKey ? 0 : asset.entityKind === "object" ? entity.frame : 0;
            const scale = asset.entityKind === "object" ? ENVIRONMENT_PIXEL_SCALE : WORLD_PIXEL_SCALE;
            const sprite = this.add.sprite((entity.col + 0.5) * DEMO_MAP.tileSize, (entity.row + 0.5) * DEMO_MAP.tileSize, asset.key, initialFrame).setScale(scale).setDepth((entity.row + 0.5) * DEMO_MAP.tileSize);
            const animation = entity.animationKey ? asset.animations.find((item) => item.key === entity.animationKey) : undefined;
            if (animation?.frames.length) sprite.play(animation.key);
            if (entity.id === "cow" || entity.id === "goose-wanderer") {
              sprite.setFlipX(flipForMovement(asset, "right"));
              this.tweens.add({
                targets: sprite,
                x: sprite.x + 120,
                duration: 3800,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
                onYoyo: () => sprite.setFlipX(flipForMovement(asset, "left")),
                onRepeat: () => sprite.setFlipX(flipForMovement(asset, "right")),
                onUpdate: () => sprite.setDepth(sprite.y),
              });
            }
          }
          this.cameras.main.setBounds(0, 0, DEMO_MAP.width * DEMO_MAP.tileSize, DEMO_MAP.height * DEMO_MAP.tileSize);
          this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
        }
        update() {
          if (this.isMoving) return;
          if (this.time.now - this.lastMoveAt < 140) return;
          const dx = (this.cursors.right.isDown || this.keys.D.isDown ? 1 : 0) - (this.cursors.left.isDown || this.keys.A.isDown ? 1 : 0);
          const dy = (this.cursors.down.isDown || this.keys.S.isDown ? 1 : 0) - (this.cursors.up.isDown || this.keys.W.isDown ? 1 : 0);
          if (!dx && !dy) {
            this.player.play(`player-idle-${this.playerDirection}`, true);
            return;
          }
          const horizontal = dx !== 0;
          const direction = horizontal ? "right" : dy > 0 ? "down" : "up";
          // Movement is grid-based, so choose the adjacent cell directly. Using
          // a speed value as a pixel offset breaks when the offset is smaller
          // than the distance from the player's center to the next cell.
          const currentCol = Math.floor(this.player.x / DEMO_MAP.tileSize);
          const currentRow = Math.floor(this.player.y / DEMO_MAP.tileSize);
          const nextCol = Phaser.Math.Clamp(currentCol + dx, 0, DEMO_MAP.width - 1);
          const nextRow = Phaser.Math.Clamp(currentRow + dy, 0, DEMO_MAP.height - 1);
          if (DEMO_MAP.tiles[nextRow * DEMO_MAP.width + nextCol] === "water" || this.solidCells.has(`${nextCol},${nextRow}`)) return;
          const targetX = (nextCol + 0.5) * DEMO_MAP.tileSize;
          const targetY = (nextRow + 0.5) * DEMO_MAP.tileSize;
          this.playerDirection = direction;
          this.player.setFlipX(horizontal && flipForMovement(assetByKey.get("player-base")!, dx < 0 ? "left" : "right"));
          this.player.play(`player-walk-${direction}`, true);
          this.isMoving = true;
          this.tweens.add({
            targets: this.player,
            x: targetX,
            y: targetY,
            duration: Math.max(120, Math.round((32 / PLAYER_SPEED) * 120)),
            ease: "Sine.easeOut",
            onUpdate: () => {
              this.player.setDepth(this.player.y);
            },
            onComplete: () => {
              this.isMoving = false;
              this.player.play(`player-idle-${this.playerDirection}`, true);
            },
          });
          this.lastMoveAt = this.time.now;
        }
      }
      game = new Phaser.Game({ type: Phaser.CANVAS, parent: hostRef.current, width: 960, height: 576, pixelArt: true, roundPixels: true, scene: MapScene });
    }
    start();
    return () => { cancelled = true; game?.destroy(true); };
  }, [mapAssets]);
  return <div className="relative h-[min(72vh,576px)] min-h-[420px] w-full overflow-hidden rounded-2xl border border-[#d2b58b]/20 bg-[#122d2c] shadow-2xl"><div ref={hostRef} className="h-full w-full" />{loading && <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#122d2c] px-6"><div className="w-full max-w-sm rounded-2xl border border-[#d2b58b]/20 bg-[#15110d]/95 p-6 text-center shadow-2xl"><p className="font-space text-[10px] uppercase tracking-[0.25em] text-[#d9a85c]">Sapiens · world prototype</p><h2 className="mt-3 font-display text-3xl text-[#f4ead8]">Loading the clearing</h2><div className="mt-6 h-2 overflow-hidden rounded-full bg-[#2b4039]"><div className="h-full rounded-full bg-[#d9a85c] transition-[width] duration-150" style={{ width: `${Math.round(loadingProgress * 100)}%` }} /></div><p className="mt-3 font-space text-[10px] uppercase tracking-[0.14em] text-[#907e69]">{Math.round(loadingProgress * 100)}% · {loadingLabel}</p></div></div>}<PlayerPickerPanel assets={catalogAssets} /></div>;
}
