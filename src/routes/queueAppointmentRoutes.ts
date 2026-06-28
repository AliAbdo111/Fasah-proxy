// @ts-nocheck
const express = require('express');
const router = express.Router();
const queueAppointmentService = require('../services/queueAppointmentService');
const { normalizeQueueAppointmentInput, toQueueAppointmentResponse } = require('../services/queueAppointmentShape');
const { requireRequestUserId } = require('../common/middleware/request-auth');
const { getWatcherStatus, startAppointmentWatcherCron, stopAppointmentWatcherCron } = require('../services/appointmentWatcherCron');

function isAdmin(req) {
  return req.auth?.role === 'admin';
}

function handleError(res, err) {
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Request failed'
  });
}


/** POST /api/queue-appointments */
router.post('/', async (req, res) => {
  try {
    const userId = requireRequestUserId(req, res);
    if (!userId) return;

    const appointment = await queueAppointmentService.createQueueAppointment(userId, req.body);
    res.status(201).json({ success: true, appointment });
  } catch (err) {
    handleError(res, queueAppointmentService.mapMongoError(err));
  }
});

/** GET /api/queue-appointments — list for logged-in user (admin: ?userId=) */
router.get('/', async (req, res) => {
  try {
    const userId = requireRequestUserId(req, res);
    if (!userId) return;

    const data = await queueAppointmentService.listQueueAppointments({
      userId,
      query: req.query,
      isAdmin: isAdmin(req)
    });
    res.json({ success: true, ...data });
  } catch (err) {
    handleError(res, err);
  }
});

/** GET /api/queue-appointments/user/:userId — list by Mongo user id */
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = requireRequestUserId(req, res);
    if (!userId) return;

    const data = await queueAppointmentService.listQueueAppointmentsByUser({
      requesterId: userId,
      targetUserId: req.params.userId,
      query: req.query,
      isAdmin: isAdmin(req)
    });
    res.json({ success: true, ...data });
  } catch (err) {
    handleError(res, err);
  }
});

/** GET /api/queue-appointments/me — alias for current user list */
router.get('/me', async (req, res) => {
  try {
    const userId = requireRequestUserId(req, res);
    if (!userId) return;

    const data = await queueAppointmentService.listQueueAppointmentsByUser({
      requesterId: userId,
      targetUserId: userId,
      query: req.query,
      isAdmin: isAdmin(req)
    });
    res.json({ success: true, ...data });
  } catch (err) {
    handleError(res, err);
  }
});

/** GET /api/queue-appointments/watcher/status */
router.get('/watcher/status', async (req, res) => {
  try {
    const userId = requireRequestUserId(req, res);
    if (!userId) return;
    const status = await getWatcherStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    handleError(res, err);
  }
});

/** POST /api/queue-appointments/watcher/stop — admin: stop immediately */
router.post('/watcher/stop', async (req, res) => {
  try {
    const userId = requireRequestUserId(req, res);
    if (!userId) return;
    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const reason = req.body?.reason || 'api_stop';
    const result = await stopAppointmentWatcherCron(reason);
    const status = await getWatcherStatus();
    res.json({ success: true, ...result, status });
  } catch (err) {
    handleError(res, err);
  }
});

/** POST /api/queue-appointments/watcher/start — admin: start again */
router.post('/watcher/start', async (req, res) => {
  try {
    const userId = requireRequestUserId(req, res);
    if (!userId) return;
    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const result = startAppointmentWatcherCron();
    const status = await getWatcherStatus();
    res.json({ success: true, ...result, status });
  } catch (err) {
    handleError(res, err);
  }
});

/** PATCH /api/queue-appointments/:queueId/status — update status (+ user booking count when booked/success) */
router.patch('/:queueId/status', async (req, res) => {
  try {
    const userId = requireRequestUserId(req, res);
    if (!userId) return;

    const { status, tasBookRef, lastError, recordUserBooking } = req.body || {};
    const result = await queueAppointmentService.updateQueueAppointmentStatus({
      userId,
      queueId: req.params.queueId,
      isAdmin: isAdmin(req),
      status,
      tasBookRef,
      lastError,
      recordUserBooking
    });
    res.json({ success: true, ...result });
  } catch (err) {
    handleError(res, queueAppointmentService.mapMongoError(err));
  }
});

/** GET /api/queue-appointments/:queueId */
router.get('/:queueId', async (req, res) => {
  try {
    const userId = requireRequestUserId(req, res);
    if (!userId) return;

    const appointment = await queueAppointmentService.getQueueAppointmentById({
      userId,
      queueId: req.params.queueId,
      isAdmin: isAdmin(req)
    });
    res.json({ success: true, appointment });
  } catch (err) {
    handleError(res, err);
  }
});

/** PUT /api/queue-appointments/:queueId — full replace */
router.put('/:queueId', async (req, res) => {
  try {
    const userId = requireRequestUserId(req, res);
    if (!userId) return;

    const appointment = await queueAppointmentService.updateQueueAppointment({
      userId,
      queueId: req.params.queueId,
      body: req.body,
      isAdmin: isAdmin(req),
      replace: true
    });
    res.json({ success: true, appointment });
  } catch (err) {
    handleError(res, queueAppointmentService.mapMongoError(err));
  }
});

/** PATCH /api/queue-appointments/:queueId — partial update */
router.patch('/:queueId', async (req, res) => {
  try {
    const userId = requireRequestUserId(req, res);
    if (!userId) return;

    const appointment = await queueAppointmentService.updateQueueAppointment({
      userId,
      queueId: req.params.queueId,
      body: req.body,
      isAdmin: isAdmin(req),
      replace: false
    });
    res.json({ success: true, appointment });
  } catch (err) {
    handleError(res, queueAppointmentService.mapMongoError(err));
  }
});

/** DELETE /api/queue-appointments/:queueId */
router.delete('/:queueId', async (req, res) => {
  try {
    const userId = requireRequestUserId(req, res);
    if (!userId) return;

    const appointment = await queueAppointmentService.deleteQueueAppointment({
      userId,
      queueId: req.params.queueId,
      isAdmin: isAdmin(req)
    });
    res.json({ success: true, appointment });
  } catch (err) {
    handleError(res, err);
  }
});


export default router;
