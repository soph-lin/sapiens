import type { DialogueTheme } from "./theme";

type AtmosphereArtProps = {
  art: string;
  theme: DialogueTheme;
};

export function AtmosphereArt({ art, theme }: AtmosphereArtProps) {
  return (
    <pre aria-hidden className={theme.atmosphere}>
      {art}
    </pre>
  );
}
