import { ZephyrClient } from '../clients/zephyr-client.js';
import { JiraClient } from '../clients/jira-client.js';
import { htmlToText } from '../utils/text.js';
import {
  executeTestSchema,
  getTestExecutionStatusSchema,
  linkTestsToIssuesSchema,
  generateTestReportSchema,
  ExecuteTestInput,
  GetTestExecutionStatusInput,
  LinkTestsToIssuesInput,
  GenerateTestReportInput,
} from '../utils/validation.js';
import { ZephyrTestReport } from '../types/zephyr-types.js';

let zephyrClient: ZephyrClient | null = null;

const getZephyrClient = (): ZephyrClient => {
  if (!zephyrClient) {
    zephyrClient = new ZephyrClient();
  }
  return zephyrClient;
};

let jiraClient: JiraClient | null = null;

const getJiraClient = (): JiraClient => {
  if (!jiraClient) {
    jiraClient = new JiraClient();
  }
  return jiraClient;
};

const EXECUTION_STATUS_NAMES: Record<ExecuteTestInput['status'], string> = {
  PASS: 'Pass',
  FAIL: 'Fail',
  WIP: 'In Progress',
  BLOCKED: 'Blocked',
  NOT_EXECUTED: 'Not Executed',
};

// Zephyr links take the numeric Jira issue id, not the key
const getIssueId = async (issueKey: string): Promise<number> => {
  const issue = await getJiraClient().getIssue(issueKey, ['summary']);
  return Number(issue.id);
};

