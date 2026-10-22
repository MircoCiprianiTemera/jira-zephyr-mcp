import axios, { AxiosInstance } from 'axios';
import { getZephyrHeaders } from '../utils/config.js';
import { htmlToText } from '../utils/text.js';
import {
  ZephyrTestPlan,
  ZephyrTestCycle,
  ZephyrTestExecution,
  ZephyrTestCase,
  ZephyrTestStep,
  ZephyrTestReport,
  ZephyrExecutionSummary,
  ZephyrReportExecution,
  ZephyrAttachment,
  ZephyrCreatedResource,
  ZephyrPage,
} from '../types/zephyr-types.js';

// The API caps a page at 1000 results and may enforce a lower limit
const PAGE_SIZE = 1000;
// POST /teststeps accepts at most 100 steps per request
const MAX_STEPS_PER_REQUEST = 100;

export interface TestScriptInput {
  type: 'STEP_BY_STEP' | 'PLAIN_TEXT';
  steps?: Array<{
    index: number;
    description: string;
    testData?: string;
    expectedResult: string;
  }>;
  text?: string;
}

export interface TestCaseInput {
  projectKey: string;
  name: string;
  objective?: string;
  precondition?: string;
  estimatedTime?: number;
  priority?: string;
  status?: string;
  folderId?: number;
  labels?: string[];
  componentId?: number;
  ownerId?: string;
  customFields?: Record<string, any>;
  testScript?: TestScriptInput;
}

type NamedResource = 'priorities' | 'statuses' | 'folders';

