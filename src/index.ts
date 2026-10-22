import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { readJiraIssue } from './tools/jira-issues.js';
import { createTestPlan, listTestPlans } from './tools/test-plans.js';
import { createTestCycle, listTestCycles } from './tools/test-cycles.js';
import {
  executeTest,
  getTestExecutionStatus,
  linkTestsToIssues,
  generateTestReport,
} from './tools/test-execution.js';
import {
  createTestCase,
  searchTestCases,
  getTestCase,
  getTestSteps,
  listTestCaseAttachments,
  getTestCaseAttachment,
  createMultipleTestCases,
} from './tools/test-cases.js';
import {
  readJiraIssueSchema,
  createTestPlanSchema,
  listTestPlansSchema,
  createTestCycleSchema,
  listTestCyclesSchema,
  executeTestSchema,
  getTestExecutionStatusSchema,
  linkTestsToIssuesSchema,
  generateTestReportSchema,
  createTestCaseSchema,
  searchTestCasesSchema,
  getTestCaseSchema,
  getTestStepsSchema,
  listTestCaseAttachmentsSchema,
  getTestCaseAttachmentSchema,
  createMultipleTestCasesSchema,
  ReadJiraIssueInput,
  CreateTestPlanInput,
  ListTestPlansInput,
  CreateTestCycleInput,
  ListTestCyclesInput,
  ExecuteTestInput,
  GetTestExecutionStatusInput,
  LinkTestsToIssuesInput,
  GenerateTestReportInput,
  CreateTestCaseInput,
  SearchTestCasesInput,
  GetTestCaseInput,
  GetTestStepsInput,
  ListTestCaseAttachmentsInput,
  GetTestCaseAttachmentInput,
  CreateMultipleTestCasesInput,
} from './utils/validation.js';
import packageJson from '../package.json';

const SERVER_NAME = 'jira-zephyr-mcp';
const SERVER_VERSION: string = packageJson.version;
const STARTED_AT = new Date().toISOString();

// The bundle's mtime tells which build the running process loaded
const getBuildTime = (): string | null => {
  try {
    return statSync(fileURLToPath(import.meta.url)).mtime.toISOString();
  } catch {
    return null;
  }
};

const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
  }
);

