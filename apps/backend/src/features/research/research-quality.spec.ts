import { ResearchService } from './research.service';
import type { ResearchStoryRecord, HnStory, TriageDecision } from '../hacker-news/hacker-news.types';

const service = new ResearchService({} as any, {} as any, {} as any, {} as any);
const methods = service as any;

function lead(
  id: number, title: string, primaryTopic: string, topicKey: string,
  issueKeys: string[] = ['calibration', 'benchmarking'],
  score = 20, descendants = 4,
): ResearchStoryRecord {
  return {
    story: {
      id, title, score, descendants, text: '', hnUrl: `https://news.ycombinator.com/item?id=${id}`,
      by: 'tester', time: 0, kids: [], sources: ['top'], sourceRanks: { top: 1 },
    },
    triage: {
      storyId: id, priority: 'medium', investigate: true,
      followExternalLink: false, likelyTopics: [], topicKey, reason: 'test',
    },
    comments: [], external: { status: 'no-external-url' },
    evidenceBasis: 'hn-submission-only',
    analysis: {
      primaryTopic, topicKey, issueKeys, subtopics: [], technologies: [],
      sourceUsability: 'not-applicable',
      sourceSummary: '', discussionSummary: '', discussionClaims: [],
      whyDevelopersCare: 'Relevant to this story',
      problems: [], questions: [], contentOpportunities: [],
    },
  } as ResearchStoryRecord;
}

describe('HN independent theme validation', () => {
  it('rejects seven unrelated leads given contaminated typed-decision-model labels', () => {
    const labels = [
      ['Show HN: Hob on-device AI desktop app', 'Hob local AI desktop'],
      ['Show HN: Kashkeshet agent-to-agent chat server', 'Kashkeshet agent communication'],
      ['Oldest GUI application running on Windows 11', 'Windows legacy software'],
      ['Ask HN: Reading software architecture books', 'Software architecture books'],
      ['The Mythical Man-Month in the Age of AI', 'Software project management'],
      ['Show HN: Freedraw collaborative canvas', 'Freedraw collaborative drawing'],
      ['Glider 4.0 unofficial web edition Mac game port', 'Glider Mac game port'],
    ];
    const records = labels.map(([title, topic], i) =>
      lead(5000 + i, title, topic, 'typed-decision-models'));
    expect(methods.buildThemeCandidates(records)).toEqual([]);
  });

  it('recognizes genuinely related typed decision model stories', () => {
    const records = [
      lead(1, 'Jev typed decision model for classification', 'Jev typed decision models', 'typed-decision-models'),
      lead(2, 'JevBench benchmark for typed decision models', 'Typed decision models in JevBench', 'typed-decision-models'),
    ];
    expect(methods.buildThemeCandidates(records)).toEqual([
      expect.objectContaining({ topicKey: 'typed-decision-models', storyIds: [1, 2] }),
    ]);
  });

  it('cannot join unrelated stories using identical issueKeys', () => {
    const records = [
      lead(3, 'Freedraw collaborative canvas app', 'Freedraw collaboration', 'design-collaboration'),
      lead(4, 'Rete-based rules engine for routing', 'Rules engine', 'design-collaboration'),
    ];
    expect(methods.buildThemeCandidates(records)).toEqual([]);
  });
});

describe('HN selection is evidence-aware, not a fixed feed quota', () => {
  it('limits nearly unengaged discussion-free exploratory posts to one', () => {
    const records = [
      lead(10, 'Show HN: tiny new project A', 'tiny project', 'tiny-project', [], 2, 0),
      lead(11, 'Show HN: tiny new project B', 'tiny project', 'tiny-project', [], 2, 0),
      lead(12, 'Ask HN: practical developer discussion', 'developer discussion', 'developer-discussion', [], 25, 10),
    ];
    const candidates = records.map((r) => r.story) as HnStory[];
    const decisions = records.map((r) => ({
      ...r.triage, priority: r.story.id < 12 ? 'high' : 'medium',
    })) as TriageDecision[];
    const selected = methods.selectStories(candidates, decisions, {
      selectedItemLimit: 16, externalPageLimit: 16, excludeZeroCommentHnOnly: false,
    });
    expect(selected).toHaveLength(2);
    expect(selected.some((r: { story: HnStory }) => r.story.id === 12)).toBe(true);
  });
});

describe('HN actionable findings', () => {
  it('retains concrete HN engagement in the no-theme summary', () => {
    const records = [
      lead(20, 'Oldest GUI application that runs on Windows 11', 'Windows compatibility', 'legacy-runtime', [], 391, 220),
      lead(21, 'Show HN: Hob local AI desktop app', 'Local AI desktop', 'local-ai', [], 140, 32),
    ];
    const summary: string = methods.buildIndependentExecutiveSummary(records);
    expect(summary).toContain('391 points, 220 comments');
    expect(summary).toContain('Hob');
    expect(summary).toMatch(/no recurring/i);
    expect(summary).not.toContain('developers show growing interest');
  });

  it('rejects an unsupported setup tutorial but accepts a quoted complaint', () => {
    const kash = lead(31, 'Show HN: Kashkeshet agent-to-agent chat server', 'Kashkeshet', 'agent-comms');
    const proposed = {
      title: 'Kashkeshet setup tutorial',
      angle: 'Developers need instructions because setup is complex',
      evidenceQuote: 'Show HN: Kashkeshet agent-to-agent chat server',
      storyIds: [31], evidenceProvenance: {
        sourceStoryIds: [], discussionStoryIds: [], submissionStoryIds: [31],
      },
    };
    expect(methods.opportunityHasGroundedQuote(proposed, [kash])).toBe(false);

    const hob = lead(32, 'Show HN: Hob local AI desktop app', 'Hob', 'local-ai');
    hob.comments = [{
      id: 800, depth: 0, text: 'Hob model downloads cannot be moved from the default directory',
    }];
    const grounded = {
      title: 'Workarounds for Hob model storage',
      angle: 'How to move model downloads to another directory',
      evidenceQuote: 'model downloads cannot be moved from the default directory',
      storyIds: [32], evidenceProvenance: {
        sourceStoryIds: [], discussionStoryIds: [32], submissionStoryIds: [],
      },
    };
    expect(methods.opportunityHasGroundedQuote(grounded, [hob])).toBe(true);
  });
});