export const executeTest = async (input: ExecuteTestInput) => {
  const validatedInput = executeTestSchema.parse(input);

  try {
    const client = getZephyrClient();
    await client.updateTestExecution({
      executionId: validatedInput.executionId,
      statusName: validatedInput.statusName ?? EXECUTION_STATUS_NAMES[validatedInput.status],
      comment: validatedInput.comment,
    });

    const defectResults = [];
    for (const issueKey of validatedInput.defects ?? []) {
      try {
        await client.linkTestExecutionToIssue(validatedInput.executionId, await getIssueId(issueKey));
        defectResults.push({ issueKey, success: true });
      } catch (error: any) {
        defectResults.push({
          issueKey,
          success: false,
          error: error.response?.data?.message || error.response?.data?.errorMessages?.[0] || error.message,
        });
      }
    }

    const execution = await client.getTestExecution(validatedInput.executionId);

    return {
      success: true,
      data: {
        id: execution.id,
        key: execution.key,
        status: await client.resolveName('statuses', execution.testExecutionStatus),
        comment: htmlToText(execution.comment),
        actualEndDate: execution.actualEndDate ?? null,
        executedById: execution.executedById ?? null,
        linkedIssueIds: execution.links?.issues?.map(issue => issue.issueId) ?? [],
        defectLinkResults: defectResults,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
};

export const getTestExecutionStatus = async (input: GetTestExecutionStatusInput) => {
  const validatedInput = getTestExecutionStatusSchema.parse(input);
  
  try {
    const summary = await getZephyrClient().getTestExecutionSummary(validatedInput.cycleId);
    
    return {
      success: true,
      data: {
        cycleId: validatedInput.cycleId,
        summary: {
          total: summary.total,
          passed: summary.passed,
          failed: summary.failed,
          blocked: summary.blocked,
          inProgress: summary.inProgress,
          notExecuted: summary.notExecuted,
          passRate: Math.round(summary.passRate),
          byStatus: summary.byStatus,
        },
        progress: {
          completed: summary.passed + summary.failed + summary.blocked,
          remaining: summary.notExecuted + summary.inProgress,
          completionPercentage: summary.total > 0 
            ? Math.round(((summary.passed + summary.failed + summary.blocked) / summary.total) * 100)
            : 0,
        },
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
};

export const linkTestsToIssues = async (input: LinkTestsToIssuesInput) => {
  const validatedInput = linkTestsToIssuesSchema.parse(input);
  
  try {
    const results = [];
    
    for (const issueKey of validatedInput.issueKeys) {
      try {
        await getZephyrClient().linkTestCaseToIssue(validatedInput.testCaseId, await getIssueId(issueKey));
        results.push({
          issueKey,
          success: true,
        });
      } catch (error: any) {
        results.push({
          issueKey,
          success: false,
          error: error.response?.data?.message || error.response?.data?.errorMessages?.[0] || error.message,
        });
      }
    }
    
    return {
      success: true,
      data: {
        testCaseId: validatedInput.testCaseId,
        linkResults: results,
        successCount: results.filter(r => r.success).length,
        failureCount: results.filter(r => !r.success).length,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
};

export const generateTestReport = async (input: GenerateTestReportInput) => {
  const validatedInput = generateTestReportSchema.parse(input);
  
  try {
    const report = await getZephyrClient().generateTestReport(validatedInput.cycleId);
    
    if (validatedInput.format === 'HTML') {
      const htmlReport = generateHtmlReport(report);
      return {
        success: true,
        data: {
          format: 'HTML',
          content: htmlReport,
          generatedOn: report.generatedOn,
        },
      };
    }
    
    return {
      success: true,
      data: {
        format: 'JSON',
        content: report,
        generatedOn: report.generatedOn,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || error.message,
    };
  }
};

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

const STATUS_CLASSES: Record<string, string> = {
  pass: 'pass',
  fail: 'fail',
  blocked: 'blocked',
  'in progress': 'progress',
};

const generateHtmlReport = (report: ZephyrTestReport) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Test Execution Report - ${escapeHtml(report.cycleName)}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background-color: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { background-color: #e8f4f8; padding: 15px; border-radius: 5px; text-align: center; }
        .metric h3 { margin: 0 0 10px 0; }
        .metric .value { font-size: 24px; font-weight: bold; }
        .executions { margin-top: 30px; }
        .execution { padding: 10px; border-left: 4px solid #ddd; margin: 10px 0; }
        .execution.pass { border-left-color: #4caf50; }
        .execution.fail { border-left-color: #f44336; }
        .execution.blocked { border-left-color: #ff9800; }
        .execution.progress { border-left-color: #2196f3; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Test Execution Report</h1>
        <h2>${escapeHtml(report.cycleKey)} - ${escapeHtml(report.cycleName)}</h2>
        <p>Project: ${report.projectKey}</p>
        <p>Generated: ${new Date(report.generatedOn).toLocaleString()}</p>
      </div>
      
      <div class="summary">
        <div class="metric">
          <h3>Total Tests</h3>
          <div class="value">${report.summary.total}</div>
        </div>
        <div class="metric">
          <h3>Passed</h3>
          <div class="value">${report.summary.passed}</div>
        </div>
        <div class="metric">
          <h3>Failed</h3>
          <div class="value">${report.summary.failed}</div>
        </div>
        <div class="metric">
          <h3>Blocked</h3>
          <div class="value">${report.summary.blocked}</div>
        </div>
        <div class="metric">
          <h3>Pass Rate</h3>
          <div class="value">${Math.round(report.summary.passRate)}%</div>
        </div>
      </div>
      
      <div class="executions">
        <h3>Test Executions</h3>
        ${report.executions.map(exec => `
          <div class="execution ${STATUS_CLASSES[exec.status.toLowerCase()] ?? ''}">
            <strong>${escapeHtml(exec.key)}</strong>${exec.testCaseKey ? ` (${escapeHtml(exec.testCaseKey)})` : ''} - ${escapeHtml(exec.status)}
            ${exec.comment ? `<p>${escapeHtml(exec.comment)}</p>` : ''}
            ${exec.issueIds.length > 0 ? `<p>Linked issues: ${exec.issueIds.join(', ')}</p>` : ''}
          </div>
        `).join('')}
      </div>
    </body>
    </html>
  `;
};