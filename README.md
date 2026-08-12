# DebrisEye — Real-Time Orbital Debris & Collision Risk Tracking Platform

DebrisEye is a high-precision, real-time space debris tracking and orbital collision warning platform. It parses real-time orbital elements (TLEs), propagates orbital paths utilizing the SGP4 microservice solver, evaluates relative miss vectors at the Time of Closest Approach (TCA), calculates threat probability envelopes analytically (via the Chan Method) and statistically (via a 1,000-iteration Monte Carlo simulator), and overlays coordinates onto an interactive Three.js 3D earth command room dashboard.

---

## 🛰️ Architecture & System Blueprint

```
                      +---------------------------------------+
                      |         CelesTrak Ingestor            |
                      |  (Pub TLE Catalogs & SOCRATES csv)   |
                      +-------------------+-------------------+
                                          |
                                          v  (Upserts TLEs & Conjunctions)
+-----------------------+     +-----------+-----------+
|   React Frontend UI   |<--->|  Express NodeJS API   |<---> [ Redis Orbit Cache ]
| (Vite, Three.js 3D)  | WS  | (REST endpoints, WS)  |
+-----------------------+     +-----------+-----------+
                                          ^
                                          |  (Propagate & Conjunction Solver)
                                          v
                      +-------------------+-------------------+
                      |         Python FastAPI ML             |
                      |  (SGP4, Monte Carlo, Chan, Kessler)   |
                      +---------------------------------------+
```

---

## ⚡ Mathematical & Orbital Mechanics Core

### 1. Semi-Major Axis & Altitude (Kepler's Third Law)
For every ingested catalog satellite, we map its TLE orbital mean motion parameter $n$ (revolutions/day) to a standard semi-major axis $a$ (km) using Kepler's Third Law:
$$n_{\text{rad/s}} = \frac{n \times 2\pi}{86400}$$
$$a = \sqrt[3]{\frac{G M_{\text{Earth}}}{n_{\text{rad/s}}^2}}$$
$$\text{Altitude}_{\text{km}} = a - R_{\text{Earth}}$$
Where $G M_{\text{Earth}} = 398600.4418 \text{ km}^3/\text{s}^2$ and $R_{\text{Earth}} = 6378.137 \text{ km}$ (WGS84).

### 2. Analytical Collision Probability (The Chan Method)
Given a miss distance $d$ (meters) and positional uncertainty standard deviation $\sigma = 100 \text{ m}$ within the velocity encounter plane, the probability of collision $P_c$ is calculated by integrating the bivariate Gaussian probability density function over a hard-body radius circle of combined size $R = 15 \text{ m}$:
$$P_c \approx e^{-\frac{d^2}{2 \sigma^2}} \times \left(1 - e^{-\frac{R^2}{2 \sigma^2}}\right)$$

---

## ⚙️ Quick Start Installation

DebrisEye runs entirely inside orchestrating Docker Compose containers.

### Prerequisites
- Docker Engine & Docker Compose installed.

### Launching the system
From the `debriseye/` project root directory:

```bash
# Build and spin up the complete network cluster
docker-compose up --build
```

The Docker container cluster will spin up:
1. **PostgreSQL** (`debriseye-db`) on port `5432`
2. **Redis** (`debriseye-redis`) on port `6379`
3. **ML-Engine** (`debriseye-ml-engine`) on port `8000` (FastAPI)
4. **Backend Gateway** (`debriseye-backend`) on port `4000` (Express + WebSocket + Prisma)
5. **Frontend Console** (`debriseye-frontend`) on port `3000` (React + Vite + Three.js)

### Access Links (Production Deployment)
* **Command Room HUD Dashboard**: [https://debris-eye.vercel.app](https://debris-eye.vercel.app)
* **Researcher Swagger API Playground**: [https://debris-eye.vercel.app/api/docs](https://debris-eye.vercel.app/api/docs)
* **Python ML Engine OpenAPI Docs**: [http://localhost:8000/docs](http://localhost:8000/docs) *(Local Docker deployment only)*

---

## 📂 Project Directory Structure

```
debriseye/
├── docker-compose.yml     # Launches DB, Redis, ML, Express, and React
├── frontend/              # Vite React dashboard
│   ├── src/
│   │   ├── components/
│   │   │   ├── Globe.jsx          # Three.js 3D earth and orbit path lines
│   │   │   ├── RiskTable.jsx      # Conjunction row tracking tables
│   │   │   ├── KasslerIndex.jsx   # Kessler Area Chart sparkline card
│   │   │   └── AlertBanner.jsx    # Live WebSocket-pushed alert bar
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx      # Integrated layout HUD
│   │   │   ├── ObjectDetail.jsx   # Single orbital elements analysis
│   │   │   └── APIDocs.jsx        # Embedded Swagger docs
│   │   └── hooks/
│   │       └── useDebrisSocket.js # WebSocket event broker hook
│   └── Dockerfile
├── backend/               # NodeJS Express REST & WS API
│   ├── routes/
│   │   ├── debris.js              # paginated /api/debris catalog
│   │   ├── conjunctions.js        # /api/conjunctions risk reports
│   │   └── kessler.js             # LEO Kessler index snapshot log
│   ├── services/
│   │   ├── celestrakIngestion.js  # TLE Kepler elements parser
│   │   ├── alertEngine.js         # Critical alarms & webhook dispatcher
│   │   └── websocketServer.js     # Live positions broadcaster
│   ├── prisma/
│   │   └── schema.prisma          # PostgreSQL DB models
│   └── Dockerfile
└── ml-engine/             # Python FastAPI Core
    ├── main.py                    # API controllers bindings
    ├── propagator.py              # SGP4 propagation and WGS84 coordinate converter
    ├── collision.py               # Chan analytical & Monte Carlo simulators
    └── Dockerfile
```

---

## 📡 Public Space Catalogs Attribution

DebrisEye incorporates open telemetry data from:
* **CelesTrak SOCRATES (Satellite Orbital Conjunction Reports Assessing Threat Encounters in Space)**: Accesses high-priority threat listings via zero-auth CSV interfaces.
* **Space-Track.org**: Registers active satellite catalogs.

### Registering for Space-Track.org Credentials
1. Go to [https://www.space-track.org/auth/createAccount](https://www.space-track.org/auth/createAccount) and register for a free account.
2. Once approved, copy your credentials and place them in the Express `backend/.env` file:
   ```env
   SPACE_TRACK_USER=your_email@domain.com
   SPACE_TRACK_PASSWORD=your_secure_password
   ```

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
