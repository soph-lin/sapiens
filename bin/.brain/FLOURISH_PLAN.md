# Flourish Rollout Plan

Original plan for making the platform more educational and grounded in factual sources.

Save plan here for user reference, but is not up-to-date, so agent cannot access this or read this.

## Requested Specs

Educational suite [dev name: Flourish] rollout: source grounding, encouragement to share info & critical thinking. Make text generation grounded in sources.

- Researcher:
  - Free mode: Expand beyond Wikipedia search. Select top REQUIRED_SOURCES, which includes the best fitting Wikipedia article & REQUIRED_SOURCES - 1 other articles (can be Wikipedia or non-Wikipedia). We will set in the orchestrator config REQUIRED_SOURCES = 3 for now.
  - Restricted mode: In this mode, researcher is given a list of user-approved domains (e.g. Wikipedia, Britannica, etc.) that they can choose from. Update dashboard so teacher can restrict their students' voyages.
  - In either case, Writer should only write the story based on these sources.
  - Please add the candidate articles researcher adds to progress log to debug more granularly. Confirm by checking in codebase if this doesn't already exist.
- Writer:
  - While writing, generate report of the story as JSON.
    - JSON:
      - reportText: a markdown of factual grounding & narrative embellish / ambiguities (these will be labeled under the following sections: "What was Fact?", "What was Fiction?" respectively).
        - In the fact section, every fact used in the story needs to be
      - sources[] used to generate the story (added to end of rendered report under "Sources" heading). This will be added to the report field of Voyage for all students to access.
    - Though I believe there is some support already in director with something like details in JSON (confirm & investigate), it makes sense that writer generates the final report since they are the ones writing the actual story.
    - Student can access this once the story is complete. They have a section of field log titled Completed Voyages, and they can access the voyages they have completed at any time.
  - Optional furtherReading bool input part of config that can be optionally passed into start of pipeline, default false in the default config. Output MAX_FOLLOWUP_SOURCES articles aside from the sources[] as furtherReading[]. We will set MAX_FOLLOWUP_SOURCES = 3 for now. At least ONE of these must be a video, though this policy may change later. If there are no other sources that can be retrieved while in restricted mode, please report as such if the furtherReading bool = true in the progress log. Teacher may update & add to this later once they generate a voyage successfully.
- Once the story is complete, if the voyage was assigned to student (not solo voyage), student has to create a field note to share with the class. A broad question at the top: "Cadet, any takeaways from that voyage?"
- Actor:
  - When speaking, actor needs to cite source depending on what they say. If what they say is embellish (define as turn of personality / fictional detail used for narrative & immersive effect), then do not cite. But if it's something factual, then they need to choose the proper source(s), create a factual while still in-character response, and then cite with sources[].
  - If student is part of classroom that is in restricted mode, then actor may only read from and cite sources from the list of teacher-approved domains. Otherwise, actor may freely choose sources.
  - When such fact exists, add to user's field notes. Update field note db to include optional sources[] (list of sources: URL strings) and also author (author can be the actor themselves; enum type: bot). So essentially field note is still owned by user, but author can be either user or bot.
- Students are able to publish field notes that they create or their bots have created at any time in the starstream. Since voyages can be created from either the student or the teacher as class material, create a separate starstream called Solo Voyages where students are able to publish field notes owned by voyages they have created.
- The demo classroom we have will currently be in Free mode, but teacher can toggle between Free and Restricted mode anytime.

Before developing, please markdown in .brain called FLOURISH_PLAN.md with the above user prompt word-for-word called "Requested Specs" and below a concise plan for how you wish to achieve the above specs. After we are done, please create FLOURISH.md in .brain/features as a concise summary of the feature rollout, and update other relevant docs in .brain.

## Implementation Plan

1. Inspect the current orchestration, progress logging, dashboard/classroom, voyage/report, field-note, and starstream data paths; identify existing director detail/report support and migration conventions.
2. Add a typed Flourish source-policy and report contract to the orchestrator config and pipeline. Expand research to select required sources, enforce restricted domains, log candidate articles, constrain writer inputs, and optionally produce bounded further reading with a video requirement.
3. Add writer-generated report persistence and rendering, completed-voyage access, assignment completion field-note prompting, actor source citations, and bot-authored field notes with optional source URLs.
4. Add teacher controls for Free/Restricted classroom source domains and solo-voyage starstream separation, preserving the demo classroom's Free default.
5. Add/update migrations, prompts, tests, and relevant `.brain` docs; run type checks, lint/tests, and UI validation against the existing local server if available.
