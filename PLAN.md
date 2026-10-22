# Zephyr MCP Implementation Plan

## Overview
This document outlines the implementation plan for a Model Context Protocol (MCP) server that integrates with JIRA's Zephyr test management system. The MCP server provides tools for managing test plans, test cycles, test cases (with their steps and attachments), test executions, and for accessing JIRA issue information.

All Zephyr calls use the Zephyr Scale Cloud REST API v2 (`https://api.zephyrscale.smartbear.com/v2`). The phases below describe how the project was originally built; the tool list reflects the current state (version 1.2.0).

## Architecture

### Core Components
- **MCP Server**: Main server handling MCP protocol communication
- **JIRA Client**: HTTP client for JIRA REST API interactions
- **Zephyr Client**: HTTP client for Zephyr API interactions
- **Tool Handlers**: Individual functions implementing each MCP tool
- **Configuration Manager**: Handles authentication and API endpoints

## Project Structure
```
jira-zephyr-mcp/
├── src/
│   ├── index.ts                 # Main MCP server entry point
│   ├── clients/
│   │   ├── jira-client.ts       # JIRA API client
│   │   └── zephyr-client.ts     # Zephyr API client
│   ├── tools/
│   │   ├── test-plans.ts        # Test plan management tools
│   │   ├── test-cycles.ts       # Test cycle management tools
│   │   ├── jira-issues.ts       # JIRA issue reading tools
│   │   ├── test-cases.ts        # Test case, test step and attachment tools
│   │   └── test-execution.ts    # Test execution tools
│   ├── types/
│   │   ├── jira-types.ts        # JIRA API response types
│   │   └── zephyr-types.ts      # Zephyr API response types
│   └── utils/
│       ├── config.ts            # Configuration utilities
│       ├── text.ts              # HTML to plain text for Zephyr rich-text fields
│       └── validation.ts        # Input validation utilities
├── package.json
├── Dockerfile
├── tsconfig.json
├── README.md
└── .env.example
```

## MCP Tools Implementation

### Primary Tools

#### 1. create_test_plan
- **Purpose**: Create new test plans in Zephyr
- **Inputs**: 
  - name: string (required)
  - description: string (optional)
  - projectKey: string (required)
- **Output**: Created test plan id and key
- **Note**: `description` is sent as the plan `objective`; the API has no planned dates for test plans

#### 2. create_test_cycle
- **Purpose**: Create test execution cycles
- **Inputs**:
  - name: string (required)
  - description: string (optional)
  - projectKey: string (required)
  - versionId: number (optional) - numeric JIRA project version ID
  - startDate: string (optional)
  - endDate: string (optional)
- **Output**: Created test cycle id and key

#### 3. read_jira_issue
- **Purpose**: Retrieve JIRA issue information
- **Inputs**:
  - issueKey: string (required)
  - fields: string[] (optional) - specific fields to retrieve
- **Output**: JIRA issue details including custom fields

### Test Plan, Cycle and Execution Tools

#### 4. list_test_plans
- **Purpose**: Browse existing test plans
- **Inputs**:
  - projectKey: string (required)
  - limit: number (optional, default: 50, max: 1000)
  - offset: number (optional, default: 0)
- **Output**: List of test plans with status and folder names and linked test cycle IDs

#### 5. list_test_cycles
- **Purpose**: Browse test cycles
- **Inputs**:
  - projectKey: string (required)
  - versionId: number (optional) - numeric JIRA project version ID
  - limit: number (optional, default: 50, max: 1000)
  - offset: number (optional, default: 0)
- **Output**: List of test cycles with status and folder names (execution progress comes from get_test_execution_status)

#### 6. execute_test
- **Purpose**: Update test execution results
- **Inputs**:
  - executionId: string (required) - execution ID or key
  - status: string (required) - PASS, FAIL, WIP, BLOCKED, NOT_EXECUTED
  - statusName: string (optional) - exact Zephyr status name, for custom statuses
  - comment: string (optional)
  - defects: string[] (optional) - JIRA issue keys to link to the execution
- **Output**: Updated execution details and the result of each defect link

#### 7. get_test_execution_status
- **Purpose**: Check test execution progress
- **Inputs**:
  - cycleId: string (required) - cycle key (e.g. ABC-R3) or numeric ID
- **Output**: Execution statistics over all the executions of the cycle, including a count per status name

#### 8. link_tests_to_issues
- **Purpose**: Associate test cases with JIRA issues
- **Inputs**:
  - testCaseId: string (required) - test case key
  - issueKeys: string[] (required)
- **Output**: Link result for each issue

#### 9. generate_test_report
- **Purpose**: Create test execution reports
- **Inputs**:
  - cycleId: string (required) - cycle key or numeric ID
  - format: string (optional) - JSON, HTML
- **Output**: Test execution report data

### Test Case Tools

#### 10. create_test_case
- **Purpose**: Create a test case, with its test script
- **Inputs**:
  - projectKey: string (required)
  - name: string (required)
  - objective, precondition: string (optional)
  - estimatedTime: number (optional)
  - priority, status: string (optional) - priority and status names, e.g. Normal, Draft
  - folderId, componentId: number (optional)
  - ownerId: string (optional) - JIRA account ID
  - labels: string[] (optional)
  - customFields: object (optional)
  - testScript: object (optional) - STEP_BY_STEP with steps, or PLAIN_TEXT with text
