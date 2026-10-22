import { ZephyrClient } from '../clients/zephyr-client.js';
import { htmlToText } from '../utils/text.js';
import { ZephyrTestCase, ZephyrTestStep } from '../types/zephyr-types.js';
import {
  createTestCaseSchema,
  searchTestCasesSchema,
  createMultipleTestCasesSchema,
  CreateTestCaseInput,
  SearchTestCasesInput,
  CreateMultipleTestCasesInput,
  GetTestCaseAttachmentInput,
} from '../utils/validation.js';

let zephyrClient: ZephyrClient | null = null;

const getZephyrClient = (): ZephyrClient => {
  if (!zephyrClient) {
    zephyrClient = new ZephyrClient();
  }
  return zephyrClient;
};

const TEXT_EXTENSIONS = /\.(json|txt|csv|tsv|xml|html?|md|ya?ml|log|sql|ini|properties|feature)$/i;
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

// Drops null, undefined and empty-string fields to keep tool output small
const compact = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== null && value !== undefined && value !== '')
  ) as Partial<T>;

const describeTestCase = async (client: ZephyrClient, testCase: ZephyrTestCase) => {
  const [projectKey, priority, status, folder] = await Promise.all([
    client.resolveProjectKey(testCase.project),
    client.resolveName('priorities', testCase.priority),
    client.resolveName('statuses', testCase.status),
    client.resolveName('folders', testCase.folder),
  ]);

  return compact({
    id: testCase.id,
    key: testCase.key,
    name: testCase.name,
    projectKey,
    objective: htmlToText(testCase.objective),
    precondition: htmlToText(testCase.precondition),
    estimatedTime: testCase.estimatedTime,
    priority,
    status,
    folder: testCase.folder ? { id: testCase.folder.id, name: folder } : null,
    labels: testCase.labels && testCase.labels.length > 0 ? testCase.labels : null,
    componentId: testCase.component?.id,
    ownerAccountId: testCase.owner?.accountId,
    createdOn: testCase.createdOn,
    customFields: testCase.customFields && Object.keys(testCase.customFields).length > 0
      ? testCase.customFields
      : null,
    linkedIssueIds: testCase.links?.issues?.length ? testCase.links.issues.map(issue => issue.issueId) : null,
    webLinks: testCase.links?.webLinks?.length ? testCase.links.webLinks : null,
  });
};

// Lists stay small: the full test case is read with get_test_case
const summarizeTestCase = async (client: ZephyrClient, testCase: ZephyrTestCase) => {
  const [status, folder] = await Promise.all([
    client.resolveName('statuses', testCase.status),
    client.resolveName('folders', testCase.folder),
  ]);

  return compact({
    key: testCase.key,
    name: testCase.name,
    status,
    folder: testCase.folder ? { id: testCase.folder.id, name: folder } : null,
  });
};

const describeTestStep = (step: ZephyrTestStep, index: number) => {
  if (step.testCase) {
    const parameters = Object.fromEntries(
      step.testCase.parameters
        .map(parameter => [parameter.name, htmlToText(parameter.value)] as const)
        .filter(([, value]) => value !== null)
    );
    return compact({
      index,
      id: step.id,
      callTestCase: step.testCase.testCaseKey,
      parameters: Object.keys(parameters).length > 0 ? parameters : null,
    });
  }

  return compact({
    index,
    id: step.id,
    description: htmlToText(step.inline?.description),
    testData: htmlToText(step.inline?.testData),
    expectedResult: htmlToText(step.inline?.expectedResult),
  });
};

