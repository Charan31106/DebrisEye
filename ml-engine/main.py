import datetime
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from propagator import propagate_tle
from collision import find_closest_approach, chan_probability, run_monte_carlo_simulation
from kessler import calculate_kessler_risk

app = FastAPI(
    title="DebrisEye ML Engine",
    description="Astrodynamics, SGP4 Orbit Propagation, and Conjunction Risk Prediction Engine",
    version="1.0.0"
)

# Pydantic models for incoming requests
class PropagateRequest(BaseModel):
    tle_line1: str = Field(..., description="First line of satellite TLE")
    tle_line2: str = Field(..., description="Second line of satellite TLE")
    start_time: str = Field(..., description="ISO 8601 start date timestamp")
    end_time: str = Field(..., description="ISO 8601 end date timestamp")
    step_seconds: Optional[int] = Field(60, description="Step frequency in seconds")

class ConjunctionRequest(BaseModel):
    tle1_line1: str
    tle1_line2: str
    tle2_line1: str
    tle2_line2: str
    start_time: str
    end_time: str
    step_seconds: Optional[int] = Field(60)

class ObjectData(BaseModel):
    altitudeKm: float
    riskScore: float

class ConjunctionData(BaseModel):
    pc: float

class KesslerRequest(BaseModel):
    objects: List[ObjectData]
    conjunctions: List[ConjunctionData]

def parse_iso_datetime(dt_str: str) -> datetime.datetime:
    """Helper to convert JS-friendly and UTC ISO strings to timezone-aware python datetime."""
    # Handle Zulu 'Z' suffix
    clean_str = dt_str.replace('Z', '+00:00')
    try:
        return datetime.datetime.fromisoformat(clean_str)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {dt_str}. Error: {str(e)}")

@app.get("/")
def read_root():
    return {"status": "online", "engine": "DebrisEye Astrodynamics Solver", "version": "1.0.0"}

@app.post("/propagate")
def propagate(req: PropagateRequest):
    start_dt = parse_iso_datetime(req.start_time)
    end_dt = parse_iso_datetime(req.end_time)
    
    try:
        orbit_positions = propagate_tle(
            req.tle_line1, req.tle_line2, 
            start_dt, end_dt, 
            req.step_seconds or 60
        )
        return {
            "noradId": req.tle_line2.split()[1] if len(req.tle_line2.split()) > 1 else "unknown",
            "points": orbit_positions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Propagation failure: {str(e)}")

@app.post("/collision-probability")
def collision_probability(req: ConjunctionRequest):
    start_dt = parse_iso_datetime(req.start_time)
    end_dt = parse_iso_datetime(req.end_time)
    step = req.step_seconds or 60
    
    try:
        # 1. Propagate both orbits
        orbit1 = propagate_tle(req.tle1_line1, req.tle1_line2, start_dt, end_dt, step)
        orbit2 = propagate_tle(req.tle2_line1, req.tle2_line2, start_dt, end_dt, step)
        
        # 2. Find closest approach (TCA)
        approach = find_closest_approach(orbit1, orbit2)
        if not approach:
            return {
                "conjunction_detected": False,
                "detail": "Orbits did not overlap in the propagation timeline."
            }
            
        # 3. Calculate analytical probability using the Chan method
        pc_chan = chan_probability(
            miss_distance_m=approach["miss_distance_m"],
            relative_velocity_kms=approach["relative_velocity_kms"],
            combined_radius_m=15.0,
            sigma_m=100.0
        )
        
        # 4. Perform a 1000-iteration statistical Monte Carlo simulation around TCA
        pc_mc, min_perturbed_dist = run_monte_carlo_simulation(
            pos1=approach["pos1"],
            pos2=approach["pos2"],
            combined_radius_m=15.0,
            sigma_m=100.0,
            iterations=1000
        )
        
        return {
            "conjunction_detected": True,
            "tca": approach["timestamp"],
            "miss_distance_m": round(approach["miss_distance_m"], 2),
            "relative_velocity_kms": round(approach["relative_velocity_kms"], 4),
            "probability_analytical": float(pc_chan),
            "probability_monte_carlo": float(pc_mc),
            "min_simulated_distance_m": round(min_perturbed_dist, 2),
            "risk_level": "critical" if pc_chan > 1e-4 else ("warning" if pc_chan > 1e-5 else "normal")
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Collision analysis failure: {str(e)}")

@app.post("/calculate-kessler")
def calculate_kessler(req: KesslerRequest):
    try:
        objects_list = [{"altitudeKm": o.altitudeKm, "riskScore": o.riskScore} for o in req.objects]
        conjunctions_list = [{"pc": c.pc} for c in req.conjunctions]
        
        result = calculate_kessler_risk(objects_list, conjunctions_list)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Kessler calculation failure: {str(e)}")
