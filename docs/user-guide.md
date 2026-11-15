# Mindtraveller: interface and story language

In **Settings → Interface language**, choose **English** or **Português (Brasil)**. A successful save updates all application screens immediately and persists across restart. If saving fails, the previous selection stays active and the app shows an error. Older preferences default to an English interface.

Interface language is separate from **Language for new stories** and the language saved in an existing adventure. Switching the interface does not translate your story, change its choices or rolls, change model instructions, or change the Markdown export contents. Provider/model names, player names, and original free-text gender values remain as entered. Native operating-system dialog chrome follows Windows; app-owned export titles and filter labels follow the selected interface language.

The compact sidebar contains navigation and character information. Genre, chapter, story language, and Export History appear together above the narrative. The story and decision areas scroll separately; long choices wrap, and pending roll details and Retry remain reachable within the decision area.

Settings and New Story use the full available content width. Settings places application preferences and storyteller controls side by side when its content area is at least 900px wide, and stacks them on smaller windows. The portrait picker shows six portraits in one row on wide screens and three per row on smaller screens, with no class captions below the images.

Choose **English** or **Português** in New Story before starting an adventure. Português requests Brazilian Portuguese. Your selection is saved as the default for future adventures. You can also change that default under **Language for new stories** in Settings.

Each adventure keeps the language selected at creation. Changing the default does not translate or alter the current adventure. The story heading shows its language. Adventures saved by older versions without a language use English.

Both Ollama and OpenAI receive the selected language for the opening premise, narrative, choices, and chapter/global memory. Switching providers, reopening the app, or retrying a failed request keeps the adventure language. A retry after a saved roll reuses that roll.

The adventure also keeps its original objective and a compact record of the current location, situation, and focus. Each accepted scene saves its updated state with the narrative. These fields are supplied on every turn and remain separate from chapter/global summaries. Player-selected detours or abandonment can change the current focus without erasing the original objective.

Older saves restore without an extra model call: their premise and latest scene provide fallback memory until the next continuation updates the state. Loading alone does not rewrite the save. These checks improve continuity but do not guarantee that every model-generated detail is consistent.

If a model repeats one of the six most recent scenes, the app rejects it and retries with a reminder to resolve the selected action. It makes at most three attempts. If those fail, use Retry or choose another model in Settings; the pending action and any saved roll are retained. Retrying a failed action remains possible when the new scene describes different consequences.

The app also rejects response-field syntax accidentally embedded in narrative text, such as `choices: [{`. A copied recent scene of at least 30 words is rejected when it constitutes at least 80% of the new narrative, allowing punctuation changes and small additions to be caught. Short quotations and recaps with substantial new action remain possible. These checks do not detect every paraphrase or semantic contradiction.

Ollama requests an 8,192-token context window and reserves 1,536 tokens for output plus a 256-token safety margin. The app checks the estimated size of all messages, including retry instructions, before sending. It starts summaries earlier and reports an error if required context still does not fit. With the model loaded, run `ollama ps` to inspect the allocated `CONTEXT` column. The model and available memory must support the requested window; a larger window uses more memory. No extra review call is added to ordinary turns.

Interface labels and rule explanations follow the interface language; underlying rule identifiers remain canonical. Existing story text and player names are preserved. Story-language selection instructs the model; prose quality and adherence still depend on the chosen model. It does not translate older passages automatically.

## Character identity and portraits

New characters require a Male or Female selection and one of the six matching portraits. Selecting a gender initially selects the Warrior portrait; changing gender keeps the selected portrait role. Use Tab and arrow keys to select the gender and portrait. Portrait roles are cosmetic: choosing a Mage or Warrior picture grants no class, attribute bonus, or different odds.

The selected portrait appears in the sidebar with the character name immediately below it, and remains with the adventure across navigation, retries, provider changes, and restart. Older adventures keep their original gender text and use the dice artwork when they have no portrait. The dice also appears if a portrait image cannot load. Loading an older adventure does not rewrite its identity.

Gender is supplied as secondary context for story wording and choices. It does not change attributes or check odds. Portrait IDs and filenames are excluded from model requests and summaries, so a portrait role cannot become a character class through the prompt. Gender-aware wording still depends on the selected model.

## Export history

Select **Export History** in the story heading, choose a destination in the save dialog, and save the `.md` file. Markdown is readable in any text editor; a Markdown viewer adds formatting. Export works offline and does not ask the model to regenerate or translate anything.

The file contains character details, genre, premise, every saved scene and offered option, selected choices, and check results. It preserves accents and the original story text. Memory summaries and provider configuration or credentials are excluded.

An interrupted adventure can be exported while idle: the pending section identifies its unfinished action and any saved roll without inventing a continuation. Export is unavailable before narrative is saved, during active generation, or while confirming a replacement. Story actions wait until export finishes. Canceling the dialog leaves progress unchanged; a failed write shows an error and can be retried. Choose a destination outside the application's data folder.