- **Output**: Created test case id and key, and the number of steps saved
- **Note**: the test script is saved with separate calls after the test case is created

#### 11. create_multiple_test_cases
- **Purpose**: Create several test cases in one call
- **Inputs**:
  - testCases: array (required) - same fields as create_test_case
  - continueOnError: boolean (optional, default: true)
- **Output**: Result for each test case and a summary

#### 12. search_test_cases
- **Purpose**: List test cases in a project
- **Inputs**:
  - projectKey: string (required)
  - query: string (optional) - case-insensitive match on key and name, applied by the server since the API has no text search
  - folderId: number (optional)
  - limit: number (optional, default: 50, max: 1000)
- **Output**: Key, name, status and folder of each matching test case; details come from get_test_case

#### 13. get_test_case
- **Purpose**: Read a test case
- **Inputs**:
  - testCaseId: string (required) - ID or key
- **Output**: Test case details with project key and priority, status and folder names

#### 14. get_test_steps
- **Purpose**: Read all the steps of a test case
- **Inputs**:
  - testCaseId: string (required) - ID or key
- **Output**: Every step as plain text; steps that call another test case return its key and non-empty parameters

#### 15. list_test_case_attachments
- **Purpose**: List attachments
- **Inputs**:
  - testCaseId: string (required)
  - includeSteps: boolean (optional, default: false) - also list the attachments of each step
- **Output**: Attachment IDs and file names

#### 16. get_test_case_attachment
- **Purpose**: Download an attachment
- **Inputs**:
  - testCaseId: string (required)
  - attachmentId: number (required)
  - stepId: number (optional) - for step attachments
- **Output**: Text files as text (JSON minified), images as images, other files base64 encoded

### Server Tools

#### 17. get_server_info
- **Purpose**: Check which build of the server is running
- **Inputs**: none
- **Output**: Server name, version, build time, start time and Node.js version

## Zephyr Scale Cloud API v2 Notes
- List endpoints are paginated with `startAt`/`maxResults` (default page size 10, at most 1000); the client follows every page.
- Executions of a cycle are read with `GET /testexecutions?testCycle=<cycle key>`; the filter does not accept numeric IDs.
- Priority, status, folder and project come back as IDs and are resolved to names with `/priorities`, `/statuses`, `/folders` and `/projects`, with a cache.
- Issue links (`/links/issues`) take the numeric JIRA issue ID, which is looked up from the issue key.
- Rich-text fields contain editor HTML, converted to plain text before being returned.

## Technical Implementation Details

### Dependencies
- `@modelcontextprotocol/sdk`: MCP SDK for server implementation
- `axios`: HTTP client for API requests
- `dotenv`: Environment variable management
- `zod`: Schema validation for inputs and outputs

### Authentication
- Basic Auth for JIRA API
- API tokens for Zephyr Scale/Squad
- Environment variables for credentials:
  - `JIRA_BASE_URL`
  - `JIRA_USERNAME`
  - `JIRA_API_TOKEN`
  - `ZEPHYR_API_TOKEN`

### Error Handling
- Structured error responses with MCP error codes
- API rate limiting considerations
- Network timeout handling
- Input validation using Zod schemas

### Type Safety
- Complete TypeScript types for all API responses
- Zod schemas for runtime validation
- Generic error handling types

## Configuration

### Environment Variables
```bash
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_USERNAME=your-email@company.com
JIRA_API_TOKEN=your-jira-api-token
ZEPHYR_API_TOKEN=your-zephyr-api-token
```

### MCP Server Configuration
```json
{
  "name": "jira-zephyr-mcp",
  "version": "1.2.0",
  "tools": [
    "get_server_info",
    "read_jira_issue",
    "create_test_plan",
    "list_test_plans",
    "create_test_cycle",
    "list_test_cycles",
    "execute_test",
    "get_test_execution_status",
    "link_tests_to_issues",
    "generate_test_report",
    "create_test_case",
    "create_multiple_test_cases",
    "search_test_cases",
    "get_test_case",
    "get_test_steps",
    "list_test_case_attachments",
    "get_test_case_attachment"
  ]
}
```

## Implementation Phases

### Phase 1: Core Setup
1. Initialize Node.js/TypeScript project
2. Set up MCP server framework
3. Create basic JIRA client
4. Implement read_jira_issue tool

### Phase 2: Test Management
1. Implement Zephyr client
2. Create test plan management tools
3. Create test cycle management tools
4. Add input validation

### Phase 3: Advanced Features
1. Implement test execution tools
2. Add reporting capabilities
3. Create linking functionality
4. Add comprehensive error handling

### Phase 4: Documentation & Polish
1. Complete README documentation
2. Add usage examples
3. Create configuration templates
4. Add logging and monitoring

## Testing Strategy
- Unit tests for each tool function
- Integration tests with JIRA/Zephyr APIs
- Mock API responses for development
- End-to-end testing with real JIRA instance

## Deployment Options
- Local development server
- Docker containerization
- Claude Desktop integration
- CI/CD pipeline setup

## Security Considerations
- Secure credential storage
- API token rotation
- Input sanitization
- Rate limiting compliance
- Audit logging for sensitive operations