export class ZephyrClient {
  private readonly client: AxiosInstance;
  private readonly nameCache = new Map<string, Promise<string | null>>();
  private readonly projectKeyCache = new Map<number, Promise<string>>();

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.zephyrscale.smartbear.com/v2',
      headers: getZephyrHeaders(),
      timeout: 30000,
    });
  }

  // Follows startAt/maxResults pagination until the last page or until `limit` results are collected
  private async getAllPages<T>(
    path: string,
    params: Record<string, unknown> = {},
    options: { limit?: number; startAt?: number } = {}
  ): Promise<ZephyrPage<T>> {
    const values: T[] = [];
    let total = 0;
    let startAt = options.startAt ?? 0;

    while (true) {
      const remaining = options.limit === undefined ? PAGE_SIZE : options.limit - values.length;
      const response = await this.client.get(path, {
        params: { ...params, startAt, maxResults: Math.min(PAGE_SIZE, remaining) },
      });
      const page: T[] = response.data.values ?? [];
      values.push(...page);
      total = response.data.total ?? (options.startAt ?? 0) + values.length;
      startAt += page.length;

      if (
        response.data.isLast ||
        page.length === 0 ||
        startAt >= total ||
        (options.limit !== undefined && values.length >= options.limit)
      ) {
        break;
      }
    }

    return { values, total };
  }

  async resolveName(resource: NamedResource, ref?: { id: number } | null): Promise<string | null> {
    if (!ref) {
      return null;
    }
    const cacheKey = `${resource}/${ref.id}`;
    if (!this.nameCache.has(cacheKey)) {
      this.nameCache.set(
        cacheKey,
        this.client
          .get(`/${resource}/${ref.id}`)
          .then(response => response.data.name ?? null)
          .catch(() => null)
      );
    }
    return this.nameCache.get(cacheKey)!;
  }

  async resolveProjectKey(ref: { id: number }): Promise<string> {
    if (!this.projectKeyCache.has(ref.id)) {
      this.projectKeyCache.set(
        ref.id,
        this.client
          .get(`/projects/${ref.id}`)
          .then(response => response.data.key)
          .catch(() => String(ref.id))
      );
    }
    return this.projectKeyCache.get(ref.id)!;
  }

  async createTestPlan(data: {
    name: string;
    description?: string;
    projectKey: string;
  }): Promise<ZephyrCreatedResource> {
    const payload = {
      name: data.name,
      objective: data.description,
      projectKey: data.projectKey,
    };

    const response = await this.client.post('/testplans', payload);
    return response.data;
  }

  async getTestPlans(projectKey: string, limit = 50, offset = 0): Promise<ZephyrPage<ZephyrTestPlan>> {
    return this.getAllPages<ZephyrTestPlan>('/testplans', { projectKey }, { limit, startAt: offset });
  }

  async createTestCycle(data: {
    name: string;
    description?: string;
    projectKey: string;
    versionId?: number;
    startDate?: string;
    endDate?: string;
  }): Promise<ZephyrCreatedResource> {
    const payload = {
      name: data.name,
      description: data.description,
      projectKey: data.projectKey,
      jiraProjectVersion: data.versionId,
      plannedStartDate: data.startDate,
      plannedEndDate: data.endDate,
    };

    const response = await this.client.post('/testcycles', payload);
    return response.data;
  }

  async getTestCycles(projectKey: string, versionId?: number, limit = 50, offset = 0): Promise<ZephyrPage<ZephyrTestCycle>> {
    const params = {
      projectKey,
      jiraProjectVersionId: versionId,
    };

    return this.getAllPages<ZephyrTestCycle>('/testcycles', params, { limit, startAt: offset });
  }

  async getTestCycle(cycleIdOrKey: string): Promise<ZephyrTestCycle> {
    const response = await this.client.get(`/testcycles/${cycleIdOrKey}`);
    return response.data;
  }

  // GET /testexecutions only filters by cycle key, so a numeric id is resolved first
  async getTestExecutions(cycleIdOrKey: string): Promise<ZephyrTestExecution[]> {
    const cycleKey = /^\d+$/.test(cycleIdOrKey)
      ? (await this.getTestCycle(cycleIdOrKey)).key
      : cycleIdOrKey;
    const { values } = await this.getAllPages<ZephyrTestExecution>('/testexecutions', { testCycle: cycleKey });
    return values;
  }

  async getTestExecution(executionIdOrKey: string): Promise<ZephyrTestExecution> {
    const response = await this.client.get(`/testexecutions/${executionIdOrKey}`);
    return response.data;
  }

  async updateTestExecution(data: {
    executionId: string;
    statusName: string;
    comment?: string;
  }): Promise<void> {
    const payload = {
      statusName: data.statusName,
      comment: data.comment,
    };

    await this.client.put(`/testexecutions/${data.executionId}`, payload);
  }

  async linkTestExecutionToIssue(executionIdOrKey: string, issueId: number): Promise<void> {
    await this.client.post(`/testexecutions/${executionIdOrKey}/links/issues`, { issueId });
  }

  async getTestExecutionSummary(cycleIdOrKey: string): Promise<ZephyrExecutionSummary> {
    return this.summarizeExecutions(await this.getTestExecutions(cycleIdOrKey));
  }

  private async summarizeExecutions(executions: ZephyrTestExecution[]): Promise<ZephyrExecutionSummary> {
    const statusNames = await Promise.all(
      executions.map(execution => this.resolveName('statuses', execution.testExecutionStatus))
    );

    const summary: ZephyrExecutionSummary = {
      total: 0,
      passed: 0,
      failed: 0,
      blocked: 0,
      inProgress: 0,
      notExecuted: 0,
      passRate: 0,
      byStatus: {},
    };

    for (const statusName of statusNames) {
      const name = statusName ?? 'Unknown';
      summary.total++;
      summary.byStatus[name] = (summary.byStatus[name] ?? 0) + 1;
      switch (name.toLowerCase()) {
        case 'pass':
          summary.passed++;
          break;
        case 'fail':
          summary.failed++;
          break;
        case 'blocked':
          summary.blocked++;
          break;
        case 'in progress':
          summary.inProgress++;
          break;
        case 'not executed':
          summary.notExecuted++;
          break;
      }
    }

    summary.passRate = summary.total > 0 ? (summary.passed / summary.total) * 100 : 0;
    return summary;
  }

  async linkTestCaseToIssue(testCaseKey: string, issueId: number): Promise<void> {
    await this.client.post(`/testcases/${testCaseKey}/links/issues`, { issueId });
  }

  async generateTestReport(cycleIdOrKey: string): Promise<ZephyrTestReport> {
    const cycle = await this.getTestCycle(cycleIdOrKey);
    const executions = await this.getTestExecutions(cycle.key);
    const summary = await this.summarizeExecutions(executions);

    const reportExecutions: ZephyrReportExecution[] = await Promise.all(
      executions.map(async execution => ({
        key: execution.key,
        testCaseKey: execution.testCase?.self?.match(/\/testcases\/([^/]+)/)?.[1] ?? null,
        status: (await this.resolveName('statuses', execution.testExecutionStatus)) ?? 'Unknown',
        comment: htmlToText(execution.comment),
        actualEndDate: execution.actualEndDate ?? null,
        executedById: execution.executedById ?? null,
        issueIds: execution.links?.issues?.map(issue => issue.issueId) ?? [],
      }))
    );

    return {
      cycleKey: cycle.key,
      cycleName: cycle.name,
      projectKey: await this.resolveProjectKey(cycle.project),
      summary,
      executions: reportExecutions,
      generatedOn: new Date().toISOString(),
    };
  }

  async getTestCase(testCaseId: string): Promise<ZephyrTestCase> {
    const response = await this.client.get(`/testcases/${testCaseId}`);
    return response.data;
  }

  async getTestSteps(testCaseId: string): Promise<ZephyrPage<ZephyrTestStep>> {
    return this.getAllPages<ZephyrTestStep>(`/testcases/${testCaseId}/teststeps`);
  }

  async getAttachments(testCaseId: string, stepId?: number): Promise<ZephyrAttachment[]> {
    const path = stepId === undefined
      ? `/testcases/${testCaseId}/attachments`
      : `/testcases/${testCaseId}/teststeps/${stepId}/attachments`;
    try {
      const response = await this.client.get(path);
      return response.data.attachments ?? [];
    } catch (error: any) {
      // A step without attachments answers 404 instead of an empty list
      if (stepId !== undefined && error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  async downloadAttachment(testCaseId: string, attachmentId: number, stepId?: number): Promise<Buffer> {
    const path = stepId === undefined
      ? `/testcases/${testCaseId}/attachments/${attachmentId}`
      : `/testcases/${testCaseId}/teststeps/${stepId}/attachments/${attachmentId}`;
    const response = await this.client.get(path, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }

  // There is no text search in the v2 API: the query is matched on key and name client side
  async searchTestCases(projectKey: string, query?: string, limit = 50, folderId?: number): Promise<{
    testCases: ZephyrTestCase[];
    total: number;
  }> {
    const params = { projectKey, folderId };

    if (!query) {
      const { values, total } = await this.getAllPages<ZephyrTestCase>('/testcases', params, { limit });
      return { testCases: values, total };
    }

    const needle = query.toLowerCase();
    const { values } = await this.getAllPages<ZephyrTestCase>('/testcases', params);
    const matches = values.filter(
      testCase => testCase.key.toLowerCase().includes(needle) || testCase.name.toLowerCase().includes(needle)
    );
    return {
      testCases: matches.slice(0, limit),
      total: matches.length,
    };
  }

  async createTestCase(data: TestCaseInput): Promise<ZephyrCreatedResource & { stepsCreated: number }> {
    const payload = {
      projectKey: data.projectKey,
      name: data.name,
      objective: data.objective,
      precondition: data.precondition,
      estimatedTime: data.estimatedTime,
      priorityName: data.priority,
      statusName: data.status,
      folderId: data.folderId,
      labels: data.labels && data.labels.length > 0 ? data.labels : undefined,
      componentId: data.componentId,
      ownerId: data.ownerId,
      customFields: data.customFields,
    };

    const response = await this.client.post('/testcases', payload);
    const created: ZephyrCreatedResource = response.data;

    // The test script is not part of POST /testcases and has to be saved separately
    let stepsCreated = 0;
    if (data.testScript) {
      try {
        stepsCreated = await this.saveTestScript(created.key, data.testScript);
      } catch (error: any) {
        const message = error.response?.data?.message || error.message;
        throw new Error(`Test case ${created.key} was created, but its test script could not be saved: ${message}`);
      }
    }

    return { ...created, stepsCreated };
  }

  private async saveTestScript(testCaseKey: string, testScript: TestScriptInput): Promise<number> {
    if (testScript.type === 'PLAIN_TEXT') {
      if (testScript.text) {
        await this.client.post(`/testcases/${testCaseKey}/testscript`, { type: 'plain', text: testScript.text });
      }
      return 0;
    }

    const steps = [...(testScript.steps ?? [])].sort((a, b) => a.index - b.index);
    for (let i = 0; i < steps.length; i += MAX_STEPS_PER_REQUEST) {
      const items = steps.slice(i, i + MAX_STEPS_PER_REQUEST).map(step => ({
        inline: {
          description: step.description,
          testData: step.testData,
          expectedResult: step.expectedResult,
        },
      }));
      await this.client.post(`/testcases/${testCaseKey}/teststeps`, {
        mode: i === 0 ? 'OVERWRITE' : 'APPEND',
        items,
      });
    }
    return steps.length;
  }

  async createMultipleTestCases(testCases: TestCaseInput[], continueOnError = true): Promise<{
    results: Array<{
      index: number;
      success: boolean;
      data?: ZephyrCreatedResource & { stepsCreated: number };
      error?: string;
    }>;
    summary: {
      total: number;
      successful: number;
      failed: number;
    };
  }> {
    const results = [];
    let successful = 0;
    let failed = 0;

    for (let i = 0; i < testCases.length; i++) {
      try {
        const testCase = await this.createTestCase(testCases[i]);
        results.push({
          index: i,
          success: true,
          data: testCase,
        });
        successful++;
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.message;
        results.push({
          index: i,
          success: false,
          error: errorMessage,
        });
        failed++;

        if (!continueOnError) {
          break;
        }
      }
    }

    return {
      results,
      summary: {
        total: testCases.length,
        successful,
        failed,
      },
    };
  }
}