describe('Attribution of HN discussion-only claims', () => {
  it('does not present a commenter opinion as an unqualified fact', () => {
    const observed = methods.scopeDiscussionOnlyClaim(
      'AI agents are not yet reliable for managing complex software architecture.',
      'discussion-only',
    ) as string;
    expect(observed).toContain('cited HN discussion');
    expect(observed).toContain('AI agents are not yet reliable');
  });

  it('preserves independently source-backed statements', () => {
    const claim = 'The source describes a Windows compatibility layer.';
    expect(methods.scopeDiscussionOnlyClaim(claim, 'source-backed')).toBe(claim);
  });

  it('does not add duplicate attribution', () => {
    const claim = 'One commenter reported storage issues with the local model.';
    expect(methods.scopeDiscussionOnlyClaim(claim, 'discussion-only')).toBe(claim);
  });
});

describe('Batched triage breadth', () => {
  it('reviews a 100-story Deep pool in mixed-source batches without per-feed quotas', async () => {
    const candidates: HnStory[] = Array.from({ length: 100 }, (_, index) => {
      const record = lead(1000 + index, 'Technical subject ' + index,
        'Technical subject', 'test-key', [], 10 + index, 3);
      record.story.sources = [['top', 'new', 'ask', 'show'][index % 4] as 'top' | 'new' | 'ask' | 'show'];
      return record.story;
    });
    const spy = jest.spyOn(methods, 'triageStoryBatch')
      .mockImplementation(async (_config: unknown, _profile: unknown, batch: HnStory[], limit: number) => ({
        data: batch.slice(0, Math.min(3, limit)).map((story) => ({
          storyId: story.id, priority: 'medium', investigate: true,
          followExternalLink: Boolean(story.url), likelyTopics: [],
          topicKey: 'topic-' + story.id, reason: 'Specific technical research lead',
        })),
        usage: { calls: 1, inputTokens: 500, outputTokens: 90 },
      }));
    try {
      const result = await methods.triageStories(
        { sources: ['top', 'new', 'ask', 'show'], depth: 'deep' },
        { selectedItemLimit: 16 }, candidates);
      expect(result.batchCount).toBe(4);
      expect(result.data).toHaveLength(12);
      expect(result.usage.calls).toBe(4);
      expect(spy.mock.calls.map((call: unknown[]) => (call[2] as HnStory[]).length))
        .toEqual([25, 25, 25, 25]);
    } finally {
      spy.mockRestore();
    }
  });

  it('does not mandate a minimum when only one batch has viable leads', async () => {
    const candidates = Array.from({ length: 60 }, (_, i) =>
      lead(3000 + i, 'Research lead ' + i, 'Research topic', 'test-key').story);
    const spy = jest.spyOn(methods, 'triageStoryBatch')
      .mockImplementation(async (_c: unknown, _p: unknown, batch: HnStory[]) => ({
        data: batch[0].id === 3000 ? [{
          storyId: 3000, priority: 'high', investigate: true,
          followExternalLink: false, likelyTopics: [], topicKey: 'topic', reason: 'technical value',
        }] : [],
        usage: { calls: 1, inputTokens: 100, outputTokens: 50 },
      }));
    try {
      const result = await methods.triageStories(
        { sources: ['top', 'ask'], depth: 'standard' }, { selectedItemLimit: 10 }, candidates);
      expect(result.data).toHaveLength(1);
      expect(result.batchCount).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('Synthesis-aligned opportunity evidence', () => {
  it('accepts issue-relevant excerpts from analyzed discussion summaries', () => {
    const story = lead(40, 'The Mythical Man-Month in the Age of AI', 'Software coordination', 'project-work');
    story.comments = [{ id: 841, depth: 0, text: 'Agents get in one another’s way without someone coordinating the work.' }];
    story.analysis.discussionSummary =
      'HN commenters discussed the problems coordinating multiple AI agents, with redundant work across tasks.';
    const item = {
      title: 'Coordination patterns for parallel AI agents',
      angle: 'How to coordinate AI agents without redundant work',
      evidenceQuote: 'problems coordinating multiple AI agents, with redundant work across tasks',
      storyIds: [40], evidenceProvenance: {
        sourceStoryIds: [], discussionStoryIds: [40], submissionStoryIds: [],
      },
    };
    expect(methods.opportunityHasGroundedQuote(item, [story])).toBe(true);
  });

  it('accepts specific research questions from analyzed HN discussion', () => {
    const story = lead(41, 'Ask HN: How do you grow OSS projects?', 'Open-source growth', 'oss-adoption');
    story.comments = [{ id: 842, depth: 0, text: 'Do not spam people; talk to your existing users.' }];
    story.analysis.questions =
      ['How can OSS projects grow rapidly and sustainably without spammy tactics?'];
    const item = {
      title: 'Sustainable OSS growth without spam',
      angle: 'How can projects achieve sustainable growth without spammy marketing?',
      evidenceQuote: 'OSS projects grow rapidly and sustainably without spammy tactics',
      storyIds: [41], evidenceProvenance: {
        sourceStoryIds: [], discussionStoryIds: [41], submissionStoryIds: [],
      },
    };
    expect(methods.opportunityHasGroundedQuote(item, [story])).toBe(true);
  });

  it('rejects a summary quote assigned to the wrong evidence layer', () => {
    const story = lead(42, 'Project with discussion issue', 'Topic', 'source');
    story.comments = [];
    story.analysis.discussionSummary = 'Several comments discussed missing directory controls.';
    const item = {
      title: 'Directory controls',
      angle: 'How to fix missing directory controls',
      evidenceQuote: 'comments discussed missing directory controls',
      storyIds: [42], evidenceProvenance: {
        sourceStoryIds: [], discussionStoryIds: [42], submissionStoryIds: [],
      },
    };
    expect(methods.opportunityHasGroundedQuote(item, [story])).toBe(false);
  });
});

describe('Narrative summary and claim attribution', () => {
  it('describes the actual technical debate, not just story titles', () => {
    const story = lead(61, 'The Mythical Man-Month in the Age of AI',
      'Software project coordination', 'project-work', [], 104, 84);
    story.comments = [{ id: 862, depth: 0, text: 'Poor coordination makes agent work redundant.' }];
    story.analysis.discussionSummary =
      'HN commenters debated whether agent orchestration and unclear requirements still cause redundant work.';
    const summary: string = methods.buildIndependentExecutiveSummary([story]);
    expect(summary).toContain('104 points, 84 comments');
    expect(summary).toContain('agent orchestration');
    expect(summary).toContain('HN commenters debated');
  });

  it('attributes a reported scientific breakthrough rather than confirming it', () => {
    const story = lead(62, 'Research announcement', 'Scientific result', 'research');
    story.external = { status: 'success' };
    story.analysis.sourceSummary =
      'The researchers announced a new breakthrough in theoretical computing.';
    const sentence = methods.scopeUnverifiedSourceClaim(
      'Their breakthrough disproved a long-standing conjecture.',
      'source-backed', [story], [62],
    );
    expect(sentence).toMatch(/^The linked source reports:/);
  });

  it('does not add source attribution to unrelated, ordinary discussion-only claims', () => {
    const story = lead(63, 'Technical discussion', 'Discussion topic', 'topic');
    const claim = 'One commenter questioned the interpretation of recent legal decisions.';
    expect(methods.scopeUnverifiedSourceClaim(claim, 'discussion-only', [story], [63]))
      .toBe(claim);
  });
});

describe('Follow-up: recovered research opportunities', () => {
  it('recovers an actual Hob directory question supported by the original comment', () => {
    const hob = lead(201, 'Show HN: Hob local AI desktop', 'Local AI desktop', 'hob-desktop', [], 147, 33);
    hob.analysis.questions = ['Can the installation directory for models be changed?'];
    hob.comments = [{
      id: 800, depth: 0,
      text: 'Looks great. I am missing the ability to change the installation directory for models. I need a different partition.',
    }];
    const recovered = methods.recoverContentOpportunities([hob], new Set());
    expect(recovered).toHaveLength(1);
    expect(recovered[0].title).toContain('installation directory');
    expect(recovered[0].evidenceProvenance.discussionStoryIds).toEqual([201]);
    expect(methods.opportunityHasGroundedQuote(recovered[0], [hob])).toBe(true);
  });

  it('does not recover questions lacking support in original comments', () => {
    const leadWithoutEvidence = lead(202, 'A simple collaborative drawing tool', 'Drawing tool', 'drawing');
    leadWithoutEvidence.analysis.questions = ['How can users configure enterprise authentication and SSO?'];
    leadWithoutEvidence.comments = [{
      id: 801, depth: 0, text: 'The canvas looks nice and simple to use.',
    }];
    expect(methods.recoverContentOpportunities([leadWithoutEvidence], new Set()))
      .toEqual([]);
  });

  it('does not manufacture another opportunity for a story already in synthesis', () => {
    const leadWithEvidence = lead(203, 'Show HN: Hob local AI desktop', 'Hob local AI', 'local-ai');
    leadWithEvidence.analysis.questions = ['Can the installation directory for models be changed?'];
    leadWithEvidence.comments = [{
      id: 802, depth: 0, text: 'I cannot choose the installation directory for models.',
    }];
    expect(methods.recoverContentOpportunities([leadWithEvidence], new Set([203])))
      .toEqual([]);
  });
});

describe('Follow-up: evidence-layer attribution', () => {
  it('moves Gemma 4 from unsupported HN comments to the author submission', () => {
    const hob = lead(301, 'Show HN: Hob on-device desktop AI', 'Hob', 'hob-local-ai');
    hob.story.text = 'The desktop app uses open-weight models: Gemma 4 and gpt-oss.';
    hob.comments = [{
      id: 811, depth: 0, text: 'I would like a different installation directory for models.',
    }];
    const item = {
      name: 'Gemma 4', signal: 'The Hob project lists Gemma 4 as a model option.',
      storyIds: [301], evidenceProvenance: {
        sourceStoryIds: [], discussionStoryIds: [301], submissionStoryIds: [],
      }, evidenceBasis: 'discussion-only',
    };
    const corrected = methods.reconcileTechnologyEvidence(item, [hob]);
    expect(corrected.evidenceBasis).toBe('hn-submission-only');
    expect(corrected.evidenceProvenance.discussionStoryIds).toEqual([]);
    expect(corrected.evidenceProvenance.submissionStoryIds).toEqual([301]);
    expect(methods.scopeSubmissionOnlyClaim(
      'The cited HN discussion presents this claim: Gemma 4 is an option',
      corrected.evidenceBasis,
    )).toMatch(/^The HN submission says:/);
  });

  it('keeps explicitly discussed technologies attributed to the discussion', () => {
    const story = lead(302, 'Tell HN: Steamcmd on Apple Silicon', 'Steamcmd support', 'steamcmd');
    story.comments = [{
      id: 812, depth: 0, text: 'Rosetta 2 is the current workaround.',
    }];
    const item = {
      name: 'Rosetta 2', signal: 'A participant suggested Rosetta 2.',
      storyIds: [302], evidenceProvenance: {
        sourceStoryIds: [], discussionStoryIds: [302], submissionStoryIds: [],
      }, evidenceBasis: 'discussion-only',
    };
    expect(methods.reconcileTechnologyEvidence(item, [story]).evidenceBasis)
      .toBe('discussion-only');
  });
});

describe('Follow-up: stronger editorial summaries and selection', () => {
  it('does not prepend discussion language to an already attributed summary', () => {
    const myth = lead(401, 'The Mythical Man-Month in the Age of AI',
      'AI orchestration', 'agent-coordination', [], 154, 112);
    myth.comments = [{ id: 901, depth: 0, text: 'Managing agents requires clear orchestration.' }];
    myth.analysis.discussionSummary =
      'Discussion on Hacker News centers around varying perspectives on managing AI agents. Commenters reflect on the challenges of redundant work and agent orchestration.';
    const summary = methods.buildIndependentExecutiveSummary([myth]);
    expect(summary).toContain('Commenters reflect on the challenges');
    expect(summary).not.toMatch(/raised discussion on hacker news/i);
    expect(summary).not.toMatch(/discussion raised discussion/i);
  });

  it('limits weak stories even when the model nominates all of them', () => {
    const stories = Array.from({ length: 12 }, (_, i) =>
      lead(500 + i, 'Small project ' + i, 'Small project', 'project-key', [], 3, 0));
    stories.push(lead(800, 'Popular technical discussion', 'Topic', 'topic', [], 180, 90));
    const selected = methods.selectStories(
      stories.map((item) => item.story),
      stories.map((item) => item.triage),
      { selectedItemLimit: 16, externalPageLimit: 16, excludeZeroCommentHnOnly: false },
    );
    expect(selected.filter((item: any) =>
      item.story.score < 10 && item.story.descendants < 10)).toHaveLength(4);
    expect(selected.some((item: any) => item.story.id === 800)).toBe(true);
  });
});

describe('Follow-up: final report quality integration', () => {
  it('recovers Hob research questions and labels Gemma from the submission', () => {
    const hob = lead(601, 'Show HN: Hob local AI desktop', 'Hob on-device AI', 'hob-local-ai', [], 147, 33);
    hob.story.text = 'Hob is a local AI app using open-weight models including Gemma 4.';
    hob.comments = [{ id: 910, depth: 0,
      text: 'Can I change the installation directory for models to a separate drive?',
    }];
    hob.analysis.questions = ['Can users change the installation directory for models?'];
    hob.analysis.discussionSummary = 'A commenter asked about changing the directory where local models are installed.';
    const report = {
      executiveSummary: 'New model tooling is growing rapidly.',
      trends: [],
      technologies: [{
        name: 'Gemma 4', signal: 'Gemma 4 is listed as a model Hob can use.',
        storyIds: [601], evidenceProvenance: {
          sourceStoryIds: [], discussionStoryIds: [601], submissionStoryIds: [],
        },
      }],
      developerProblems: [], contentOpportunities: [],
    };
    const filtered = methods.filterReport(report, [hob], []);
    expect(filtered.trends).toEqual([]);
    expect(filtered.technologies[0].evidenceBasis).toBe('hn-submission-only');
    expect(filtered.technologies[0].signal).toContain('HN submission says');
    expect(filtered.contentOpportunities).toHaveLength(1);
    expect(filtered.contentOpportunities[0].evidenceBasis).toBe('discussion-only');
    expect(filtered.opportunityDiagnostics).toEqual({
      synthesisProposals: 0, rejected: 0, recovered: 1,
    });
  });
});

describe('Follow-up: problem evidence reconciliation', () => {
  it('does not source-back a commenter concern that a research announcement never mentions', () => {
    const record = lead(701, 'Scientific results announced',
      'Announcements and research verification', 'research', [], 926, 448);
    record.external = { status: 'success' };
    record.analysis.sourceSummary =
      'OpenAI announced three scientific results in mathematics, complexity and physics.';
    record.analysis.discussionSummary =
      'HN commenters discussed potential conflicts of interest in OpenAI presenting discoveries.';
    record.comments = [{ id: 920, depth: 0,
      text: 'OpenAI is both a research tool provider and a presenter of new research.',
    }];
    const finding = {
      problem: 'Potential conflict of interest with OpenAI as tool provider and research presenter.',
      detail: 'Commenters question the dual role.',
      storyIds: [701], evidenceBasis: 'source-and-discussion',
      evidenceProvenance: {
        sourceStoryIds: [701], discussionStoryIds: [701], submissionStoryIds: [],
      },
    };
    const corrected = methods.reconcileProblemEvidence(finding, [record]);
    expect(corrected.evidenceProvenance.sourceStoryIds).toEqual([]);
    expect(corrected.evidenceProvenance.discussionStoryIds).toEqual([701]);
    expect(corrected.evidenceBasis).toBe('discussion-only');
  });

  it('preserves a Tell HN compatibility problem from its submission when needed', () => {
    const record = lead(702, "Tell HN: Steamcmd doesn't support Apple Silicon",
      'Steamcmd Apple Silicon compatibility', 'steamcmd');
    record.comments = [{ id: 921, depth: 0, text: 'You could run Rosetta 2 for now.' }];
    const finding = {
      problem: 'Steamcmd does not support Apple Silicon.',
      detail: 'A developer reports compatibility difficulty.',
      storyIds: [702], evidenceBasis: 'discussion-only',
      evidenceProvenance: {
        sourceStoryIds: [], discussionStoryIds: [702], submissionStoryIds: [],
      },
    };
    const corrected = methods.reconcileProblemEvidence(finding, [record]);
    expect(corrected.evidenceProvenance.submissionStoryIds).toEqual([702]);
    expect(corrected.evidenceBasis).toBe('hn-submission-only');
  });
});

describe('Final refinement: independent evidence and editorial ranking', () => {
  it('keeps a low-engagement Ask HN allegation as a lead but prevents triple amplification', () => {
    const dots = lead(801, 'Ask HN: Are people aware OpenAI Dots intercept SSL?',
      'Unverified Dots SSL interception allegation', 'dots-ssl', [], 7, 1);
    dots.story.sources = ['ask'];
    dots.comments = [{
      id: 901, by: dots.story.by, depth: 0,
      text: 'I think Dots intercept SSL traffic and exposes personal data.',
    }];
    const item = {
      storyIds: [801],
      evidenceProvenance: {
        sourceStoryIds: [], discussionStoryIds: [801], submissionStoryIds: [],
      },
    };
    const report = {
      executiveSummary: 'Developers worry about Dots.',
      trends: [],
      technologies: [{
        name: 'OpenAI Dots', signal: 'OpenAI Dots raises privacy concerns.',
        ...item,
      }],
      developerProblems: [{
        problem: 'SSL interception might violate user privacy.',
        detail: 'This could expose personal data.', ...item,
      }, {
        problem: 'Cloud SSL interception concerns.',
        detail: 'Developers have privacy worries.', ...item,
      }],
      contentOpportunities: [{
        title: 'Guide to Dots privacy risks',
        angle: 'How to address Dots SSL traffic interception and privacy.',
        evidenceQuote: 'I think Dots intercept SSL traffic and exposes personal data.',
        ...item,
      }],
    };
    const filtered = methods.filterReport(report, [dots], []);
    expect(filtered.technologies).toEqual([]);
    expect(filtered.developerProblems).toEqual([]);
    expect(filtered.contentOpportunities).toEqual([]);
    expect(filtered.opportunityDiagnostics.rejected).toBe(1);
    expect(dots.story.id).toBe(801);
    expect(methods.isUncorroboratedHnLead(dots)).toBe(true);
  });

  it('preserves an independently supported Ask HN technical issue', () => {
    const ask = lead(802, 'Ask HN: self-hosted email deliverability',
      'Email deliverability', 'email-delivery', [], 7, 7);
    ask.story.sources = ['ask'];
    ask.comments = [{
      id: 902, by: 'independent-user', depth: 0,
      text: 'I struggle to maintain deliverability for mail from my own server.',
    }];
    expect(methods.isUncorroboratedHnLead(ask)).toBe(false);
  });

  it('rejects discussion-worded technology findings without discussion evidence', () => {
    const agents = lead(803, 'The Mythical Man-Month in the Age of AI',
      'Agent management', 'agent-management');
    agents.external = { status: 'success' };
    agents.analysis.sourceSummary = 'The article discusses managing AI agents.';
    const report = {
      executiveSummary: 'An article about AI agent management.',
      trends: [],
      technologies: [{
        name: 'AI agents',
        signal: 'HN discussions focus on agent coordination and management challenges.',
        storyIds: [803],
        evidenceProvenance: { sourceStoryIds: [803], discussionStoryIds: [], submissionStoryIds: [] },
      }],
      developerProblems: [], contentOpportunities: [],
    };
    expect(methods.filterReport(report, [agents], []).technologies).toEqual([]);
  });

  it('ranks a concrete Hob installation issue above generic synthesized guides', () => {
    const hob = lead(804, 'Show HN: Hob local AI desktop application',
      'On-device AI desktop', 'on-device-ai', [], 149, 34);
    hob.story.sources = ['show'];
    hob.comments = [{
      id: 904, by: 'reader', depth: 0,
      text: 'Looks great. One thing I am missing is the ability to change the installation directory for the models. For space reasons, I want them to be on a different partition.',
    }];
    hob.analysis.problems = [
      'No option to change installation directory for models',
      'Concerns about large model installations and lack of cleanup',
    ];
    hob.analysis.contentOpportunities = [{
      title: 'How to manage space when installing AI models locally',
      rationale: 'A user wants control of the model installation directory and disk space.',
    }];
    hob.analysis.questions = ['Are there examples of which models are selected for specific hardware?'];
    const generic = Array.from({ length: 5 }, (_, index) => {
      const record = lead(810 + index, 'Generic HN research subject ' + index,
        'Generic research topic', 'topic', [], 35 + index, 9);
      record.comments = [{
        id: 920 + index, by: 'different-person', depth: 0,
        text: 'Documentation on handling errors in these workflows is difficult to find.',
      }];
      record.analysis.discussionSummary =
        'HN commenters discussed problems handling errors in workflows.';
      return record;
    });
    const synthesized = generic.map((record) => ({
      title: 'Guide on workflows and error handling ' + record.story.id,
      angle: 'Handling errors in technical workflows can be challenging.',
      evidenceQuote: 'HN commenters discussed problems handling errors in workflows.',
      storyIds: [record.story.id],
      evidenceProvenance: {
        sourceStoryIds: [], discussionStoryIds: [record.story.id], submissionStoryIds: [],
      },
    }));
    const report = {
      executiveSummary: 'Developer research.',
      trends: [], technologies: [], developerProblems: [], contentOpportunities: synthesized,
    };
    const filtered = methods.filterReport(report, [hob, ...generic], []);
    expect(filtered.opportunityDiagnostics.recovered).toBeGreaterThan(0);
    expect(filtered.contentOpportunities).toHaveLength(5);
    expect(filtered.contentOpportunities.some((item: any) => item.storyIds.includes(804))).toBe(true);
    const hobItem = filtered.contentOpportunities.find((item: any) => item.storyIds.includes(804));
    expect(hobItem.title.toLowerCase()).toContain('model storage');
    expect(hobItem.angle).not.toBe(hobItem.title);
    expect(hobItem.evidenceQuote).toContain('installation directory');
  });

  it('qualifies unsupported claims of scientific disproof only once', () => {
    const eth = lead(850, 'The Exponential Time Hypothesis Is False [pdf]',
      'Theoretical complexity research', 'complexity-research');
    eth.external = { status: 'unusable' };
    const item = {
      title: 'Does the disproof of ETH have any immediate applications?',
      angle: 'Does the disproof of ETH affect SAT solving?',
      evidenceQuote: 'Any immediate applications for solving SAT?',
      storyIds: [850],
      evidenceProvenance: { sourceStoryIds: [], discussionStoryIds: [850], submissionStoryIds: [] },
    };
    const corrected = methods.qualifyScientificOpportunity(item.title, item, [eth]);
    expect(corrected).toContain('the claimed refutation of ETH');
    expect(corrected).not.toContain('claimed the claimed');
  });

  it('uses the singular form for one point and one comment in summaries', () => {
    const tiny = lead(860, 'Small but interesting technical post',
      'Technical experiment', 'experimental-tool', [], 1, 1);
    tiny.comments = [{
      id: 961, by: 'another-person', depth: 0,
      text: 'I found a bug when testing the tool.',
    }];
    tiny.analysis.discussionSummary = 'One commenter identified a bug while testing.';
    const summary: string = methods.buildIndependentExecutiveSummary([tiny]);
    expect(summary).toContain('1 point, 1 comment');
    expect(summary).not.toContain('1 points');
  });
});

describe('Final evidence and recovery polish', () => {
  it('recovers the actual Hob installation problem from original discussion evidence', () => {
    const hob = lead(9011, 'Show HN: Hob - Open-source local AI desktop',
      'Local model desktop application', 'local-desktop-ai', [], 150, 34);
    hob.story.sources = ['show'];
    hob.analysis.problems = [
      'No option to change installation directory for models',
      'Concerns about large model installations and lack of cleanup',
    ];
    hob.analysis.questions = ['Why is Hob built with JavaScript instead of native technology?'];
    hob.analysis.contentOpportunities = [
      { title: 'Guide on reducing model installation impact',
        rationale: 'Model installations can consume large amounts of disk space.' },
    ];
    hob.comments = [
      { id: 9191, by: 'laughing_snyder', depth: 0,
        text: 'Looks great. One thing I am missing is the ability to change the installation directory for the models. For space reasons, I want them to be on a different partition.' },
      { id: 9192, by: 'wilg', depth: 0,
        text: 'I did not enjoy that there was no way for it to clean up the 18GB of models it installed.' },
    ];
    const opportunities = methods.recoverContentOpportunities([hob], new Set());
    expect(opportunities).toHaveLength(1);
    const item = opportunities[0];
    expect(item.title).toMatch(/model storage/i);
    expect(item.angle).toMatch(/installation/i);
    expect(item.angle).not.toContain('Looks great.');
    expect(item.evidenceQuote).toMatch(/installation directory/);
    expect(item.evidenceQuote).not.toMatch(/\.\.\.$/);
    expect(methods.opportunityHasGroundedQuote(item, [hob])).toBe(true);
  });

  it('combines Corgi source features and independently supported commenter limitations', () => {
    const corgi = lead(9012, 'Show HN: Corgi terminal multiplexer',
      'Terminal multiplexer', 'terminal-multiplexer', [], 140, 46);
    corgi.external.status = 'success';
    corgi.analysis.sourceSummary =
      'The source describes Corgi session management and agent activity tracking.';
    corgi.comments = [
      { id: 9193, by: 'antouank', depth: 0,
        text: "It doesn't sync/connect with other machines seamlessly, and huge TS files in the source code are not encouraging for how this will scale." },
    ];
    const item = {
      name: 'Corgi',
      signal: 'The terminal multiplexer offers session management and agent activity tracking, though lacks cross-machine syncing and has code scalability concerns.',
      storyIds: [9012],
      evidenceProvenance: { sourceStoryIds: [9012], discussionStoryIds: [], submissionStoryIds: [] },
      evidenceBasis: 'source-backed',
    };
    const corrected = methods.reconcileTechnologyEvidence(item, [corgi]);
    expect(corrected.evidenceBasis).toBe('source-and-discussion');
    expect(corrected.evidenceProvenance.discussionStoryIds).toEqual([9012]);
    expect(corrected.signal).toContain('scalability concerns');
  });

  it('omits unsupported limitations instead of citing them to a project page', () => {
    const corgi = lead(9013, 'Show HN: Corgi terminal multiplexer',
      'Terminal multiplexer', 'terminal-multiplexer', [], 140, 46);
    corgi.external.status = 'success';
    corgi.analysis.sourceSummary = 'The source describes session management.';
    corgi.comments = [
      { id: 9194, by: 'user', depth: 0, text: 'Nice design and great icon.' },
    ];
    const item = {
      name: 'Corgi',
      signal: 'The project offers session management, though lacks cross-machine syncing and has code scalability concerns.',
      storyIds: [9013],
      evidenceProvenance: { sourceStoryIds: [9013], discussionStoryIds: [], submissionStoryIds: [] },
      evidenceBasis: 'source-backed',
    };
    const corrected = methods.reconcileTechnologyEvidence(item, [corgi]);
    expect(corrected.evidenceBasis).toBe('source-backed');
    expect(corrected.signal).not.toContain('syncing');
    expect(corrected.signal).toContain('session management');
  });

  it('ranks an observed local-model storage limitation above an ideological scraping comment', () => {
    const hob = lead(9014, 'Show HN: Hob - local AI desktop',
      'Local model management', 'local-ai', [], 150, 34);
    hob.comments = [{ id: 9195, by: 'reader', depth: 0,
      text: 'One thing I am missing is the ability to change the installation directory for the models.' }];
    const scraping = lead(9015, 'Website scraping and access policies',
      'Scraping policies', 'scraping', [], 70, 50);
    scraping.comments = [{ id: 9196, by: 'another-person', depth: 0,
      text: "Scraping is legal, last I checked. If you don't want people downloading your content then don't host it." }];
    const storage = {
      title: 'Model installation directories: limitations and workarounds',
      angle: 'Investigate missing storage-path configuration options for local AI models.',
      evidenceQuote: 'One thing I am missing is the ability to change the installation directory for the models.',
      storyIds: [9014],
      evidenceProvenance: { sourceStoryIds: [], discussionStoryIds: [9014], submissionStoryIds: [] },
    };
    const policy = {
      title: 'How to prevent unauthorized scraping',
      angle: 'Which tools can protect content from scraping?',
      evidenceQuote: scraping.comments[0].text,
      storyIds: [9015],
      evidenceProvenance: { sourceStoryIds: [], discussionStoryIds: [9015], submissionStoryIds: [] },
    };
    expect(methods.opportunityRank(storage, [hob, scraping]))
      .toBeGreaterThan(methods.opportunityRank(policy, [hob, scraping]));
  });
});

describe('Editorial research Snapshot: one evidence-grounded paragraph', () => {
  function researchRecord(id: number, title: string, topic: string, text: string, points = 100) {
    const record = lead(id, title, topic, 'distinct-topic', [], points, 45);
    record.story.by = 'original-submitter';
    record.story.sources = ['top'];
    record.comments = [{
      id: id * 10, by: 'independent-reader', depth: 0, text,
    }];
    record.analysis.discussionSummary = text;
    return record;
  }

  function filtered(records: ResearchStoryRecord[]) {
    return methods.filterReport({
      executiveSummary: 'Original synthesis summary.',
      trends: [], technologies: [], developerProblems: [], contentOpportunities: [],
    }, records, []);
  }

  it('publishes a flowing short paragraph with two individually supported observations', async () => {
    const privacy = researchRecord(10101,
      'Ask HN: Which TV do you recommend for privacy?', 'smart TV privacy',
      'My smart TV keeps tracking usage, so I never connect it to Wi-Fi and use a separate streaming device instead.');
    const frameworks = researchRecord(10102,
      'The AI cost of JavaScript frameworks', 'framework performance',
      'People pick frameworks based on vibes and familiarity instead of measurable runtime performance.');
    const paragraph =
      'Smart-TV privacy discussions focused on intrusive defaults, with one commenter describing why they keep the television offline and use a separate streaming device. Elsewhere, JavaScript developers questioned the influence of familiarity and aesthetics on framework choices when measurable runtime performance might tell a different story.';
    const claimOne = 'one commenter describing why they keep the television offline and use a separate streaming device';
    const claimTwo = 'the influence of familiarity and aesthetics on framework choices when measurable runtime performance';
    const spy = jest.spyOn(methods, 'completeStructured').mockResolvedValue({
      data: {
        paragraph,
        claims: [
          { storyId: 10101, claimText: claimOne, supportQuote: privacy.comments[0].text, layer: 'discussion' },
          { storyId: 10102, claimText: claimTwo, supportQuote: frameworks.comments[0].text, layer: 'discussion' },
        ],
      },
      usage: { calls: 1, inputTokens: 600, outputTokens: 140 },
    });
    try {
      const result = await methods.composeEditorialSnapshot(
        [privacy, frameworks], filtered([privacy, frameworks]));
      expect(result.mode).toBe('editorial');
      expect(result.text).toBe(paragraph);
      expect(result.usage.calls).toBe(1);
      expect(result.text).not.toContain('points');
      expect(result.text).not.toContain('No recurring');
      expect(spy).toHaveBeenCalledTimes(1);
      const prompt = spy.mock.calls[0][0] as string;
      expect(prompt).toContain('ONE natural, concise editorial paragraph');
      expect(prompt).not.toContain('standalone sentence');
      expect(prompt).toContain(privacy.comments[0].text);
    } finally { spy.mockRestore(); }
  });

  it('can emphasize one story without forcing an unrelated second story', async () => {
    const privacy = researchRecord(10103,
      'Ask HN: Which TV do you recommend for privacy?', 'smart TV privacy',
      'Many smart TVs track usage by default, and I prefer keeping my TV offline while using a separate streaming box.');
    const other = researchRecord(10104,
      'Another unrelated developer tool', 'terminal workflows',
      'People wanted a keyboard shortcut for switching among terminals.');
    const paragraph =
      'Smart-TV privacy concerns centered on data collection built into connected televisions, with one commenter opting to keep the set offline and rely on a separate streaming box. Keeping the TV offline and using a separate streaming box is one practical workaround, though a single account cannot establish how widespread the concern is.';
    const spy = jest.spyOn(methods, 'completeStructured').mockResolvedValue({
      data: {
        paragraph,
        claims: [
          { storyId: 10103,
            claimText: 'one commenter opting to keep the set offline and rely on a separate streaming box',
            supportQuote: privacy.comments[0].text, layer: 'discussion' },
          { storyId: 10103,
            claimText: 'Keeping the TV offline and using a separate streaming box is one practical workaround',
            supportQuote: privacy.comments[0].text, layer: 'discussion' },
        ],
      },
      usage: { calls: 1, inputTokens: 510, outputTokens: 110 },
    });
    try {
      const result = await methods.composeEditorialSnapshot([privacy, other], filtered([privacy, other]));
      expect(result.mode).toBe('editorial');
      expect(result.text).toBe(paragraph);
    } finally { spy.mockRestore(); }
  });

  it('rejects a paragraph when a claimed discussion quote belongs only to the source', async () => {
    const one = researchRecord(10105, 'Project A', 'Desktop storage',
      'I cannot move local AI models into a different installation directory.');
    const two = researchRecord(10106, 'Project B', 'Developer coordination',
      'Coordinating independent agents causes duplicate work and wasted requests.');
    const paragraph = 'Local model users raised concerns about limited storage directories and the inability to move installations to separate disks. Meanwhile, agent developers pointed to coordination challenges and wasted work when multiple tasks run without shared planning or supervision.';
    const spy = jest.spyOn(methods, 'completeStructured').mockResolvedValue({
      data: { paragraph, claims: [
        { storyId: 10105, claimText: 'limited storage directories and the inability to move installations to separate disks', supportQuote: one.comments[0].text, layer: 'source' },
        { storyId: 10106, claimText: 'agent developers pointed to coordination challenges and wasted work when multiple tasks run', supportQuote: two.comments[0].text, layer: 'discussion' },
      ] },
      usage: { calls: 1, inputTokens: 450, outputTokens: 120 },
    });
    try {
      const result = await methods.composeEditorialSnapshot([one, two], filtered([one, two]));
      expect(result.mode).toBe('fallback');
      expect(result.text).not.toContain('evidence bar');
      expect(result.usage.calls).toBe(1);
    } finally { spy.mockRestore(); }
  });

  it('rejects an unsupported extra sentence even when other claims are grounded', async () => {
    const one = researchRecord(10107, 'Local tooling', 'model storage',
      'Downloaded local AI models cannot be moved to another installation directory.');
    const two = researchRecord(10108, 'AI coordination', 'agent scheduling',
      'Parallel agents can duplicate work unless tasks have clear ownership.');
    const paragraph = 'Local AI users asked for more control over where downloaded models are stored. Meanwhile, developers described how independent agents can duplicate work without clear ownership. These examples prove all developers will abandon cloud tools within five years.';
    const spy = jest.spyOn(methods, 'completeStructured').mockResolvedValue({
      data: { paragraph, claims: [
        { storyId: 10107, claimText: 'Local AI users asked for more control over where downloaded models are stored', supportQuote: one.comments[0].text, layer: 'discussion' },
        { storyId: 10108, claimText: 'independent agents can duplicate work without clear ownership', supportQuote: two.comments[0].text, layer: 'discussion' },
      ] },
      usage: { calls: 1, inputTokens: 520, outputTokens: 100 },
    });
    try {
      const result = await methods.composeEditorialSnapshot([one, two], filtered([one, two]));
      expect(result.mode).toBe('fallback');
    } finally { spy.mockRestore(); }
  });

  it('excludes a weak self-authored allegation from Snapshot material', async () => {
    const alleged = researchRecord(10109,
      'Ask HN: Is this AI tool intercepting SSL?', 'security allegation',
      'I think the tool intercepts SSL.', 7);
    alleged.story.sources = ['ask'];
    alleged.comments[0].by = 'original-submitter';
    alleged.external.status = 'no-external-url';
    const other = researchRecord(10110, 'Other project', 'Legacy runtimes',
      'Maintaining compatibility with old application runtimes remains challenging.');
    const spy = jest.spyOn(methods, 'completeStructured');
    try {
      const result = await methods.composeEditorialSnapshot([alleged, other], filtered([alleged, other]));
      expect(result.mode).toBe('fallback');
      expect(result.text).not.toMatch(/intercept|SSL/i);
      expect(spy).not.toHaveBeenCalled();
    } finally { spy.mockRestore(); }
  });

  it('returns a concise fallback if the editorial LLM request fails', async () => {
    const one = researchRecord(10111, 'Local AI tooling', 'Local model storage',
      'Local AI applications need an option to move the model installation directory.');
    const two = researchRecord(10112, 'Agent orchestration', 'Parallel agent work',
      'Multiple agents need scheduling to avoid duplicate work.');
    const spy = jest.spyOn(methods, 'completeStructured').mockRejectedValue(new Error('Provider unavailable'));
    try {
      const result = await methods.composeEditorialSnapshot([one, two], filtered([one, two]));
      expect(result.mode).toBe('fallback');
      expect(result.text).not.toMatch(/a hacker news thread about/i);
      expect(result.usage.calls).toBe(0);
    } finally { spy.mockRestore(); }
  });

  it('rejects an unsupported future year in a fluent paragraph', async () => {
    const one = researchRecord(10113, 'Terminal workflows', 'terminal sessions',
      'Switching terminals makes it hard to track active sessions and agents.');
    const two = researchRecord(10114, 'Open source upkeep', 'open source funding',
      'Maintainers struggle to fund ongoing support and security work.');
    const paragraph = 'Terminal tooling discussions raised practical concerns about tracking active sessions and agents across different workspaces in 2035. Separately, maintainers described the difficulty of funding ongoing support and security work, even when their software remains widely useful to others.';
    const spy = jest.spyOn(methods, 'completeStructured').mockResolvedValue({
      data: { paragraph, claims: [
        { storyId: 10113, claimText: 'tracking active sessions and agents across different workspaces in 2035', supportQuote: one.comments[0].text, layer: 'discussion' },
        { storyId: 10114, claimText: 'difficulty of funding ongoing support and security work', supportQuote: two.comments[0].text, layer: 'discussion' },
      ] },
      usage: { calls: 1, inputTokens: 460, outputTokens: 115 },
    });
    try {
      const result = await methods.composeEditorialSnapshot([one, two], filtered([one, two]));
      expect(result.mode).toBe('fallback');
    } finally { spy.mockRestore(); }
  });
});
