import { ORCHESTRATOR_CONFIG } from "../orchestrator/config";

export type PixelLabResponse = {
  background_job_id?: string;
  character_id?: string;
  last_response?: unknown;
  image?: unknown;
  character?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  status?: string;
  usage?: { type?: string; usd?: number };
  frames?: Array<{ frameKey: string; dataUrl: string }>;
  [key: string]: unknown;
};

export const PIXELLAB_CHARACTER_FRAME_KEYS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
] as const;

export class PixelLabClient {
  constructor(
    private readonly apiKey = process.env.PIXELLAB_API_KEY,
    private readonly baseUrl = ORCHESTRATOR_CONFIG.pixelLabBaseUrl,
  ) {}

  createPortrait(description: string) {
    return this.post("/create-image-pixflux", {
      description: `${description}; transparent background; portrait, shoulder-up`,
      image_size: { width: 128, height: 128 },
      direction: "south-east",
      no_background: true,
    });
  }

  async createCharacter(description: string, name: string): Promise<PixelLabResponse> {
    const submitted = await this.post("/create-character-v3", {
      name,
      description,
      image_size: { width: 48, height: 48 },
      detail: "highly detailed",
      view: "low top-down",
      template_id: "mannequin",
      no_background: true,
    });
    const job = submitted.background_job_id
      ? await this.pollBackgroundJob(submitted.background_job_id)
      : submitted;
    const characterId =
      submitted.character_id ??
      this.recordValue(job.last_response)?.character_id ??
      this.recordValue(job.last_response)?.characterId;
    const character = characterId
      ? await this.get(`/characters/${encodeURIComponent(String(characterId))}`)
      : this.recordValue(job.last_response);
    const rotationUrls = this.rotationUrls(character);
    const generatedFrames = rotationUrls
      ? await Promise.all(
          PIXELLAB_CHARACTER_FRAME_KEYS.map(async (frameKey) => {
            const url = rotationUrls[frameKey];
            return url
              ? { frameKey, dataUrl: await this.imageAsBase64(url) }
              : null;
          }),
        )
      : [];
    const frames = generatedFrames.filter(
      (frame): frame is NonNullable<typeof frame> => frame !== null,
    );

    return {
      ...submitted,
      ...job,
      character_id: characterId ? String(characterId) : submitted.character_id,
      character,
      ...(frames[0] ? { image: { base64: frames[0].dataUrl } } : {}),
      ...(frames.length ? { images: frames.map(({ dataUrl }) => ({ base64: dataUrl })) } : {}),
      ...(frames.length ? { frames } : {}),
      metadata: {
        provider: "pixellab",
        characterId: characterId ? String(characterId) : undefined,
        directions: frames.length,
        imageSize: { width: 48, height: 48 },
        detail: "highly detailed",
        view: "low top-down",
        template: "mannequin",
        frameOrder: PIXELLAB_CHARACTER_FRAME_KEYS,
        rotationUrls,
      },
    };
  }

  createCollectible(description: string) {
    return this.post("/create-image-pixflux", {
      description,
      image_size: { width: 32, height: 32 },
      no_background: true,
    });
  }

  private async post(path: string, body: Record<string, unknown>): Promise<PixelLabResponse> {
    if (!this.apiKey) throw new Error("PIXELLAB_API_KEY is not configured");

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as PixelLabResponse;
    if (!response.ok) {
      throw new Error(`PixelLab request failed: ${response.status}`);
    }
    return payload;
  }

  private async get(path: string): Promise<PixelLabResponse> {
    if (!this.apiKey) throw new Error("PIXELLAB_API_KEY is not configured");

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    const payload = (await response.json()) as PixelLabResponse;
    if (!response.ok) {
      throw new Error(`PixelLab request failed: ${response.status}`);
    }
    return payload;
  }

  private async pollBackgroundJob(jobId: string): Promise<PixelLabResponse> {
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      const result = await this.get(`/background-jobs/${encodeURIComponent(jobId)}`);
      if (result.status === "completed") return result;
      if (result.status === "failed") {
        throw new Error(`PixelLab character generation failed (${jobId})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
    throw new Error(`PixelLab character generation timed out (${jobId})`);
  }

  private recordValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private rotationUrls(value: unknown): Record<string, string> | undefined {
    const record = this.recordValue(value);
    const urls = record?.rotation_urls ?? record?.rotationUrls;
    if (!urls || typeof urls !== "object" || Array.isArray(urls)) return undefined;
    return Object.fromEntries(
      Object.entries(urls).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  }

  private async imageAsBase64(url: string): Promise<string> {
    const response = await fetch(url, { headers: { Accept: "image/png" } });
    if (!response.ok) throw new Error(`PixelLab image request failed: ${response.status}`);
    return `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
  }
}
