import { GRIFFIN_WHARF_ART } from "@/lib/content/art/griffin-wharf";
import bostonTeaParty from "@/content/voyages/boston-tea-party.json";
import { DialoguePanel } from "@/app/components/dialogue";

export default function GoPage() {
  return (
    <DialoguePanel
      scenarioId="boston-tea-party"
      story={bostonTeaParty}
      theme="vanilla"
      title="Boston Tea Party"
      subtitle="December 1773. Three ships. A tax. A harbor that will not stay quiet."
      atmosphereArt={GRIFFIN_WHARF_ART}
    />
  );
}
