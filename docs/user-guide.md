# Mindtraveller: story language

Choose **English** or **Português** in New Story before starting an adventure. Português requests Brazilian Portuguese. Your selection is saved as the default for future adventures. You can also change that default under **Language for new stories** in Settings.

Each adventure keeps the language selected at creation. Changing the default does not translate or alter the current adventure. The story heading shows its language. Adventures saved by older versions without a language use English.

Both Ollama and OpenAI receive the selected language for the opening premise, narrative, choices, and chapter/global memory. Switching providers, reopening the app, or retrying a failed request keeps the adventure language. A retry after a saved roll reuses that roll.

Interface labels and game-rule identifiers remain in English. Existing story text and player names are preserved. Language selection instructs the model; prose quality and adherence still depend on the chosen model. It does not translate older passages automatically.

## Export history

Select **Export History** in the story heading, choose a destination in the save dialog, and save the `.md` file. Markdown is readable in any text editor; a Markdown viewer adds formatting. Export works offline and does not ask the model to regenerate or translate anything.

The file contains character details, genre, premise, every saved scene and offered option, selected choices, and check results. It preserves accents and the original story text. Memory summaries and provider configuration or credentials are excluded.

An interrupted adventure can be exported while idle: the pending section identifies its unfinished action and any saved roll without inventing a continuation. Export is unavailable before narrative is saved, during active generation, or while confirming a replacement. Story actions wait until export finishes. Canceling the dialog leaves progress unchanged; a failed write shows an error and can be retried. Choose a destination outside the application's data folder.
