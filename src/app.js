const express = require('express');
const requestIdMiddleware = require('./middleware/requestId');
const metricsMiddleware = require('./middleware/metricsMiddleware');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

app.use(express.json());
app.use(requestIdMiddleware);
app.use(metricsMiddleware);
app.use(routes);
app.use(errorHandler);

module.exports = app;
