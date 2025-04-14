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

// Function to format timestamp
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toISOString().replace('T', ' ').substring(0, 19);
}

// Function to calculate response size
function getResponseSize(response) {
  // Use Content-Length header if available
  if (response && response.headers && response.headers['content-length']) {
    return parseInt(response.headers['content-length'], 10);
  }
  // Fallback: estimate size based on response data
  if (response && response.data) {
    return Buffer.byteLength(JSON.stringify(response.data), 'utf8');
  }
  return 0;
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
    totalTimeTakenMs: 0,
    firstQueryStartTime: null,
    lastQueryStartTime: null,
    totalResponseSizeBytes: 0
  };

  // Start time for the entire test
  const startTime = Date.now();

  // Create an array of request promises
  const requestPromises = Array.from({ length: totalRequests }, (_, index) => {
    return throttleRequests(async () => {
      const requestStartTime = Date.now(); // Track start time for this request

      // Record first and last query start times
      if (index === 0) {
        results.firstQueryStartTime = requestStartTime;
      }
      if (index === totalRequests - 1) {
        results.lastQueryStartTime = requestStartTime;
      }

      let responseData = {
        requestNumber: index + 1,
        timeMs: 0,
        status: 'N/A',
        success: false,
        sizeBytes: 0,
        error: null
      };

      try {
        const response = await axios.get(url, {
          timeout: 10000 // 5-second timeout
        });
        responseData.timeMs = Date.now() - requestStartTime;
        responseData.status = response.status;
        responseData.success = true;
        responseData.sizeBytes = getResponseSize(response);
        results.successfulRequests++;
        results.totalResponseSizeBytes += responseData.sizeBytes;
      } catch (error) {
        responseData.timeMs = Date.now() - requestStartTime;
        responseData.status = error.response ? error.response.status : 'N/A';
        responseData.error = error.message;
        responseData.sizeBytes = error.response ? getResponseSize(error.response) : 0;
        results.failedRequests++;
        results.totalResponseSizeBytes += responseData.sizeBytes;
      }

      // Log the result in real-time
      console.log(
        `Request #${responseData.requestNumber}: ` +
        `Time: ${responseData.timeMs}ms, ` +
        `Size=${responseData.sizeBytes} bytes, ` +
        `Status=${responseData.status}, ` +
        `Success=${responseData.success} ` +
        (responseData.error ? `, Error=${responseData.error}` : '')
      );

      // Store the response
      results.responses.push(responseData);
    });
  });

  // Execute all requests
  await Promise.all(requestPromises);

  // Calculate total time taken
  results.totalTimeTakenMs = Date.now() - startTime;

  return results;
}

// Main function to run the test
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
    console.log('\nDetailed Responses:');

    const result = await loadTest(url, totalRequests, timeWindowSeconds);

    // Prepare data for tabular output
    const tableData = result.responses.map((response) => ({
      'Request #': response.requestNumber,
      'Time (ms)': response.timeMs,
      'Size (bytes)': response.sizeBytes,
      'Status': response.status,
      'Success': response.success,
    }));

    // Display tabular results
    console.log('\nTabular Results:');
    console.table(tableData);

    // Calculate additional metrics
    const errorRate = ((result.failedRequests / result.totalRequests) * 100).toFixed(2);
    const averageResponseTimeMs = result.responses.length > 0
      ? (result.responses.reduce((sum, res) => sum + res.timeMs, 0) / result.responses.length).toFixed(2)
      : 0;
    const totalResponseSizeMB = (result.totalResponseSizeBytes / (1024 * 1024)).toFixed(2);
    const totalTimeSeconds = result.totalTimeTakenMs / 1000;
    const mbps = totalTimeSeconds > 0 ? (totalResponseSizeMB / totalTimeSeconds).toFixed(2) : 0;

    // Display summary
    console.log('\nLoad Test Summary:');
    console.log(`Total Requests Sent: ${result.totalRequests}`);
    console.log(`Time Window: ${result.timeWindowSeconds} seconds`);
    console.log(`First Query Start Time: ${formatTimestamp(result.firstQueryStartTime)}`);
    console.log(`Last Query Start Time: ${formatTimestamp(result.lastQueryStartTime)}`);
    console.log(`Successful Requests: ${result.successfulRequests}/${result.totalRequests}`);
    console.log(`Failed Requests: ${result.failedRequests}`);
    console.log(`Error Rate: ${errorRate}%`);
    console.log(`Average Response Time: ${averageResponseTimeMs}ms`);
    console.log(`Total Response Size: ${result.totalResponseSizeBytes} bytes (${totalResponseSizeMB} MB)`);
    console.log(`Throughput: ${mbps} MB/S`);
  } catch (error) {
    console.error('Error running load test:', error.message);
  } finally {
    rl.close(); // Close the readline interface
  }
}

runTest();