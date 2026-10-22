import { ZephyrClient } from '../clients/zephyr-client.js';
import { htmlToText } from '../utils/text.js';
import {
  createTestPlanSchema,
  listTestPlansSchema,
  CreateTestPlanInput,
  ListTestPlansInput,
} from '../utils/validation.js';

let zephyrClient: ZephyrClient | null = null;

const getZephyrClient = (): ZephyrClient => {
  if (!zephyrClient) {
    zephyrClient = new ZephyrClient();
  }
  return zephyrClient;
};

export const createTestPlan = async (input: CreateTestPlanInput) => {
  const validatedInput = createTestPlanSchema.parse(input);

  try {
    const testPlan = await getZephyrClient().createTestPlan({
      name: validatedInput.name,
      description: validatedInput.description,
      projectKey: validatedInput.projectKey,
    });

    return {
      success: true,
      data: {
        id: testPlan.id,
        key: testPlan.key,
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

export const listTestPlans = async (input: ListTestPlansInput) => {
  const validatedInput = listTestPlansSchema.parse(input);

  try {
    const client = getZephyrClient();
    const result = await client.getTestPlans(
      validatedInput.projectKey,
      validatedInput.limit,
      validatedInput.offset
    );

    return {
      success: true,
      data: {
        total: result.total,
        offset: validatedInput.offset,
        returned: result.values.length,
        testPlans: await Promise.all(result.values.map(async plan => ({
          id: plan.id,
          key: plan.key,
          name: plan.name,
          objective: htmlToText(plan.objective),
          status: await client.resolveName('statuses', plan.status),
          folder: await client.resolveName('folders', plan.folder),
          labels: plan.labels ?? [],
          ownerAccountId: plan.owner?.accountId ?? null,
          testCycleIds: plan.links?.testCycles?.map(link => link.testCycleId) ?? [],
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
