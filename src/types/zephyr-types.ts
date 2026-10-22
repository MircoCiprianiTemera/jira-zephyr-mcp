export interface ZephyrRef {
  id: number;
  self: string;
}

export interface ZephyrOwner {
  accountId: string;
  self: string;
}

export interface ZephyrPage<T> {
  values: T[];
  total: number;
}

export interface ZephyrCreatedResource {
  id: number;
  key: string;
  self: string;
}

export interface ZephyrTestPlan {
  id: number;
  key: string;
  name: string;
  objective?: string | null;
  project: ZephyrRef;
  status?: ZephyrRef | null;
  folder?: ZephyrRef | null;
  owner?: ZephyrOwner | null;
  labels?: string[];
  customFields?: Record<string, any>;
  links?: {
    issues?: Array<{ issueId: number }>;
    webLinks?: any[];
    testCycles?: Array<{ id: number; testCycleId: number }>;
  };
}

export interface ZephyrTestCycle {
  id: number;
  key: string;
  name: string;
  description?: string | null;
  project: ZephyrRef;
  jiraProjectVersion?: ZephyrRef | null;
  status?: ZephyrRef | null;
  folder?: ZephyrRef | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  owner?: ZephyrOwner | null;
  customFields?: Record<string, any>;
  links?: {
    issues?: Array<{ issueId: number }>;
    webLinks?: any[];
    testPlans?: any[];
  };
}

export interface ZephyrTestExecution {
  id: number;
  key: string;
  project: ZephyrRef;
  testCase: ZephyrRef;
  environment?: ZephyrRef | null;
  jiraProjectVersion?: ZephyrRef | null;
  testExecutionStatus: ZephyrRef;
  actualEndDate?: string | null;
  estimatedTime?: number | null;
  executionTime?: number | null;
  executedById?: string | null;
  assignedToId?: string | null;
  comment?: string | null;
  automated?: boolean;
  testCycle?: ZephyrRef | null;
  customFields?: Record<string, any>;
  links?: {
    self: string;
    issues?: Array<{ issueId: number }>;
  };
}

export interface ZephyrTestCase {
  id: number;
  key: string;
  name: string;
  objective?: string | null;
  precondition?: string | null;
  estimatedTime?: number | null;
  labels?: string[];
  createdOn: string;
  project: ZephyrRef;
  component?: ZephyrRef | null;
  priority?: ZephyrRef | null;
  status?: ZephyrRef | null;
  folder?: ZephyrRef | null;
  owner?: ZephyrOwner | null;
  testScript?: {
    self: string;
  };
  customFields?: Record<string, any>;
  links?: {
    self: string;
    issues?: Array<{
      self: string;
      issueId: number;
      id: number;
      target: string;
      type: string;
    }>;
    webLinks?: any[];
  };
}

export interface ZephyrTestStep {
  id: number | null;
  inline?: {
    description: string | null;
    testData: string | null;
    expectedResult: string | null;
  } | null;
  testCase?: {
    self: string;
    testCaseKey: string;
    parameters: Array<{ name: string; type: string; value: string }>;
  } | null;
}

export interface ZephyrAttachment {
  id: number;
  name: string;
}

export interface ZephyrExecutionSummary {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  inProgress: number;
  notExecuted: number;
  passRate: number;
  byStatus: Record<string, number>;
}

export interface ZephyrReportExecution {
  key: string;
  testCaseKey: string | null;
  status: string;
  comment: string | null;
  actualEndDate: string | null;
  executedById: string | null;
  issueIds: number[];
}

export interface ZephyrTestReport {
  cycleKey: string;
  cycleName: string;
  projectKey: string;
  summary: ZephyrExecutionSummary;
  executions: ZephyrReportExecution[];
  generatedOn: string;
}
