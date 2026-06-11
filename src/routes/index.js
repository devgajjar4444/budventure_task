const express = require('express');
const { reserveItemHandler } = require('../controllers/reservationController');
const { getMetrics } = require('../controllers/metricsController');
const { healthCheck } = require('../controllers/healthController');
const { resetFlashSale } = require('../controllers/adminController');


const router = express.Router();

router.get('/health', healthCheck);
router.get('/metrics', getMetrics);
router.post('/reserve-item', reserveItemHandler);
router.post('/admin/reset-flash-sale', resetFlashSale);

module.exports = router;