export const createTestCase = async (input: CreateTestCaseInput) => {
  const validatedInput = createTestCaseSchema.parse(input);

  try {
    const testCase = await getZephyrClient().createTestCase(validatedInput);

    return {
      success: true,
      data: {
        id: testCase.id,
        key: testCase.key,
        name: validatedInput.name,
        stepsCreated: testCase.stepsCreated,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
};

export const searchTestCases = async (input: SearchTestCasesInput) => {
  const validatedInput = searchTestCasesSchema.parse(input);

  try {
    const client = getZephyrClient();
    const result = await client.searchTestCases(
      validatedInput.projectKey,
      validatedInput.query,
      validatedInput.limit,
      validatedInput.folderId
    );

    return {
      success: true,
      data: {
        total: result.total,
        returned: result.testCases.length,
        projectKey: validatedInput.projectKey,
        testCases: await Promise.all(result.testCases.map(testCase => summarizeTestCase(client, testCase))),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
};

export const getTestCase = async (input: { testCaseId: string }) => {
  try {
    const client = getZephyrClient();
    const testCase = await client.getTestCase(input.testCaseId);

    return {
      success: true,
      data: await describeTestCase(client, testCase),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
};

export const getTestSteps = async (input: { testCaseId: string }) => {
  try {
    const result = await getZephyrClient().getTestSteps(input.testCaseId);

    return {
      success: true,
      data: {
        testCaseId: input.testCaseId,
        total: result.total,
        steps: result.values.map((step, i) => describeTestStep(step, i + 1)),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
};

export const listTestCaseAttachments = async (input: { testCaseId: string; includeSteps?: boolean }) => {
  try {
    const client = getZephyrClient();
    const attachments = await client.getAttachments(input.testCaseId);

    let stepAttachments;
    if (input.includeSteps) {
      const { values: steps } = await client.getTestSteps(input.testCaseId);
      const perStep = await Promise.all(
        steps.map(async (step, i) => ({
          stepIndex: i + 1,
          stepId: step.id,
          attachments: step.id === null ? [] : await client.getAttachments(input.testCaseId, step.id),
        }))
      );
      stepAttachments = perStep.filter(step => step.attachments.length > 0);
    }

    return {
      success: true,
      data: {
        testCaseId: input.testCaseId,
        attachments,
        stepAttachments,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
};

// Returns MCP content: text files as text (JSON minified), images as image content, anything else as base64
export const getTestCaseAttachment = async (input: GetTestCaseAttachmentInput) => {
  const client = getZephyrClient();
  const attachments = await client.getAttachments(input.testCaseId, input.stepId);
  const attachment = attachments.find(a => a.id === input.attachmentId);
  if (!attachment) {
    throw new Error(
      `Attachment ${input.attachmentId} not found on ${input.testCaseId}` +
      (input.stepId === undefined ? '' : ` step ${input.stepId}`)
    );
  }

  const data = await client.downloadAttachment(input.testCaseId, input.attachmentId, input.stepId);
  const header = `${attachment.name} (${data.length} bytes)`;
  const extension = attachment.name.split('.').pop()?.toLowerCase() ?? '';

  if (IMAGE_TYPES[extension]) {
    return [
      { type: 'text', text: header },
      { type: 'image', data: data.toString('base64'), mimeType: IMAGE_TYPES[extension] },
    ];
  }

  if (TEXT_EXTENSIONS.test(attachment.name)) {
    let text = data.toString('utf8');
    if (extension === 'json') {
      try {
        text = JSON.stringify(JSON.parse(text));
      } catch {
        // Not valid JSON: return it as is
      }
    }
    return [{ type: 'text', text: `${header}\n${text}` }];
  }

  return [{ type: 'text', text: `${header}, base64 encoded:\n${data.toString('base64')}` }];
};

export const createMultipleTestCases = async (input: CreateMultipleTestCasesInput) => {
  const validatedInput = createMultipleTestCasesSchema.parse(input);

  try {
    const result = await getZephyrClient().createMultipleTestCases(
      validatedInput.testCases,
      validatedInput.continueOnError
    );

    return {
      success: true,
      data: {
        results: result.results.map(r => ({
          index: r.index,
          success: r.success,
          testCase: r.success ? {
            id: r.data?.id,
            key: r.data?.key,
            name: validatedInput.testCases[r.index].name,
            stepsCreated: r.data?.stepsCreated,
          } : undefined,
          error: r.error,
        })),
        summary: result.summary,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
};
