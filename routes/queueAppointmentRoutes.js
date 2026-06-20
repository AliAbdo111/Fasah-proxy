const express = require('express');
const router = express.Router();
const queueAppointmentService = require('../services/queueAppointmentService');
const { SAMPLE_QUEUE_APPOINTMENT } = require('../data/queueAppointmentSample');
const { normalizeQueueAppointmentInput, toQueueAppointmentResponse } = require('../services/queueAppointmentShape');

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

/** GET /api/queue-appointments/sample — example document shape (no DB) */
router.get('/sample', (req, res) => {
  const sample = normalizeQueueAppointmentInput(SAMPLE_QUEUE_APPOINTMENT);
  res.json({
    success: true,
    appointment: toQueueAppointmentResponse({ ...sample, userId: req.user?._id })
  });
});

/** POST /api/queue-appointments */
router.post('/', async (req, res) => {
  try {
    const appointment = await queueAppointmentService.createQueueAppointment(
      req.user._id,
      req.body
    );
    res.status(201).json({ success: true, appointment });
  } catch (err) {
    handleError(res, queueAppointmentService.mapMongoError(err));
  }
});

/** GET /api/queue-appointments — list for logged-in user (admin: ?userId=) */
router.get('/', async (req, res) => {
  try {
    const data = await queueAppointmentService.listQueueAppointments({
      userId: req.user._id,
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
    const data = await queueAppointmentService.listQueueAppointmentsByUser({
      requesterId: req.user._id,
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
    const data = await queueAppointmentService.listQueueAppointmentsByUser({
      requesterId: req.user._id,
      targetUserId: req.user._id,
      query: req.query,
      isAdmin: isAdmin(req)
    });
    res.json({ success: true, ...data });
  } catch (err) {
    handleError(res, err);
  }
});

/** GET /api/queue-appointments/:queueId */
router.get('/:queueId', async (req, res) => {
  try {
    const appointment = await queueAppointmentService.getQueueAppointmentById({
      userId: req.user._id,
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
    const appointment = await queueAppointmentService.updateQueueAppointment({
      userId: req.user._id,
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
    const appointment = await queueAppointmentService.updateQueueAppointment({
      userId: req.user._id,
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
    const appointment = await queueAppointmentService.deleteQueueAppointment({
      userId: req.user._id,
      queueId: req.params.queueId,
      isAdmin: isAdmin(req)
    });
    res.json({ success: true, appointment });
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
