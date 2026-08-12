import express from 'express';
import http from 'http';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { runIngestion } from './services/celestrakIngestion.js';
import { runAlertCheck } from './services/alertEngine.js';
import { initWebSocketServer } from './services/websocketServer.js';

// Route imports
import debrisRouter from './routes/debris.js';
import conjunctionRouter from './routes/conjunctions.js';
import alertsRouter from './routes/alerts.js';
import kesslerRouter from './routes/kessler.js';

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 4000;

// Enable CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Parse body requests
app.use(express.json());

// API Rate Limiting: 100 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { success: false, error: 'Too many requests from this IP. Please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Bind API Routers
app.use('/api/debris', debrisRouter);
app.use('/api/conjunctions', conjunctionRouter);
app.use('/api/kessler-index', kesslerRouter);
app.use('/api', alertsRouter);

// Swagger Documentation Configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DebrisEye REST API',
      version: '1.0.0',
      description: 'Open REST API for space agencies and researchers to track orbital debris, run physical propagation simulations, and monitor high-threat collision alerts.',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development Server',
      },
    ],
  },
  apis: ['./routes/*.js', './server.js'], // Scan routes for JSDoc documentation
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Root Endpoint mapping
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to DebrisEye REST API Gateway',
    documentation: `http://localhost:${PORT}/api/docs`,
    liveFeed: `ws://localhost:${PORT}`,
    status: 'online'
  });
});

// Initialize WebSocket broadcast server
const broadcast = initWebSocketServer(server);

// Start Server and Schedule Background Processes
server.listen(PORT, async () => {
  console.log(`[DebrisEye Server] Running on http://localhost:${PORT}`);
  console.log(`[DebrisEye Server] API Documentation live on http://localhost:${PORT}/api/docs`);

  // Run on Boot to immediately populate empty databases
  console.log('[DebrisEye Server] Bootstrapping initial debris elements & conjunction catalogs...');
  try {
    await runIngestion();
    await runAlertCheck(broadcast);
  } catch (err) {
    console.error('[DebrisEye Server] Error during boot preparation cycle:', err.message);
  }

  // Schedule catalog TLE sync every 6 hours
  setInterval(async () => {
    try {
      await runIngestion();
    } catch (e) {
      console.error('[Scheduler] Ingestion trigger failed:', e.message);
    }
  }, 6 * 3600 * 1000);

  // Schedule collision and operators alerts scan every 15 minutes
  setInterval(async () => {
    try {
      await runAlertCheck(broadcast);
    } catch (e) {
      console.error('[Scheduler] Conjunction threat scanner failed:', e.message);
    }
  }, 15 * 60 * 1000);
});
