import { GRIFFIN_WHARF_ART } from "@/lib/content/art/griffin-wharf";
import bostonTeaParty from "@/lib/content/voyages/boston-tea-party.json";
import { StoryDialogue } from "@/app/components/dialogue";

export default function GoPage() {
  return (
    <StoryDialogue
      scenarioId="boston-tea-party"
      story={bostonTeaParty}
      theme="vanilla"
      title="Boston Tea Party"
      subtitle="December 1773. Three ships. A tax. A harbor that will not stay quiet."
      atmosphereArt={GRIFFIN_WHARF_ART}
    />
  );
}
