const express = require('express');
const router = express.Router();
const FasahClient = require('../services/fasahClient');

const client = new FasahClient();

/**
 * GET /api/zatca-tas/v2/zone/schedule/land
 * Same path and parameters as ZATCA API - proxy to FASAH schedule/land
 *
 * Query: departure (required), arrival (required), type (required), economicOperator (optional), userType (optional)
 * Headers: x-fasah-token or token or Authorization (FASAH token)
 */
router.get('/zone/schedule/land/server-one', async (req, res) => {
  try {
    const { departure='AGF', arrival='31', type='TRANSIT', economicOperator, userType } = req.query;

    const token =
      req.headers['x-fasah-token'] ||
      req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
      req.headers['token']?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is required. Provide token via x-fasah-token, token, or Authorization header.',
        error: 'Missing authentication token'
      });
    }

    const result = await client.getLandSchedule({
      departure,
      arrival,
      type,
      economicOperator,
      token,
      userType: userType || 'broker'
    });

    if (result?.success === false && result.errors) {
      return res.status(200).json({
        success: false,
        data: result
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to retrieve schedule',
      ...(error.data && { details: error.data })
    });
  }
});

router.get('/zone/schedule/land/server-two', async (req, res) => {
 try {
   const { departure='AGF', arrival='31', type='IMPORT', economicOperator, userType } = req.query;

   const token =
     req.headers['x-fasah-token'] ||
     req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
     req.headers['token']?.replace(/^Bearer\s+/i, '');

   if (!token) {
     return res.status(401).json({
       success: false,
       message: 'Authentication token is required. Provide token via x-fasah-token, token, or Authorization header.',
       error: 'Missing authentication token'
     });
   }

   const result = await client.getLandSchedule({
     departure,
     arrival,
     type,
     economicOperator,
     token,
     userType: userType || 'broker'
   });

   if (result?.success === false && result.errors) {
     return res.status(200).json({
       success: false,
       data: result
     });
   }

   res.json({
     success: true,
     data: result
   });
 } catch (error) {
   const status = error.status || 500;
   res.status(status).json({
     success: false,
     message: error.message || 'Failed to retrieve schedule',
     ...(error.data && { details: error.data })
   });
 }
});

router.get('/zone/schedule/land/server-three', async (req, res) => {
 try {
   const { departure='AGF', arrival='31', type='EMPTY_TRUCK', economicOperator, userType } = req.query;

   const token =
     req.headers['x-fasah-token'] ||
     req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
     req.headers['token']?.replace(/^Bearer\s+/i, '');

   if (!token) {
     return res.status(401).json({
       success: false,
       message: 'Authentication token is required. Provide token via x-fasah-token, token, or Authorization header.',
       error: 'Missing authentication token'
     });
   }

   const result = await client.getLandSchedule({
     departure,
     arrival,
     type,
     economicOperator,
     token,
     userType: userType || 'broker'
   });

   if (result?.success === false && result.errors) {
     return res.status(200).json({
       success: false,
       data: result
     });
   }

   res.json({
     success: true,
     data: result
   });
 } catch (error) {
   const status = error.status || 500;
   res.status(status).json({
     success: false,
     message: error.message || 'Failed to retrieve schedule',
     ...(error.data && { details: error.data })
   });
 }
});

router.get('/zone/schedule/land/server-four', async (req, res) => {
 try {
   const { departure='AGF', arrival='31', type='ECONOMIC_OPERATOR', economicOperator, userType } = req.query;

   const token =
     req.headers['x-fasah-token'] ||
     req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
     req.headers['token']?.replace(/^Bearer\s+/i, '');

   if (!token) {
     return res.status(401).json({
       success: false,
       message: 'Authentication token is required. Provide token via x-fasah-token, token, or Authorization header.',
       error: 'Missing authentication token'
     });
   }

   const result = await client.getLandSchedule({
     departure,
     arrival,
     type,
     economicOperator,
     token,
     userType: userType || 'broker'
   });

   if (result?.success === false && result.errors) {
     return res.status(200).json({
       success: false,
       data: result
     });
   }

   res.json({
     success: true,
     data: result
   });
 } catch (error) {
   const status = error.status || 500;
   res.status(status).json({
     success: false,
     message: error.message || 'Failed to retrieve schedule',
     ...(error.data && { details: error.data })
   });
 }
});

router.get('/zone/schedule/land/server-five', async (req, res) => {
 try {
   const { departure='AGF', arrival='31', type='SPECIAL', economicOperator, userType } = req.query;

   const token =
     req.headers['x-fasah-token'] ||
     req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
     req.headers['token']?.replace(/^Bearer\s+/i, '');

   if (!token) {
     return res.status(401).json({
       success: false,
       message: 'Authentication token is required. Provide token via x-fasah-token, token, or Authorization header.',
       error: 'Missing authentication token'
     });
   }

   const result = await client.getLandSchedule({
     departure,
     arrival,
     type,
     economicOperator,
     token,
     userType: userType || 'broker'
   });

   if (result?.success === false && result.errors) {
     return res.status(200).json({
       success: false,
       data: result
     });
   }

   res.json({
     success: true,
     data: result
   });
 } catch (error) {
   const status = error.status || 500;
   res.status(status).json({
     success: false,
     message: error.message || 'Failed to retrieve schedule',
     ...(error.data && { details: error.data })
   });
 }
});

module.exports = router;
