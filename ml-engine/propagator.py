import math
from datetime import datetime, timedelta, timezone
from sgp4.api import Satrec, jday

# Earth Ellipsoid constants (WGS84)
A_WGS84 = 6378.137          # semi-major axis in km
F_WGS84 = 1.0 / 298.257223563 # ellipsoid flattening
B_WGS84 = A_WGS84 * (1.0 - F_WGS84) # semi-minor axis in km
E2_WGS84 = (A_WGS84**2 - B_WGS84**2) / A_WGS84**2 # first eccentricity squared
EP2_WGS84 = (A_WGS84**2 - B_WGS84**2) / B_WGS84**2 # second eccentricity squared

def gmst(jd):
    """
    Calculates Greenwich Mean Sidereal Time in radians based on the Julian Date.
    """
    t = (jd - 2451545.0) / 36525.0
    theta = (280.46061837 + 360.98564736629 * (jd - 2451545.0) +
             0.000387933 * t**2 - t**3 / 38710000.0)
    return math.radians(theta % 360.0)

def eci_to_geodetic(x, y, z, jd):
    """
    Converts ECI (Earth-Centered Inertial) coordinates (km) into WGS84 
    geodetic coordinates: Latitude (degrees), Longitude (degrees), and Altitude (km).
    """
    # Step 1: ECI to ECEF rotation using GMST
    theta = gmst(jd)
    cos_t = math.cos(theta)
    sin_t = math.sin(theta)
    
    x_ecef = x * cos_t + y * sin_t
    y_ecef = -x * sin_t + y * cos_t
    z_ecef = z
    
    # Step 2: ECEF to Geodetic coordinates (Bowring's method)
    p = math.sqrt(x_ecef**2 + y_ecef**2)
    if p < 1e-9:
        # Pole singularity handling
        lat = 90.0 if z_ecef > 0 else -90.0
        lon = 0.0
        alt = abs(z_ecef) - B_WGS84
        return lat, lon, alt
        
    theta_lat = math.atan2(z_ecef * A_WGS84, p * B_WGS84)
    
    lat_rad = math.atan2(
        z_ecef + EP2_WGS84 * B_WGS84 * math.sin(theta_lat)**3,
        p - E2_WGS84 * A_WGS84 * math.cos(theta_lat)**3
    )
    
    lon_rad = math.atan2(y_ecef, x_ecef)
    
    # Radius of curvature in the prime vertical
    n = A_WGS84 / math.sqrt(1.0 - E2_WGS84 * math.sin(lat_rad)**2)
    alt = p / math.cos(lat_rad) - n
    
    lat = math.degrees(lat_rad)
    lon = math.degrees(lon_rad)
    
    # Wrap longitude to standard range [-180, 180]
    lon = (lon + 180) % 360 - 180
    
    return lat, lon, alt

def propagate_tle(tle_line1, tle_line2, start_time, end_time, step_seconds=60):
    """
    Propagates a TLE over a specified time window.
    Returns a list of positional states containing geodetic and Cartesian data.
    """
    satellite = Satrec.twoline2array(tle_line1, tle_line2)
    states = []
    
    current_time = start_time
    duration = (end_time - start_time).total_seconds()
    
    # Protect against huge durations
    if duration > 172800: # 48 hours max
        end_time = start_time + timedelta(hours=48)
        
    while current_time <= end_time:
        # Convert datetime to Julian Date required by SGP4
        jd, fr = jday(
            current_time.year, current_time.month, current_time.day,
            current_time.hour, current_time.minute, current_time.second + current_time.microsecond / 1e6
        )
        
        e, r, v = satellite.sgp4(jd, fr)
        if e == 0:
            # Position r is in km, velocity v is in km/s
            x, y, z = r[0], r[1], r[2]
            lat, lon, alt = eci_to_geodetic(x, y, z, jd + fr)
            
            states.append({
                "timestamp": current_time.isoformat(),
                "x_km": float(x),
                "y_km": float(y),
                "z_km": float(z),
                "vx_kms": float(v[0]),
                "vy_kms": float(v[1]),
                "vz_kms": float(v[2]),
                "lat": float(lat),
                "lon": float(lon),
                "alt_km": float(alt)
            })
            
        current_time += timedelta(seconds=step_seconds)
        
    return states
