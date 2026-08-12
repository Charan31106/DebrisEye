import math
import numpy as np
from datetime import datetime

def chan_probability(miss_distance_m, relative_velocity_kms, combined_radius_m=15.0, sigma_m=100.0):
    """
    Calculates analytical collision probability using Chan's isotropic 2D encounter plane model.
    Inputs:
        miss_distance_m: distance at closest approach in meters
        relative_velocity_kms: relative velocity at TCA in km/s
        combined_radius_m: combined hard-body radius of the two objects (default 15m)
        sigma_m: combined positional uncertainty standard deviation (default 100m)
    """
    # Normalized displacement squared (v parameter in Chan model)
    v = (miss_distance_m / sigma_m) ** 2
    
    # Normalized collision cross section (u parameter in Chan model)
    u = (combined_radius_m**2) / (2.0 * (sigma_m**2))
    
    # Chan series expansion (we compute up to 10 terms for high convergence)
    prob = 0.0
    term_limit = 10
    
    e_v = math.exp(-v / 2.0)
    e_u = math.exp(-u)
    
    for m in range(term_limit):
        # Calculate Poisson-like coefficient for v
        coeff = (v / 2.0)**m / math.factorial(m)
        
        # Calculate the internal summation over k
        sum_k = 0.0
        for k in range(m + 1):
            sum_k += (u**k) / math.factorial(k)
            
        prob += coeff * (1.0 - e_u * sum_k)
        
    return float(e_v * prob)

def run_monte_carlo_simulation(pos1, pos2, combined_radius_m=15.0, sigma_m=100.0, iterations=1000):
    """
    Runs a Monte Carlo simulation around the closest approach state.
    Perturbs position vectors (in meters) with Gaussian positional uncertainty.
    Returns the statistical collision ratio.
    """
    # pos1, pos2 are Cartesian coordinate arrays in km. Convert to meters.
    p1 = np.array(pos1) * 1000.0
    p2 = np.array(pos2) * 1000.0
    
    # Combined uncertainty is shared. We distribute 70.71 meters to each object (std)
    # so that combined covariance is sqrt(70.71^2 + 70.71^2) = 100 meters.
    single_sigma = sigma_m / math.sqrt(2.0)
    
    hits = 0
    # Generate all noise perturbations in batch for maximum vector performance
    noise1 = np.random.normal(0, single_sigma, (iterations, 3))
    noise2 = np.random.normal(0, single_sigma, (iterations, 3))
    
    perturbed_p1 = p1 + noise1
    perturbed_p2 = p2 + noise2
    
    diffs = perturbed_p1 - perturbed_p2
    distances = np.linalg.norm(diffs, axis=1)
    
    hits = np.sum(distances < combined_radius_m)
    
    mc_probability = hits / float(iterations)
    return mc_probability, float(np.min(distances))

def find_closest_approach(orbit1, orbit2):
    """
    Compares two propagated orbital lists and locates the Time of Closest Approach (TCA).
    Returns the index, timestamp, minimum distance in meters, and relative velocity.
    """
    min_dist = float('inf')
    tca_index = -1
    tca_time = None
    rel_vel = 0.0
    
    # Sync matching timestamps
    for i, state1 in enumerate(orbit1):
        # Simple scan looking for closest time matches
        state2 = next((s for s in orbit2 if s['timestamp'] == state1['timestamp']), None)
        if not state2:
            continue
            
        dx = state1['x_km'] - state2['x_km']
        dy = state1['y_km'] - state2['y_km']
        dz = state1['z_km'] - state2['z_km']
        dist = math.sqrt(dx**2 + dy**2 + dz**2) # in km
        
        if dist < min_dist:
            min_dist = dist
            tca_index = i
            tca_time = state1['timestamp']
            
            # Relative velocity at closest approach
            dvx = state1['vx_kms'] - state2['vx_kms']
            dvy = state1['vy_kms'] - state2['vy_kms']
            dvz = state1['vz_kms'] - state2['vz_kms']
            rel_vel = math.sqrt(dvx**2 + dvy**2 + dvz**2)
            
    if tca_index == -1:
        return None
        
    return {
        "index": tca_index,
        "timestamp": tca_time,
        "miss_distance_m": min_dist * 1000.0, # in meters
        "relative_velocity_kms": rel_vel,
        "pos1": [orbit1[tca_index]['x_km'], orbit1[tca_index]['y_km'], orbit1[tca_index]['z_km']],
        "pos2": [orbit2[tca_index]['x_km'], orbit2[tca_index]['y_km'], orbit2[tca_index]['z_km']]
    }
