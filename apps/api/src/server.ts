import cors from 'cors';
import express from 'express';
import {
  PLACEHOLDER_DYNASTY,
  PLACEHOLDER_PROGRESSION,
  PLACEHOLDER_ROSTERS,
  PLACEHOLDER_TEAMS,
} from '@ncaa/domain';
import { createSyncPayload, type DynastySyncPayload, type SeasonDataUpload } from '@ncaa/sync';
import {
  approveClaim,
  assignTeamToUser,
  createClaim,
  createSession,
  getAssignableTeamIds,
  getAvailableTeamIds,
  getDynastyBundle,
  getSession,
  ingestSeasonDataUpload,
  ingestSync,
  listClaims,
  listTenures,
  listUsers,
  rejectClaim,
} from './store.js';
import { getLocalStorageStatus } from './local-storage.js';

const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, storage: getLocalStorageStatus() });
});

app.get('/users', (_req, res) => {
  res.json(listUsers());
});

app.post('/auth/sign-in', (req, res) => {
  const userId = req.body?.userId as string | undefined;
  const password = req.body?.password as string | undefined;
  if (!userId || !password) {
    res.status(400).json({ error: 'userId and password required' });
    return;
  }
  const session = createSession(userId, password);
  if (!session) {
    res.status(401).json({ error: 'Invalid credentials or access disabled' });
    return;
  }
  res.json(session);
});

app.get('/auth/session/:userId', (req, res) => {
  const session = getSession(req.params.userId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

app.get('/dynasties/:dynastyId', (req, res) => {
  void req.params.dynastyId;
  res.json(getDynastyBundle());
});

app.post('/dynasties/:dynastyId/season-uploads', (req, res) => {
  const body = req.body as {
    uploadedByUserId?: string;
    season?: SeasonDataUpload;
  };
  if (!body?.uploadedByUserId || !body.season) {
    res.status(400).json({ error: 'uploadedByUserId and season required' });
    return;
  }

  try {
    const result = ingestSeasonDataUpload({
      dynastyId: req.params.dynastyId,
      uploadedByUserId: body.uploadedByUserId,
      upload: body.season,
    });
    res.status(result.updated ? 201 : 200).json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid season upload' });
  }
});

app.get('/dynasties/:dynastyId/claims', (req, res) => {
  res.json(listClaims(req.params.dynastyId));
});

app.get('/dynasties/:dynastyId/available-teams', (req, res) => {
  void req.params.dynastyId;
  res.json({ teamIds: getAvailableTeamIds() });
});

app.get('/dynasties/:dynastyId/assignable-teams', (req, res) => {
  const userId = req.query.userId as string | undefined;
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  void req.params.dynastyId;
  res.json({ teamIds: getAssignableTeamIds(userId) });
});

app.post('/dynasties/:dynastyId/team-assignments', (req, res) => {
  const { userId, teamId, assignedByUserId } = req.body as {
    userId?: string;
    teamId?: string;
    assignedByUserId?: string;
  };
  if (!userId || !teamId || !assignedByUserId) {
    res.status(400).json({ error: 'userId, teamId, and assignedByUserId required' });
    return;
  }

  const tenure = assignTeamToUser({
    dynastyId: req.params.dynastyId,
    userId,
    teamId,
    assignedByUserId,
  });
  if (!tenure) {
    res.status(409).json({ error: 'Team is unavailable or user is not a coach' });
    return;
  }

  res.status(201).json(tenure);
});

app.post('/dynasties/:dynastyId/claims', (req, res) => {
  const { teamId, userId, note } = req.body as {
    teamId?: string;
    userId?: string;
    note?: string;
  };
  if (!teamId || !userId) {
    res.status(400).json({ error: 'teamId and userId required' });
    return;
  }
  const claim = createClaim({
    dynastyId: req.params.dynastyId,
    teamId,
    userId,
    note,
  });
  res.status(201).json(claim);
});

app.post('/dynasties/:dynastyId/claims/:claimId/approve', (req, res) => {
  const reviewerId = (req.body?.reviewerId as string) ?? 'user-admin';
  const claim = approveClaim(req.params.claimId, reviewerId);
  if (!claim) {
    res.status(404).json({ error: 'Claim not found or not pending' });
    return;
  }
  res.json(claim);
});

app.post('/dynasties/:dynastyId/claims/:claimId/reject', (req, res) => {
  const reviewerId = (req.body?.reviewerId as string) ?? 'user-admin';
  const claim = rejectClaim(req.params.claimId, reviewerId);
  if (!claim) {
    res.status(404).json({ error: 'Claim not found or not pending' });
    return;
  }
  res.json(claim);
});

app.get('/users/:userId/tenures', (req, res) => {
  const dynastyId = (req.query.dynastyId as string) ?? 'dynasty-demo';
  res.json(listTenures(req.params.userId, dynastyId));
});

app.post('/sync/batches', (req, res) => {
  const body = req.body as {
    uploadedByUserId?: string;
    payload?: DynastySyncPayload;
  };

  let payload: DynastySyncPayload;
  if (body?.payload?.dynastyId && body.payload.dynasty) {
    payload = body.payload;
    if (!payload.batchId) {
      res.status(400).json({ error: 'payload.batchId required' });
      return;
    }
    if (!payload.syncedAt) payload.syncedAt = new Date().toISOString();
  } else {
    const uploadedByUserId = body?.uploadedByUserId ?? 'user-admin';
    payload = createSyncPayload(
      uploadedByUserId,
      PLACEHOLDER_DYNASTY,
      PLACEHOLDER_TEAMS,
      PLACEHOLDER_ROSTERS,
      PLACEHOLDER_PROGRESSION
    );
  }

  const { batch, updated } = ingestSync(payload);
  res.status(updated ? 201 : 200).json({ batch, payload, updated });
});

app.post('/sync/fixtures/roster-capture', (_req, res) => {
  res.status(410).json({
    error:
      'Roster capture expected-value fixtures were removed. Use universal layouts plus OCR/manual entry instead.',
  });
});

app.listen(port, () => {
  const storage = getLocalStorageStatus();
  if (storage.mode === 'sqlite') {
    console.log(`NCAA API using desktop SQLite: ${storage.path}`);
  } else if (storage.mode === 'json') {
    console.log(`NCAA API using desktop state mirror: ${storage.path}`);
    if (storage.reason) {
      console.log(`NCAA API fell back to mirror after SQLite failed: ${storage.reason}`);
    }
  } else {
    console.log(
      `NCAA API using seed fallback (${storage.reason}${storage.path ? `: ${storage.path}` : ''})`
    );
  }
  console.log(`NCAA API listening on http://127.0.0.1:${port}`);
});
