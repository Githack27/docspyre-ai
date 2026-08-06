import { prisma } from '../../../db/prisma';
import { GOLDEN_SET, type EvalCase } from './golden-set';
import { retrieverService } from '../retriever.service';
import { generatorService } from '../generator.service';
import { verifierService } from '../verifier.service';
import { randomUUID } from 'node:crypto';

// Setup Mock Express Response to capture streamed data during evaluations
class MockExpressResponse {
  public headers: any = {};
  public dataChunks: string[] = [];
  public ended = false;

  setHeader(name: string, value: any): void {
    this.headers[name] = value;
  }
  flushHeaders(): void {}
  write(chunk: any): boolean {
    this.dataChunks.push(chunk.toString());
    return true;
  }
  end(): void {
    this.ended = true;
  }
}

async function setupTestData(docId: string): Promise<void> {
  console.log(`[EvalHarness] Creating test document and sample chunks in database...`);

  // Insert mock document
  await prisma.document.upsert({
    where: { id: docId },
    update: { deletedAt: null, ingestionStatus: 'READY' },
    create: {
      id: docId,
      ownerId: '00000000-0000-0000-0000-000000000000', // System user or seed owner
      name: 'System Evaluation Benchmark',
      storageKey: 'eval_mock_doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 102400,
      pageCount: 3,
      ingestionStatus: 'READY'
    }
  });

  // Sample texts corresponding to GOLDEN_SET expectations on specific pages
  const mockChunks = [
    // Page 1
    {
      text: 'This agreement constitutes the governing law under the State of New York. The baseline algorithms compared are BM25 and standard vector indexing.',
      page: 1,
      sectionPath: ['1. Terminology', '1.1 Legal Framework'],
      keywords: ['agreement', 'governing', 'law', 'state', 'new', 'york', 'baseline', 'algorithm', 'compared', 'bm25', 'indexing']
    },
    // Page 2
    {
      text: 'The termination notice period is ninety days. The year-over-year revenue growth showed a significant margin.',
      page: 2,
      sectionPath: ['2. Operations', '2.2 Growth Statistics'],
      keywords: ['termination', 'notice', 'ninety', 'days', 'year', 'revenue', 'growth', 'margin']
    },
    // Page 3
    {
      text: 'Performance evaluation results demonstrate significant latency improvements. The gross margin was fifty-five percent.',
      page: 3,
      sectionPath: ['3. Evaluation', '3.1 Performance'],
      keywords: ['performance', 'evaluation', 'results', 'latency', 'improvements', 'gross', 'margin']
    }
  ];

  await prisma.documentChunk.deleteMany({ where: { documentId: docId } });

  // Store parent chunks
  for (const mc of mockChunks) {
    const parentId = randomUUID();
    const childId = randomUUID();
    const embedding = new Array(768).fill(0.1); // Placeholder vector

    // Create Parent Chunk
    await prisma.documentChunk.create({
      data: {
        documentId: docId,
        chunkId: parentId,
        parentChunkId: null,
        page: mc.page,
        sectionPath: mc.sectionPath,
        bbox: [50, 100, 545, 150],
        chunkType: 'parent',
        text: mc.text,
        embedding,
        keywords: mc.keywords
      }
    });

    // Create Child Chunk
    await prisma.documentChunk.create({
      data: {
        documentId: docId,
        chunkId: childId,
        parentChunkId: parentId,
        page: mc.page,
        sectionPath: mc.sectionPath,
        bbox: [50, 100, 545, 150],
        chunkType: 'child',
        text: mc.text,
        embedding,
        keywords: mc.keywords
      }
    });
  }
  console.log(`[EvalHarness] Test data setup complete.`);
}

async function cleanupTestData(docId: string): Promise<void> {
  console.log(`[EvalHarness] Cleaning up test data...`);
  await prisma.documentChunk.deleteMany({ where: { documentId: docId } });
  await prisma.document.deleteMany({ where: { id: docId } });
}

