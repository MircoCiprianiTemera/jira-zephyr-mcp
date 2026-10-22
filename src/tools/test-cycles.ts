import { ZephyrClient } from '../clients/zephyr-client.js';
import { htmlToText } from '../utils/text.js';
import {
  createTestCycleSchema,
  listTestCyclesSchema,
  CreateTestCycleInput,
  ListTestCyclesInput,
} from '../utils/validation.js';

let zephyrClient: ZephyrClient | null = null;

const getZephyrClient = (): ZephyrClient => {
  if (!zephyrClient) {
    zephyrClient = new ZephyrClient();
  }
  return zephyrClient;
};

export const createTestCycle = async (input: CreateTestCycleInput) => {
  const validatedInput = createTestCycleSchema.parse(input);

  try {
    const testCycle = await getZephyrClient().createTestCycle({
      name: validatedInput.name,
      description: validatedInput.description,
      projectKey: validatedInput.projectKey,
      versionId: validatedInput.versionId,
      startDate: validatedInput.startDate,
      endDate: validatedInput.endDate,
    });

    return {
      success: true,
      data: {
        id: testCycle.id,
        key: testCycle.key,
        name: validatedInput.name,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
};

export const listTestCycles = async (input: ListTestCyclesInput) => {
  const validatedInput = listTestCyclesSchema.parse(input);

  try {
    const client = getZephyrClient();
    const result = await client.getTestCycles(
      validatedInput.projectKey,
      validatedInput.versionId,
      validatedInput.limit,
      validatedInput.offset
    );

    return {
      success: true,
      data: {
        total: result.total,
        offset: validatedInput.offset,
        returned: result.values.length,
        testCycles: await Promise.all(result.values.map(async cycle => ({
          id: cycle.id,
          key: cycle.key,
          name: cycle.name,
          description: htmlToText(cycle.description),
          status: await client.resolveName('statuses', cycle.status),
          folder: await client.resolveName('folders', cycle.folder),
          jiraProjectVersionId: cycle.jiraProjectVersion?.id ?? null,
          plannedStartDate: cycle.plannedStartDate ?? null,
          plannedEndDate: cycle.plannedEndDate ?? null,
          ownerAccountId: cycle.owner?.accountId ?? null,
        }))),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
};
