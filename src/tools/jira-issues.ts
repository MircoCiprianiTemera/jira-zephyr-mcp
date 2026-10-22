import { JiraClient } from '../clients/jira-client.js';
import { readJiraIssueSchema, ReadJiraIssueInput } from '../utils/validation.js';

let jiraClient: JiraClient | null = null;

const getJiraClient = (): JiraClient => {
  if (!jiraClient) {
    jiraClient = new JiraClient();
  }
  return jiraClient;
};

// Output keys whose name differs from the JIRA field name
const OUTPUT_KEYS: Record<string, string> = {
  issuetype: 'issueType',
};

// Keeps only the requested fields, so fields that were not asked for are not shown as null
const pickRequestedFields = (data: Record<string, unknown>, fields: string[]) => {
  const wanted = new Set(fields.map(field => OUTPUT_KEYS[field] ?? field));
  const wantsCustomFields = fields.some(field => field.startsWith('customfield_'));
  return Object.fromEntries(
    Object.entries(data).filter(([key]) =>
      key === 'key' || wanted.has(key) || (key === 'customFields' && wantsCustomFields)
    )
  );
};

export const readJiraIssue = async (input: ReadJiraIssueInput) => {
  const validatedInput = readJiraIssueSchema.parse(input);
  
  try {
    const issue = await getJiraClient().getIssue(validatedInput.issueKey, validatedInput.fields);
    
    const data: Record<string, unknown> = {
      key: issue.key,
      summary: issue.fields?.summary || null,
      description: issue.fields?.description || null,
      status: issue.fields?.status ? {
        name: issue.fields.status.name,
        category: issue.fields.status.statusCategory?.name || 'Unknown',
      } : null,
      priority: issue.fields?.priority?.name || null,
      assignee: issue.fields?.assignee ? {
        name: issue.fields.assignee.displayName,
        email: issue.fields.assignee.emailAddress,
      } : null,
      reporter: issue.fields?.reporter ? {
        name: issue.fields.reporter.displayName,
        email: issue.fields.reporter.emailAddress,
      } : null,
      created: issue.fields?.created || null,
      updated: issue.fields?.updated || null,
      issueType: issue.fields?.issuetype?.name || null,
      project: issue.fields?.project ? {
        key: issue.fields.project.key,
        name: issue.fields.project.name,
      } : null,
      labels: issue.fields?.labels || [],
      components: issue.fields?.components?.map(c => c.name) || [],
      fixVersions: issue.fields?.fixVersions?.map(v => v.name) || [],
      customFields: issue.fields ? Object.entries(issue.fields)
        .filter(([key]) => key.startsWith('customfield_'))
        .reduce((acc, [key, value]) => ({
          ...acc,
          [key]: value,
        }), {}) : {},
    };

    return {
      success: true,
      data: validatedInput.fields ? pickRequestedFields(data, validatedInput.fields) : data,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.errorMessages?.[0] || error.message,
    };
  }
};

export const searchJiraIssues = async (input: {
  jql: string;
  fields?: string[];
  maxResults?: number;
}) => {
  try {
    const result = await getJiraClient().searchIssues(
      input.jql,
      input.fields,
      input.maxResults || 50
    );
    
    return {
      success: true,
      data: {
        total: result.total,
        issues: result.issues.map(issue => ({
          key: issue.key,
          summary: issue.fields?.summary || 'No Summary',
          status: issue.fields?.status?.name || 'Unknown',
          assignee: issue.fields?.assignee?.displayName || 'Unassigned',
          project: issue.fields?.project?.key || 'Unknown',
          issueType: issue.fields?.issuetype?.name || 'Unknown',
          updated: issue.fields?.updated || null,
        })),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.errorMessages?.[0] || error.message,
    };
  }
};