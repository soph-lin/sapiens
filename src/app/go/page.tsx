import { GRIFFIN_WHARF_ART } from "@/content/art/griffin-wharf";
import bostonTeaParty from "@/content/stories/boston-tea-party.json";
import { DialoguePanel } from "@/app/components/DialoguePanel";

export default function GoPage() {
  return (
    <DialoguePanel
      scenarioId="boston-tea-party"
      story={bostonTeaParty}
      title="Boston Tea Party"
      subtitle="December 1773. Three ships. A tax. A harbor that will not stay quiet."
      atmosphereArt={GRIFFIN_WHARF_ART}
    />
  );
}
