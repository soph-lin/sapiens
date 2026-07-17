/** Default character budget per model-facing text chunk. */
export const DEFAULT_TEXT_CHUNK_CHARS = 8000;

export type TextChunk = {
  chunkIndex: number;
  totalChunks: number;
  charOffset: number;
  charLength: number;
  totalChars: number;
  hasMore: boolean;
  nextChunkIndex: number | null;
  text: string;
};

export function chunkText(
  text: string,
  chunkSize = DEFAULT_TEXT_CHUNK_CHARS,
): string[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error("chunkSize must be a positive integer");
  }
  if (!text) return [""];
  const chunks: string[] = [];
  for (let offset = 0; offset < text.length; offset += chunkSize) {
    chunks.push(text.slice(offset, offset + chunkSize));
  }
  return chunks;
}

/** Return one 0-based chunk from `text`, with pagination metadata for follow-up reads. */
export function getTextChunk(
  text: string,
  chunkIndex = 0,
  chunkSize = DEFAULT_TEXT_CHUNK_CHARS,
): TextChunk {
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    throw new Error("chunkIndex must be a non-negative integer");
  }
  const chunks = chunkText(text, chunkSize);
  if (chunkIndex >= chunks.length) {
    throw new Error(
      `chunkIndex ${chunkIndex} is out of range (0-${chunks.length - 1})`,
    );
  }
  const slice = chunks[chunkIndex] ?? "";
  const hasMore = chunkIndex < chunks.length - 1;
  return {
    chunkIndex,
    totalChunks: chunks.length,
    charOffset: chunkIndex * chunkSize,
    charLength: slice.length,
    totalChars: text.length,
    hasMore,
    nextChunkIndex: hasMore ? chunkIndex + 1 : null,
    text: slice,
  };
}