async function runEvaluations(): Promise<void> {
  const testDocId = '11111111-1111-1111-1111-111111111111';

  try {
    // 1. Resolve or create user seed
    let seedUser = await prisma.user.findFirst();
    if (!seedUser) {
      console.log(`[EvalHarness] Creating seed user for database compatibility...`);
      seedUser = await prisma.user.create({
        data: {
          id: '00000000-0000-0000-0000-000000000000',
          email: 'system.eval@docspyre.local',
          emailNormalized: 'system.eval@docspyre.local',
          passwordHash: 'placeholder',
          firstName: 'System',
          lastName: 'Eval'
        }
      });
    }

    await setupTestData(testDocId);

    console.log(`\n==================================================`);
    console.log(`Starting Document Chat Regression Evaluation Harness`);
    console.log(`==================================================\n`);

    const results = [];
    let passedCount = 0;
    let totalLatency = 0;

    for (const testCase of GOLDEN_SET) {
      console.log(`Running Case [${testCase.id}] (${testCase.documentType}): "${testCase.query}"`);
      const startTime = Date.now();

      // Retrieve Context
      const retrieved = await retrieverService.retrieve(testCase.query, { documentId: testDocId });

      // Classify Intent
      const intent = await generatorService.classifyIntent(testCase.query);

      // Generate response via Mock Express response to capture SSE stream
      const mockRes = new MockExpressResponse();
      const genResult = await generatorService.streamResponse(testCase.query, intent, retrieved, mockRes as any);

      // Verify response claims
      const verification = await verifierService.verifyAnswer(genResult.text, genResult.citations, retrieved);

      const duration = Date.now() - startTime;
      totalLatency += duration;

      // Score relevance
      const containsExpected = genResult.text.toLowerCase().includes(testCase.expectedAnswerSubstring.toLowerCase());
      
      // Score citation accuracy
      const correctCitation = genResult.citations.some(c => c.page === testCase.expectedSourcePage);

      const passed = containsExpected && correctCitation && (verification.status === 'verified' || verification.claims.length > 0);
      if (passed) passedCount++;

      results.push({
        id: testCase.id,
        query: testCase.query,
        expectedPage: testCase.expectedSourcePage,
        containsExpected,
        correctCitation,
        verificationStatus: verification.status,
        latencyMs: duration,
        passed
      });

      console.log(`- Latency: ${duration}ms | Match: ${containsExpected} | Citations: ${correctCitation} | Status: ${verification.status}`);
      console.log(`- Result: ${passed ? 'PASSED' : 'FAILED'}\n`);
    }

    // Generate markdown report
    const accuracy = (passedCount / GOLDEN_SET.length) * 100;
    const avgLatency = totalLatency / GOLDEN_SET.length;

    console.log(`\n==================================================`);
    console.log(`Evaluation Execution Report`);
    console.log(`==================================================`);
    console.log(`| Test ID | Query | Expected Page | Relevance | Citation | Verifier Status | Latency | Pass/Fail |`);
    console.log(`|---|---|---|---|---|---|---|---|`);
    for (const r of results) {
      console.log(`| ${r.id} | ${r.query} | Page ${r.expectedPage} | ${r.containsExpected ? '✅' : '❌'} | ${r.correctCitation ? '✅' : '❌'} | ${r.verificationStatus} | ${r.latencyMs}ms | ${r.passed ? 'PASS' : 'FAIL'} |`);
    }
    console.log(`\nOverall Accuracy: ${accuracy.toFixed(1)}%`);
    console.log(`Average Latency: ${avgLatency.toFixed(0)}ms`);
    console.log(`==================================================\n`);

    await cleanupTestData(testDocId);
    process.exit(0);
  } catch (error) {
    console.error(`[EvalHarness] Execution failed:`, error);
    await cleanupTestData(testDocId);
    process.exit(1);
  }
}

// Execute if run directly from console
if (require.main === module) {
  runEvaluations();
}
export { runEvaluations };
