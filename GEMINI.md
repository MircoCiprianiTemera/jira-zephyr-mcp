This project is a TypeScript application for interacting with Jira and Zephyr.

-   **`src/`**: Contains the main source code.
    -   **`index.ts`**: The main entry point of the application.
    -   **`clients/`**: Contains clients for interacting with Jira and Zephyr APIs.
        -   `jira-client.ts`: A client for the Jira API.
        -   `zephyr-client.ts`: A client for the Zephyr API.
    -   **`tools/`**: Contains tool definitions for specific functionalities.
        -   `jira-issues.ts`: Tools for managing Jira issues.
        -   `test-cases.ts`: Tools for managing Zephyr test cases.
        -   `test-cycles.ts`: Tools for managing Zephyr test cycles.
        -   `test-execution.ts`: Tools for managing Zephyr test executions.
        -   `test-plans.ts`: Tools for managing Zephyr test plans.
    -   **`types/`**: Contains TypeScript type definitions.
        -   `jira-types.ts`: Types for Jira data structures.
        -   `zephyr-types.ts`: Types for Zephyr data structures.
    -   **`utils/`**: Contains utility functions.
        -   `config.ts`: Configuration management.
        -   `text.ts`: Converts the HTML of Zephyr rich-text fields to plain text.
        -   `validation.ts`: Validation logic.
-   **`package.json`**: Defines project metadata, dependencies, and scripts.
-   **`tsconfig.json`**: TypeScript compiler configuration.
-   **`.env.example`**: Example environment variables file.

The application seems to provide a set of tools to programmatically interact with Jira and Zephyr, likely for test management automation.
