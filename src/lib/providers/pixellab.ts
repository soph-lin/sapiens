import { ORCHESTRATOR_CONFIG } from "../orchestrator/config";

export type PixelLabResponse = {
  background_job_id?: string;
  character_id?: string;
  image?: unknown;
  status?: string;
  usage?: { type?: string; usd?: number };
  [key: string]: unknown;
};

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
}
