export interface EvalCase {
  id: string;
  documentType: 'contract' | 'research_paper' | 'financial_report';
  query: string;
  expectedAnswerSubstring: string;
  expectedSourcePage: number;
}

export const GOLDEN_SET: EvalCase[] = [
  // 1. Contracts
  {
    id: 'contract-1',
    documentType: 'contract',
    query: 'What is the governing law of the contract?',
    expectedAnswerSubstring: 'governing law',
    expectedSourcePage: 1
  },
  {
    id: 'contract-2',
    documentType: 'contract',
    query: 'What is the duration of the agreement and termination notice?',
    expectedAnswerSubstring: 'termination',
    expectedSourcePage: 2
  },

  // 2. Research Papers
  {
    id: 'paper-1',
    documentType: 'research_paper',
    query: 'What are the main results of the performance evaluation?',
    expectedAnswerSubstring: 'performance',
    expectedSourcePage: 3
  },
  {
    id: 'paper-2',
    documentType: 'research_paper',
    query: 'Which baseline algorithms were compared against?',
    expectedAnswerSubstring: 'baseline',
    expectedSourcePage: 1
  },

  // 3. Financial Reports
  {
    id: 'financial-1',
    documentType: 'financial_report',
    query: 'What is the gross margin for the fiscal quarter?',
    expectedAnswerSubstring: 'gross margin',
    expectedSourcePage: 1
  },
  {
    id: 'financial-2',
    documentType: 'financial_report',
    query: 'What was the year-over-year revenue growth percentage?',
    expectedAnswerSubstring: 'growth',
    expectedSourcePage: 2
  }
];
