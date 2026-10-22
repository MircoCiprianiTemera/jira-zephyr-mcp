# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-10-22

Aligns the server with the Zephyr Scale Cloud REST API v2, checked against the official OpenAPI spec and the live API.

### Added
- `list_test_case_attachments` lists the attachments of a test case and, with `includeSteps`, of each test step.
- `get_test_case_attachment` downloads a test case or test step attachment: text files as text (JSON minified), images as images, other files base64 encoded.
- `list_test_cycles` accepts `offset`; `search_test_cases` accepts `folderId`.
- `execute_test` accepts the `NOT_EXECUTED` status and a `statusName` for custom statuses.
- `create_test_case` and `create_multiple_test_cases` accept `ownerId`.
- Execution statistics include a count per status name (`byStatus`).

### Changed
- All list tools follow the API pagination and return every result up to `limit`, which now goes up to 1000.
- `get_test_steps` returns compact plain-text steps: editor HTML, `self` URLs and empty parameters are removed, and a step that calls another test case returns its key and parameters. The GUCCI-T104 output went from 66 KB to 15 KB.
- Tool results are serialized as compact JSON.
- `get_test_case` and `search_test_cases` return the project key and the priority, status and folder names instead of numeric IDs, and plain-text objective and precondition.
- `get_test_execution_status` and `generate_test_report` accept a cycle key or a numeric ID.
- `create_test_cycle`: `versionId` is now an optional number.
- `folderId` and `componentId` are numbers.

### Fixed
- `get_test_execution_status` and `generate_test_report` called `/testcycles/{id}/testexecutions`, which does not exist (404). They now read `/testexecutions?testCycle=<key>` over all pages and resolve the execution status names.
- `list_test_cycles`, `list_test_plans` and `execute_test` failed as soon as there was a result, because they read fields that the API does not return.
- `search_test_cases` called `/testcases/search`, which does not exist; it now lists `/testcases` and filters on key and name.
- `create_test_case` sent `priority`, `status` and `testScript`, which the API ignores: it now sends `priorityName` and `statusName` and saves the steps or the plain-text script with separate calls.
- `execute_test` now sends `statusName` and links defects with `/testexecutions/{id}/links/issues`.
- `link_tests_to_issues` now uses `/testcases/{key}/links/issues` with the numeric JIRA issue ID.
- `create_test_cycle` now sends `jiraProjectVersion`.
- Totals no longer fall back to `undefined` or replace a total of 0.

### Removed
- `environment` from `create_test_cycle`, and `startDate`/`endDate` from `create_test_plan`: the API does not support them.

## [1.1.0] - 2026-10-22

### Added
- `get_test_steps` reads the steps of a test case.
- `get_server_info` returns the server version, build time and start time, to check which build is running.
- The server version is read from `package.json` and shown in the startup log.

### Fixed
- `get_test_steps` returned only the first 10 steps; it now follows the API pagination.

## [1.0.0]

### Added
- First release: JIRA issue reading, test plans, test cycles, test executions, reports, test case creation and search.
