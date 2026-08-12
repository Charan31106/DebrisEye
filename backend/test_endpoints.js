import axios from 'axios';

const BASE_URL = 'http://localhost:4000';

async function runTests() {
  console.log('=== Starting DebrisEye API Endpoint Integration Tests ===\n');

  try {
    // Test 1: Root endpoint
    console.log('[Test 1] Querying Root gateway...');
    const rootRes = await axios.get(`${BASE_URL}/`);
    console.log('✔ Root API Response Status:', rootRes.status);
    console.log('✔ Gateway documentation URL:', rootRes.data.documentation);

    // Test 2: Debris Catalog (Paginated & Filtered)
    console.log('\n[Test 2] Querying Debris Catalog /api/debris...');
    const debrisRes = await axios.get(`${BASE_URL}/api/debris?limit=3`);
    console.log('✔ Catalog Response Status:', debrisRes.status);
    console.log('✔ Catalog count returned:', debrisRes.data.data.length);
    console.log('✔ Sample object:', debrisRes.data.data[0]?.name, `(NORAD: ${debrisRes.data.data[0]?.noradId})`);

    // Test 3: Single Debris Detail
    const sampleId = debrisRes.data.data[0]?.noradId;
    if (sampleId) {
      console.log(`\n[Test 3] Querying Single Debris Element details for NORAD ${sampleId}...`);
      const singleRes = await axios.get(`${BASE_URL}/api/debris/${sampleId}`);
      console.log('✔ Single Debris Response Status:', singleRes.status);
      console.log('✔ Element inclination angle:', singleRes.data.data.inclination, 'deg');
    }

    // Test 4: Conjunction warnings
    console.log('\n[Test 4] Querying Conjunction Warnings /api/conjunctions...');
    const conjRes = await axios.get(`${BASE_URL}/api/conjunctions`);
    console.log('✔ Conjunctions Response Status:', conjRes.status);
    console.log('✔ Conjunction pairs count:', conjRes.data.count);
    const sampleConj = conjRes.data.data[0];
    if (sampleConj) {
      console.log('✔ Sample conjunction pair:', `${sampleConj.object1Name} / ${sampleConj.object2Name}`);
      console.log('✔ Conjunction probability Pc:', sampleConj.pc);
      
      // Test 5: Conjunction analytical/MC simulation
      console.log(`\n[Test 5] Querying Conjunction Simulation Report for ID ${sampleConj.id}...`);
      const simRes = await axios.get(`${BASE_URL}/api/conjunctions/${sampleConj.id}`);
      console.log('✔ Simulation Response Status:', simRes.status);
      console.log('✔ Miss distance calculation:', simRes.data.data.simulation?.miss_distance_m, 'meters');
      console.log('✔ Analytical Probability:', simRes.data.data.simulation?.probability_analytical);
      console.log('✔ Monte Carlo Statistical Probability:', simRes.data.data.simulation?.probability_monte_carlo);
    }

    // Test 6: Kessler Risk index
    console.log('\n[Test 6] Querying Kessler Cascade Risk Index /api/kessler-index...');
    const kesslerRes = await axios.get(`${BASE_URL}/api/kessler-index`);
    console.log('✔ Kessler Response Status:', kesslerRes.status);
    console.log('✔ Active Kessler Score:', kesslerRes.data.current.score);
    console.log('✔ History snapshots loaded:', kesslerRes.data.history.length);

    // Test 7: Alert register logs
    console.log('\n[Test 7] Querying Alerts Register log...');
    const alertRes = await axios.get(`${BASE_URL}/api/alerts`);
    console.log('✔ Alerts log response status:', alertRes.status);
    console.log('✔ Alerts registered count:', alertRes.data.count);
    console.log('✔ Latest alert payload:', alertRes.data.data[0]?.payload);

    // Test 8: Operator Webhook Subscription
    console.log('\n[Test 8] Registering operator Webhook receiver...');
    const subRes = await axios.post(`${BASE_URL}/api/operators/subscribe`, {
      webhookUrl: 'http://localhost:5000/mock/alerts/receiver'
    });
    console.log('✔ Webhook subscription response status:', subRes.status);
    console.log('✔ Subscription Message:', subRes.data.message);

    console.log('\n=== All DebrisEye Endpoint Integration Tests Completed Successfully! ===');
  } catch (err) {
    console.error('\n✖ Test suite encountered an error:', err.message);
    if (err.response) {
      console.error('  Response Data:', err.response.data);
    }
  }
}

runTests();