const TOOLS = [
  {
    name: 'get_server_info',
    description: 'Get the version, build time and start time of this MCP server',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'read_jira_issue',
    description: 'Read JIRA issue details and metadata',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: { type: 'string', description: 'JIRA issue key (e.g., ABC-123)' },
        fields: { type: 'array', items: { type: 'string' }, description: 'Specific fields to retrieve (optional)' },
      },
      required: ['issueKey'],
    },
  },
  {
    name: 'create_test_plan',
    description: 'Create a new test plan in Zephyr',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Test plan name' },
        description: { type: 'string', description: 'Test plan objective (optional)' },
        projectKey: { type: 'string', description: 'JIRA project key' },
      },
      required: ['name', 'projectKey'],
    },
  },
  {
    name: 'list_test_plans',
    description: 'List existing test plans',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'JIRA project key' },
        limit: { type: 'number', description: 'Maximum number of results, up to 1000 (default: 50)' },
        offset: { type: 'number', description: 'Number of results to skip (default: 0)' },
      },
      required: ['projectKey'],
    },
  },
  {
    name: 'create_test_cycle',
    description: 'Create a new test execution cycle',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Test cycle name' },
        description: { type: 'string', description: 'Test cycle description (optional)' },
        projectKey: { type: 'string', description: 'JIRA project key' },
        versionId: { type: 'number', description: 'Numeric JIRA project version ID (optional)' },
        startDate: { type: 'string', description: 'Planned start date (ISO format, optional)' },
        endDate: { type: 'string', description: 'Planned end date (ISO format, optional)' },
      },
      required: ['name', 'projectKey'],
    },
  },
  {
    name: 'list_test_cycles',
    description: 'List existing test cycles (use get_test_execution_status for execution progress)',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'JIRA project key' },
        versionId: { type: 'number', description: 'Numeric JIRA project version ID (optional)' },
        limit: { type: 'number', description: 'Maximum number of results, up to 1000 (default: 50)' },
        offset: { type: 'number', description: 'Number of results to skip (default: 0)' },
      },
      required: ['projectKey'],
    },
  },
  {
    name: 'execute_test',
    description: 'Update test execution results',
    inputSchema: {
      type: 'object',
      properties: {
        executionId: { type: 'string', description: 'Test execution ID or key (e.g., GUCCI-E1)' },
        status: { type: 'string', enum: ['PASS', 'FAIL', 'WIP', 'BLOCKED', 'NOT_EXECUTED'], description: 'Execution status, mapped to the default Zephyr statuses Pass, Fail, In Progress, Blocked, Not Executed' },
        statusName: { type: 'string', description: 'Exact Zephyr status name, overrides status for custom statuses (optional)' },
        comment: { type: 'string', description: 'Execution comment (optional)' },
        defects: { type: 'array', items: { type: 'string' }, description: 'JIRA issue keys to link to the execution (optional)' },
      },
      required: ['executionId', 'status'],
    },
  },
  {
    name: 'get_test_execution_status',
    description: 'Get test execution progress and statistics',
    inputSchema: {
      type: 'object',
      properties: {
        cycleId: { type: 'string', description: 'Test cycle key (e.g., GUCCI-R1) or numeric ID' },
      },
      required: ['cycleId'],
    },
  },
  {
    name: 'link_tests_to_issues',
    description: 'Associate test cases with JIRA issues',
    inputSchema: {
      type: 'object',
      properties: {
        testCaseId: { type: 'string', description: 'Test case key (e.g., GUCCI-T1)' },
        issueKeys: { type: 'array', items: { type: 'string' }, description: 'JIRA issue keys to link' },
      },
      required: ['testCaseId', 'issueKeys'],
    },
  },
  {
    name: 'generate_test_report',
    description: 'Generate test execution report',
    inputSchema: {
      type: 'object',
      properties: {
        cycleId: { type: 'string', description: 'Test cycle key (e.g., GUCCI-R1) or numeric ID' },
        format: { type: 'string', enum: ['JSON', 'HTML'], description: 'Report format (default: JSON)' },
      },
      required: ['cycleId'],
    },
  },
  {
    name: 'create_test_case',
    description: 'Create a new test case in Zephyr',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'JIRA project key' },
        name: { type: 'string', description: 'Test case name' },
        objective: { type: 'string', description: 'Test case objective/description (optional)' },
        precondition: { type: 'string', description: 'Test preconditions (optional)' },
        estimatedTime: { type: 'number', description: 'Estimated execution time in minutes (optional)' },
        priority: { type: 'string', description: 'Priority name, e.g. Normal (optional)' },
        status: { type: 'string', description: 'Status name, e.g. Draft (optional)' },
        folderId: { type: 'number', description: 'Numeric folder ID to organize test case (optional)' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Test case labels (optional)' },
        componentId: { type: 'number', description: 'Numeric JIRA component ID (optional)' },
        ownerId: { type: 'string', description: 'Owner JIRA account ID (optional)' },
        customFields: { type: 'object', description: 'Custom fields as key-value pairs (optional)' },
        testScript: {
          type: 'object',
          description: 'Test script with steps (optional)',
          properties: {
            type: { type: 'string', enum: ['STEP_BY_STEP', 'PLAIN_TEXT'], description: 'Script type' },
            steps: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  index: { type: 'number', description: 'Step number' },
                  description: { type: 'string', description: 'Step description' },
                  testData: { type: 'string', description: 'Test data (optional)' },
                  expectedResult: { type: 'string', description: 'Expected result' },
                },
                required: ['index', 'description', 'expectedResult'],
              },
              description: 'Test steps (for STEP_BY_STEP type)',
            },
            text: { type: 'string', description: 'Plain text script (for PLAIN_TEXT type)' },
          },
          required: ['type'],
        },
      },
      required: ['projectKey', 'name'],
    },
  },
  {
    name: 'search_test_cases',
    description: 'Search for test cases in a project. Returns key, name, status and folder; use get_test_case for the details',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: { type: 'string', description: 'JIRA project key' },
        query: { type: 'string', description: 'Case-insensitive text matched against test case key and name (optional)' },
        folderId: { type: 'number', description: 'Numeric folder ID to restrict the search (optional)' },
        limit: { type: 'number', description: 'Maximum number of results, up to 1000 (default: 50)' },
      },
      required: ['projectKey'],
    },
  },
  {
    name: 'get_test_case',
    description: 'Get detailed information about a specific test case',
    inputSchema: {
      type: 'object',
      properties: {
        testCaseId: { type: 'string', description: 'Test case ID or key' },
      },
      required: ['testCaseId'],
    },
  },
  {
    name: 'get_test_steps',
    description: 'Get all test steps for a specific test case, as plain text (HTML formatting and empty parameters removed)',
    inputSchema: {
      type: 'object',
      properties: {
        testCaseId: { type: 'string', description: 'Test case ID or key (e.g., MSTW-T67)' },
      },
      required: ['testCaseId'],
    },
  },
  {
    name: 'list_test_case_attachments',
    description: 'List the attachments of a test case, optionally including the attachments of each test step',
    inputSchema: {
      type: 'object',
      properties: {
        testCaseId: { type: 'string', description: 'Test case ID or key (e.g., MSTW-T67)' },
        includeSteps: { type: 'boolean', description: 'Also list step attachments, one request per step (default: false)' },
      },
      required: ['testCaseId'],
    },
  },
  {
    name: 'get_test_case_attachment',
    description: 'Download a test case or test step attachment. Text files are returned as text (JSON minified), images as images, other files base64 encoded',
    inputSchema: {
      type: 'object',
      properties: {
        testCaseId: { type: 'string', description: 'Test case ID or key (e.g., MSTW-T67)' },
        attachmentId: { type: 'number', description: 'Attachment ID from list_test_case_attachments' },
        stepId: { type: 'number', description: 'Test step ID, for step attachments (optional)' },
      },
      required: ['testCaseId', 'attachmentId'],
    },
  },
  {
    name: 'create_multiple_test_cases',
    description: 'Create multiple test cases in Zephyr at once',
    inputSchema: {
      type: 'object',
      properties: {
        testCases: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              projectKey: { type: 'string', description: 'JIRA project key' },
              name: { type: 'string', description: 'Test case name' },
              objective: { type: 'string', description: 'Test case objective/description (optional)' },
              precondition: { type: 'string', description: 'Test preconditions (optional)' },
              estimatedTime: { type: 'number', description: 'Estimated execution time in minutes (optional)' },
              priority: { type: 'string', description: 'Priority name, e.g. Normal (optional)' },
              status: { type: 'string', description: 'Status name, e.g. Draft (optional)' },
              folderId: { type: 'number', description: 'Numeric folder ID to organize test case (optional)' },
              labels: { type: 'array', items: { type: 'string' }, description: 'Test case labels (optional)' },
              componentId: { type: 'number', description: 'Numeric JIRA component ID (optional)' },
              ownerId: { type: 'string', description: 'Owner JIRA account ID (optional)' },
              customFields: { type: 'object', description: 'Custom fields as key-value pairs (optional)' },
              testScript: {
                type: 'object',
                description: 'Test script with steps (optional)',
                properties: {
                  type: { type: 'string', enum: ['STEP_BY_STEP', 'PLAIN_TEXT'], description: 'Script type' },
                  steps: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        index: { type: 'number', description: 'Step number' },
                        description: { type: 'string', description: 'Step description' },
                        testData: { type: 'string', description: 'Test data (optional)' },
                        expectedResult: { type: 'string', description: 'Expected result' },
                      },
                      required: ['index', 'description', 'expectedResult'],
                    },
                    description: 'Test steps (for STEP_BY_STEP type)',
                  },
                  text: { type: 'string', description: 'Plain text script (for PLAIN_TEXT type)' },
                },
                required: ['type'],
              },
            },
            required: ['projectKey', 'name'],
          },
          description: 'Array of test cases to create',
        },
        continueOnError: { type: 'boolean', description: 'Continue creating remaining test cases if one fails (default: true)', default: true },
      },
      required: ['testCases'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

const validateInput = <T>(schema: any, input: unknown, toolName: string): T => {
  const result = schema.safeParse(input);
  if (!result.success) {
    const errors = result.error.errors.map((err: any) => `${err.path.join('.')}: ${err.message}`);
    throw new McpError(
      ErrorCode.InvalidParams,
      `Invalid parameters for ${toolName}:\n${errors.join('\n')}`
    );
  }
  return result.data as T;
};

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'get_server_info': {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  name: SERVER_NAME,
                  version: SERVER_VERSION,
                  buildTime: getBuildTime(),
                  startedAt: STARTED_AT,
                  nodeVersion: process.version,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'read_jira_issue': {
        const validatedArgs = validateInput<ReadJiraIssueInput>(readJiraIssueSchema, args, 'read_jira_issue');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await readJiraIssue(validatedArgs)),
            },
          ],
        };
      }

      case 'create_test_plan': {
        const validatedArgs = validateInput<CreateTestPlanInput>(createTestPlanSchema, args, 'create_test_plan');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await createTestPlan(validatedArgs)),
            },
          ],
        };
      }

      case 'list_test_plans': {
        const validatedArgs = validateInput<ListTestPlansInput>(listTestPlansSchema, args, 'list_test_plans');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await listTestPlans(validatedArgs)),
            },
          ],
        };
      }

      case 'create_test_cycle': {
        const validatedArgs = validateInput<CreateTestCycleInput>(createTestCycleSchema, args, 'create_test_cycle');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await createTestCycle(validatedArgs)),
            },
          ],
        };
      }

      case 'list_test_cycles': {
        const validatedArgs = validateInput<ListTestCyclesInput>(listTestCyclesSchema, args, 'list_test_cycles');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await listTestCycles(validatedArgs)),
            },
          ],
        };
      }

      case 'execute_test': {
        const validatedArgs = validateInput<ExecuteTestInput>(executeTestSchema, args, 'execute_test');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await executeTest(validatedArgs)),
            },
          ],
        };
      }

      case 'get_test_execution_status': {
        const validatedArgs = validateInput<GetTestExecutionStatusInput>(getTestExecutionStatusSchema, args, 'get_test_execution_status');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await getTestExecutionStatus(validatedArgs)),
            },
          ],
        };
      }

      case 'link_tests_to_issues': {
        const validatedArgs = validateInput<LinkTestsToIssuesInput>(linkTestsToIssuesSchema, args, 'link_tests_to_issues');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await linkTestsToIssues(validatedArgs)),
            },
          ],
        };
      }

      case 'generate_test_report': {
        const validatedArgs = validateInput<GenerateTestReportInput>(generateTestReportSchema, args, 'generate_test_report');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await generateTestReport(validatedArgs)),
            },
          ],
        };
      }

      case 'create_test_case': {
        const validatedArgs = validateInput<CreateTestCaseInput>(createTestCaseSchema, args, 'create_test_case');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await createTestCase(validatedArgs)),
            },
          ],
        };
      }

      case 'search_test_cases': {
        const validatedArgs = validateInput<SearchTestCasesInput>(searchTestCasesSchema, args, 'search_test_cases');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await searchTestCases(validatedArgs)),
            },
          ],
        };
      }

      case 'get_test_case': {
        const validatedArgs = validateInput<GetTestCaseInput>(getTestCaseSchema, args, 'get_test_case');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await getTestCase(validatedArgs)),
            },
          ],
        };
      }

      case 'get_test_steps': {
        const validatedArgs = validateInput<GetTestStepsInput>(getTestStepsSchema, args, 'get_test_steps');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await getTestSteps(validatedArgs)),
            },
          ],
        };
      }

      case 'list_test_case_attachments': {
        const validatedArgs = validateInput<ListTestCaseAttachmentsInput>(listTestCaseAttachmentsSchema, args, 'list_test_case_attachments');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await listTestCaseAttachments(validatedArgs)),
            },
          ],
        };
      }

      case 'get_test_case_attachment': {
        const validatedArgs = validateInput<GetTestCaseAttachmentInput>(getTestCaseAttachmentSchema, args, 'get_test_case_attachment');
        return {
          content: await getTestCaseAttachment(validatedArgs),
        };
      }

      case 'create_multiple_test_cases': {
        const validatedArgs = validateInput<CreateMultipleTestCasesInput>(createMultipleTestCasesSchema, args, 'create_multiple_test_cases');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(await createMultipleTestCases(validatedArgs)),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.InternalError, `Error executing tool '${name}': ${errorMessage}`);
  }
});

async function main() {
  try {
    console.error(`Starting Jira Zephyr MCP server v${SERVER_VERSION}...`);
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('Jira Zephyr MCP server running...');
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.error('Received SIGINT, shutting down gracefully...');
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      console.error('Received SIGTERM, shutting down gracefully...');
      process.exit(0);
    });

    // Keep the process alive
    await new Promise(() => {});
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to start MCP server:', errorMessage);
    if (errorMessage.includes('Configuration validation failed')) {
      console.error('Please check your environment variables and try again.');
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error during server startup:', err);
  process.exit(1);
});