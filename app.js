const axios = require('axios');
const throttle = require('async-throttle');
const readline = require('readline');


// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Function to prompt user for input
function prompt(question) {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
}

// Function to validate inputs
function validateInputs(url, totalRequests, timeWindowSeconds) {
    if (!url || !url.match(/^https?:\/\/.+/)) {
      throw new Error('Invalid or missing URL. Please provide a valid URL starting with http:// or https://');
    }
    if (!Number.isInteger(totalRequests) || totalRequests <= 0) {
      throw new Error('Invalid totalRequests. Please provide a positive integer.');
    }
    if (!Number.isFinite(timeWindowSeconds) || timeWindowSeconds <= 0) {
      throw new Error('Invalid timeWindowSeconds. Please provide a positive number.');
    }
  }

async function loadTest(url, totalRequests, timeWindowSeconds) {
  // Calculate requests per second to distribute evenly
  const requestsPerSecond = Math.ceil(totalRequests / timeWindowSeconds);
  const throttleRequests = throttle(requestsPerSecond);

  // Store results
  const results = {
    totalRequests: totalRequests,
    timeWindowSeconds: timeWindowSeconds,
    successfulRequests: 0,
    failedRequests: 0,
    responses: [],
    totalTimeTakenMs: 0
  };

  // Start time
  const startTime = Date.now();

  // Create an array of request promises
  const requestPromises = Array.from({ length: totalRequests }, async (_, index) => {
    return throttleRequests(async () => {
        const requestStartTime = Date.now();
        try {
            const response = await axios.get(url, {
              timeout: 5000 // 5-second timeout
            });
            const requestTimeMs = Date.now() - requestStartTime; // Calculate request duration
            results.successfulRequests++;
            results.responses.push({
              requestNumber: index + 1,
              timeMs: requestTimeMs,
              status: response.status,
              success: true
            });
        } catch (error) {
            const requestTimeMs = Date.now() - requestStartTime; // Calculate request duration even for failures
            results.failedRequests++;
            results.responses.push({
              requestNumber: index + 1,
              timeMs: requestTimeMs,
              status: error.response ? error.response.status : 'N/A',
              success: false,
              error: error.message
            });
        }
    });
  });

  // Execute all requests
  await Promise.all(requestPromises);

  // Calculate total time taken
  results.totalTimeTakenMs = Date.now() - startTime;

  return results;
}

// Example usage
async function runTest() {
    try {
        // Prompt for inputs
        console.log('Please provide the following details for the load test:');
        const url = await prompt('Enter the URL to test (e.g., https://example.com): ');
        const totalRequestsInput = await prompt('Enter the total number of requests (positive integer): ');
        const timeWindowSecondsInput = await prompt('Enter the time window in seconds (positive number): ');
    
        // Parse inputs
        const totalRequests = parseInt(totalRequestsInput, 10);
        const timeWindowSeconds = parseFloat(timeWindowSecondsInput);
    
        // Validate inputs
        validateInputs(url, totalRequests, timeWindowSeconds);
    
        console.log(`\nStarting load test for ${url}`);
        console.log(`Total requests: ${totalRequests}, Time window: ${timeWindowSeconds} seconds`);
    
        const result = await loadTest(url, totalRequests, timeWindowSeconds);
    
        // Display summary
        console.log('\nLoad Test Summary:');
        console.log(`Total Requests Sent: ${result.totalRequests}`);
        console.log(`Time Window: ${result.timeWindowSeconds} seconds`);
        console.log(`Successful Requests: ${result.successfulRequests}`);
        console.log(`Failed Requests: ${result.failedRequests}`);
        console.log(`Total Time Taken: ${result.totalTimeTakenMs} ms`);
    
        // Prepare data for tabular output
        const tableData = result.responses.map((response) => ({
          'Request #': response.requestNumber,
          'Time (ms)': response.timeMs,
          'Status': response.status,
          'Success': response.success
        }));
    
        // Display tabular results
        console.log('\nTabular Results:');
        console.table(tableData);
    
        // Display detailed responses
        console.log('\nDetailed Responses:');
        result.responses.forEach((response) => {
          console.log(
            `Request #${response.requestNumber}: ` +
            `Time: ${response.timeMs}ms, ` +
            `Status=${response.status}, ` +
            `Success=${response.success}` +
            (response.error ? `, Error=${response.error}` : '')
          );
        });
      } catch (error) {
        console.error('Error running load test:', error.message);
      } finally {
        rl.close(); // Close the readline interface
      }
}

runTest();