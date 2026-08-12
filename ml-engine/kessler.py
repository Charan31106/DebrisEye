def calculate_kessler_risk(objects_data, active_conjunctions):
    """
    Calculates the Kessler cascade risk score (0-100) and extracts the contributing sub-factors.
    Inputs:
        objects_data: list of dicts with {"altitudeKm": float, "riskScore": float}
        active_conjunctions: list of dicts with {"pc": float}
    """
    total_objects = len(objects_data)
    
    # Factor 1: Overall object count density (normalized against a threshold of 10,000 catalog items)
    # Contribution: Up to 35 points
    object_count_score = min(35.0, (total_objects / 5000.0) * 35.0)
    
    # Factor 2: High-risk active conjunctions with Pc > 1e-5
    # Contribution: Up to 35 points
    critical_conjunctions = [c for c in active_conjunctions if c.get('pc', 0) > 1e-5]
    conjunction_score = min(35.0, (len(critical_conjunctions) / 10.0) * 35.0)
    
    # Factor 3: LEO Debris Density (Altitude shell 400km - 2000km)
    # Contribution: Up to 20 points
    leo_debris = [o for o in objects_data if 400.0 <= o.get('altitudeKm', 0) <= 2000.0]
    leo_density_score = min(20.0, (len(leo_debris) / 3000.0) * 20.0)
    
    # Factor 4: Severe Fragmentation/Critical Risk Conjunctions (Pc > 1e-3)
    # Contribution: Up to 10 points
    extreme_risk_count = sum(1 for c in active_conjunctions if c.get('pc', 0) > 1e-3)
    fragmentation_score = min(10.0, extreme_risk_count * 5.0)
    
    # Final consolidated score
    total_score = object_count_score + conjunction_score + leo_density_score + fragmentation_score
    total_score = max(0.0, min(100.0, total_score))
    
    return {
        "score": round(total_score, 1),
        "factors": {
            "objectCountScore": round(object_count_score, 2),
            "conjunctionScore": round(conjunction_score, 2),
            "leoDensityScore": round(leo_density_score, 2),
            "fragmentationScore": round(fragmentation_score, 2),
            "totalObjectsTracked": total_objects,
            "criticalConjunctionsCount": len(critical_conjunctions),
            "leoObjectsCount": len(leo_debris)
        }
    }
